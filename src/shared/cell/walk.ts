import { chainText, stepText, type BaseTree, type Step, type TreeNode } from '@/core/base/tree';

/*
 * Сверка с древом. Части идут по уровням древа (в порядке из конструктора).
 * Часть есть в базе, только если она лежит внутри предыдущей: «Абакан» внутри «Хакасия».
 * Если части нет в ячейке (например, индекса в адресе проживания) — уровень пропускается: подходит любой.
 */

export interface Level {
  /** Ключ уровня. */
  k: string;
  /** Часть из ячейки; null — в ячейке её нет. */
  step: Step | null;
  /** Значение может быть только в одной ветке верхнего уровня. */
  single?: boolean;
}

export interface WalkIssue {
  level: 'error' | 'warn';
  text: string;
  /** Номер уровня. */
  at: number;
  /** Ошибка снимается подтверждением («это другое место — добавить»). */
  confirmable?: boolean;
  /** Исправление приписки: как записано в базе. */
  fix?: Step;
}

export interface WalkResult {
  /** По уровням: есть в базе / новое / нет в ячейке. */
  status: ('known' | 'new' | 'absent')[];
  issues: WalkIssue[];
  /** Что добавить в базу при подтверждении (пусто — всё уже есть). */
  addPath: Step[];
  /** Часть пути, которая уже есть в базе. */
  knownPath: Step[];
}

export function walk(tree: BaseTree, levels: Level[]): WalkResult {
  const status: WalkResult['status'] = levels.map((l) => (l.step ? 'known' : 'absent'));
  const issues: WalkIssue[] = [];
  let current: TreeNode[] = [tree.root];
  let anchor: TreeNode = tree.root;
  let newFrom = -1;

  for (let i = 0; i < levels.length; i++) {
    const { k, step } = levels[i];
    if (!step) {
      current = [...current, ...current.flatMap((n) => n.children.filter((c) => c.k === k))];
      continue;
    }
    const found = current.map((n) => tree.child(n, step.k, step.v)).filter((n): n is TreeNode => !!n);
    if (!found.length) {
      newFrom = i;
      break;
    }
    const f = found[0];
    if ((f.t ?? '') !== (step.t ?? '') || !!f.a !== !!step.a) {
      issues.push({ level: 'error', at: i, text: `В базе записано «${stepText(f)}», а здесь «${stepText(step)}»`, fix: { ...step, t: f.t, a: f.a } });
    }
    current = found;
    anchor = f;
  }

  if (newFrom < 0) return { status, issues, addPath: [], knownPath: tree.pathOf(anchor) };

  const knownPath = tree.pathOf(anchor);
  const fresh: Step[] = [];
  for (let i = newFrom; i < levels.length; i++) {
    const step = levels[i].step;
    if (!step) continue;
    status[i] = 'new';
    fresh.push(step);
  }
  const addPath = [...knownPath, ...fresh];

  // «Только в одной ветке»: такой же индекс или село уже есть в другом регионе — ошибка.
  const top = levels[0]?.step;
  if (top) {
    for (let i = newFrom; i < levels.length; i++) {
      const { step, single } = levels[i];
      if (!step || !single || i === 0) continue;
      const elsewhere = tree.all(step.k, step.v).filter((n) => {
        const t = tree.topOf(n);
        return t.k !== top.k || t.v !== top.v;
      });
      if (elsewhere.length) {
        issues.push({
          level: 'error',
          at: i,
          confirmable: true,
          text: `«${stepText(step)}» уже есть в базе в другом месте: ${chainText(tree.pathOf(elsewhere[0]))}${elsewhere.length > 1 ? ` (и ещё ${elsewhere.length - 1})` : ''}. Проверьте — или подтвердите, что это другое место`,
        });
      }
    }
  }

  return { status, issues, addPath, knownPath };
}
