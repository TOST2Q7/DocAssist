/*
 * Древо «ключ:значение» — основа базы данных DocAssist.
 *
 * Узел — это пара «ключ:значение» (например, region:Хакасия) с припиской, как она пишется в таблице («Респ.»).
 * Узел существует только внутри родителя: «Абакан» в «Хакасия» и «Абакан» в «Тыва» — разные узлы.
 *
 * Хранится древо списком путей (записей): запись [region:Регион, index:000000, locality:Примерное]
 * создаёт все три узла. Так файл легко читать, объединять и переносить между версиями.
 */

export interface Step {
  /** Ключ: идентификатор части (region, index, rso.position…). */
  k: string;
  /** Значение без приписки: «Регион», «000000». */
  v: string;
  /** Приписка, как в таблице: «Респ.», «р-н». */
  t?: string;
  /** Приписка пишется после значения («Красноярский край»). */
  a?: boolean;
}

export interface BaseEntry {
  id: string;
  path: Step[];
  addedAt: string;
  /** Кто добавил: id приложения, «base» (вручную) или «import». */
  source: string;
}

export interface TreeNode extends Step {
  /** Уникальный ключ узла (весь путь). */
  id: string;
  parent: TreeNode | null;
  children: TreeNode[];
  depth: number;
}

export const stepId = (s: Pick<Step, 'k' | 'v'>) => `${s.k}:${s.v}`;

/** Как пишется часть: «Респ. Хакасия», «Красноярский край», «000000». */
export function stepText(s: Pick<Step, 'v' | 't' | 'a'>): string {
  if (!s.t) return s.v;
  return s.a ? `${s.v} ${s.t}` : `${s.t} ${s.v}`;
}

export class BaseTree {
  readonly root: TreeNode = { k: '', v: '', id: '', parent: null, children: [], depth: 0 };
  private readonly index = new Map<string, TreeNode>();
  private readonly byKV = new Map<string, TreeNode[]>();

  constructor(readonly entries: BaseEntry[] = []) {
    this.index.set('', this.root);
    for (const e of entries) this.insert(e.path);
  }

  private insert(path: Step[]) {
    let node = this.root;
    for (const s of path) {
      const id = `${node.id}/${stepId(s)}`;
      let child = this.index.get(id);
      if (!child) {
        child = { k: s.k, v: s.v, t: s.t || undefined, a: s.a || undefined, id, parent: node, children: [], depth: node.depth + 1 };
        node.children.push(child);
        this.index.set(id, child);
        const kv = stepId(s);
        this.byKV.set(kv, [...(this.byKV.get(kv) ?? []), child]);
      }
      node = child;
    }
  }

  get size(): number {
    return this.index.size - 1;
  }

  node(id: string): TreeNode | undefined {
    return this.index.get(id);
  }

  child(node: TreeNode, k: string, v: string): TreeNode | undefined {
    return this.index.get(`${node.id}/${k}:${v}`);
  }

  /** Все узлы с такой парой «ключ:значение» в любом месте древа. */
  all(k: string, v: string): TreeNode[] {
    return this.byKV.get(`${k}:${v}`) ?? [];
  }

  /** Все узлы древа (без корня). */
  nodes(): TreeNode[] {
    return [...this.index.values()].filter((n) => n !== this.root);
  }

  pathOf(node: TreeNode): Step[] {
    const out: Step[] = [];
    for (let n: TreeNode | null = node; n && n !== this.root; n = n.parent) out.unshift({ k: n.k, v: n.v, t: n.t, a: n.a });
    return out;
  }

  /** Верхний предок узла (первый уровень древа). */
  topOf(node: TreeNode): TreeNode {
    let n = node;
    while (n.parent && n.parent !== this.root) n = n.parent;
    return n;
  }

  /** Есть ли путь целиком (буквально, уровень за уровнем). */
  has(path: Step[]): boolean {
    let node: TreeNode | undefined = this.root;
    for (const s of path) {
      node = this.child(node, s.k, s.v);
      if (!node) return false;
    }
    return true;
  }

  /**
   * Найти, докуда путь уже есть в древе. Уровни, ключей которых в пути нет, пропускаются:
   * путь «Регион → Примерное» (без индекса) найдётся внутри «Регион → 000000 → Примерное».
   */
  resolve(path: Step[]): { node: TreeNode; matched: number } {
    const keys = new Set(path.map((s) => s.k));
    let current: TreeNode[] = [this.root];
    let node = this.root;
    let matched = 0;
    for (const s of path) {
      let found: TreeNode | undefined;
      let layer = current;
      for (let depth = 0; depth < 8 && layer.length && !found; depth++) {
        found = layer.map((n) => this.child(n, s.k, s.v)).find(Boolean);
        layer = layer.flatMap((n) => n.children.filter((c) => !keys.has(c.k)));
      }
      if (!found) break;
      node = found;
      current = [found];
      matched++;
    }
    return { node, matched };
  }
}

/** «Респ. Регион → 000000 → с. Примерное». */
export function chainText(path: Step[]): string {
  return path.map(stepText).join(' → ');
}

/**
 * Удалить узел вместе со всем, что внутри. Записи, которые шли через узел, обрезаются до его родителя,
 * чтобы не пропали узлы выше.
 */
export function removeNodeFromEntries(entries: BaseEntry[], path: Step[]): BaseEntry[] {
  const n = path.length;
  const startsWith = (p: Step[]) => p.length >= n && path.every((s, i) => p[i].k === s.k && p[i].v === s.v);
  const out: BaseEntry[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const p = startsWith(e.path) ? e.path.slice(0, n - 1) : e.path;
    if (!p.length) continue;
    const key = p.map(stepId).join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p === e.path ? e : { ...e, path: p });
  }
  return out;
}
