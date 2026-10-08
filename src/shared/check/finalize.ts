import { describeHunk, diffHunks } from './diff';
import { LEVEL_ORDER, type FieldCheck, type Issue } from './types';

/*
 * Итоговый вердикт строгой проверки.
 *
 * Значение верно, только если оно В ТОЧНОСТИ совпадает с правильной формой по шаблону.
 * Отличия, которые проверка поля уже объяснила своими замечаниями, не дублируются;
 * все остальные отличия превращаются в отдельные ошибки с подсветкой. Так ничего не проскочит,
 * даже если для какого-то огреха нет отдельного правила.
 */

const overlaps = (span: [number, number], s: number, e: number) =>
  s === e ? span[0] < s && s < span[1] : span[0] < e && s < span[1];

/** Структурные замечания (порядок частей и т.п.): мелкие отличия считаются от explainAgainst. */
export function finalize(value: string, check: FieldCheck): FieldCheck {
  const issues: Issue[] = [...check.issues];
  const canonical = check.canonical;

  if (canonical !== undefined && canonical !== value) {
    const base = check.explainAgainst ?? canonical;
    if (base !== value) {
      // Отличия, которые уже объяснены замечаниями проверки поля (например, «слиплось»), не дублируем.
      const explained = check.issues.filter((i) => i.span);
      const hunks = diffHunks(value, base).filter((h) => !explained.some((i) => overlaps(i.span!, h.start, h.end)));
      if (check.collapse && hunks.length > check.collapse.maxHunks) {
        issues.push({ code: 'template', level: 'error', category: 'format', message: `${check.collapse.message}: «${canonical}»`, span: [0, value.length], fix: canonical });
      } else {
        for (const h of hunks) {
          const d = describeHunk(h);
          issues.push({ code: 'template', level: 'error', category: d.category, message: d.message, span: [h.start, h.end], fix: canonical });
        }
      }
    }
    if (!issues.some((i) => i.level === 'error')) {
      issues.push({ code: 'template', level: 'error', category: 'format', message: 'Не совпадает с шаблоном', fix: canonical });
    }
  } else if (canonical === undefined && value.trim() !== '' && !issues.some((i) => i.level === 'error')) {
    issues.push({ code: 'template', level: 'error', category: 'format', message: 'Значение не соответствует шаблону' });
  }

  // Убираем точные повторы и упорядочиваем: ошибки, затем «подтвердить».
  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const k = `${i.code}|${i.message}|${i.span?.join(':') ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return { ...check, issues: unique };
}

/** Вспомогательные конструкторы замечаний. */
export const err = (code: string, category: Issue['category'], message: string, extra: Partial<Issue> = {}): Issue => ({
  code,
  level: 'error',
  category,
  message,
  ...extra,
});

export const confirm = (code: string, category: Issue['category'], message: string, extra: Partial<Issue> = {}): Issue => ({
  code,
  level: 'confirm',
  category,
  message,
  ...extra,
});
