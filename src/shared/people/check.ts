import { capitalizeWord } from '../text/text';
import { confirm, err } from '../check/finalize';
import type { FieldCheck } from '../check/types';
import { builtinFirstName, builtinPatronymic, norm, type Gender } from './names';

/*
 * Строгая проверка ФИО.
 * Правильная форма: только русские буквы, каждая часть с заглавной буквы, двойные части через дефис
 * без пробелов («Иванова-Петрова»). Для имени и отчества — сверка со справочником.
 */

export type NamePart = 'last' | 'first' | 'middle';

export interface NameDictionaries {
  /** Подтверждённые пользователем имена и отчества (в нижнем регистре, ё→е). */
  firstNames: Set<string>;
  patronymics: Set<string>;
}

const LABEL: Record<NamePart, string> = { last: 'Фамилия', first: 'Имя', middle: 'Отчество' };
const LAT = 'aceopxykmhbtACEHKMOPTXYB';
const CYR = 'асеорхукмнвтАСЕНКМОРТХУВ';
const SUFFIX = /^(оглы|кызы|улы|уулу|гызы)$/i;

export const NAME_DICT: Record<'first' | 'middle', string> = { first: 'person.firstNames', middle: 'person.patronymics' };

export function checkNamePart(value: string, part: NamePart, dicts: NameDictionaries): FieldCheck & { gender?: Gender } {
  const label = LABEL[part];
  if (!value.trim()) {
    return part === 'middle'
      ? { canonical: '', issues: [confirm('empty', 'missing', 'Отчество не указано. Если отчества нет — подтвердите («Принять как есть»)')] }
      : { issues: [err('empty', 'missing', `${label}: не заполнено`)] };
  }
  // Латинские буквы-двойники → русские; лишние пробелы и пробелы вокруг дефиса убираем.
  const cleaned = [...value]
    .map((c) => (LAT.includes(c) ? CYR[LAT.indexOf(c)] : c))
    .join('')
    .replace(/[\s ]+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim();
  const bad = [...value.matchAll(/[^А-Яа-яЁё\s \-a-zA-Z]/g)];
  const badLatin = [...cleaned.matchAll(/[a-zA-Z]/g)];
  if (bad.length || badLatin.length) {
    const chars = [...new Set([...bad.map((m) => m[0]), ...badLatin.map((m) => m[0])])].join(' ');
    return {
      issues: bad.map((m) => err('name-chars', 'chars', `Недопустимый символ «${m[0]}»: допустимы только русские буквы и дефис`, { span: [m.index!, m.index! + 1] })).concat(
        badLatin.length && !bad.length ? [err('name-chars', 'chars', `Недопустимые символы: ${chars}`)] : [],
      ),
    };
  }
  const words = cleaned.split(' ');
  const isSuffix = (w: string, i: number) => part === 'middle' && i === words.length - 1 && i > 0 && SUFFIX.test(w);
  if (words.length > 1 && !(part === 'middle' && words.length === 2 && SUFFIX.test(words[1]))) {
    return { issues: [err('name-spaces', 'format', `${label}: должно быть одно слово (двойные — через дефис без пробелов)`)] };
  }
  const canonical = words.map((w, i) => (isSuffix(w, i) ? w.toLowerCase() : capitalizeWord(w))).join(' ');
  if (canonical.replace(/[-\s]/g, '').length < 2) return { issues: [err('name-short', 'format', `${label}: слишком короткое`)] };

  const issues = [];
  let gender: Gender | undefined;
  if (part === 'first') {
    gender = builtinFirstName(canonical);
    if (!gender && !dicts.firstNames.has(norm(canonical))) {
      issues.push(
        confirm('name-unknown', 'dictionary', `Имени «${canonical}» нет в справочнике — проверьте написание и подтвердите`, {
          action: { kind: 'add-word', dict: NAME_DICT.first, value: canonical, label: `Имя: ${canonical}` },
        }),
      );
    }
  }
  if (part === 'middle') {
    const base = canonical.split(' ')[0];
    gender = builtinPatronymic(base);
    if (!gender && !dicts.patronymics.has(norm(canonical))) {
      issues.push(
        confirm('patronymic-unknown', 'dictionary', `Отчества «${canonical}» нет в справочнике — проверьте написание и подтвердите`, {
          action: { kind: 'add-word', dict: NAME_DICT.middle, value: canonical, label: `Отчество: ${canonical}` },
        }),
      );
    }
  }
  return { canonical, issues, gender };
}
