/*
 * ФИО для документов: склонение («от кого» — Иванова Ивана Ивановича, «кому» — Петрову Петру Петровичу),
 * краткие формы («Иванов И. И.», «И. И. Иванов») и пол по отчеству или имени.
 * Склонение — по обычным правилам русских имён; то, что правила не знают, остаётся как есть.
 */

export type Gender = 'm' | 'f';
export type NameCase = 'gen' | 'dat';

const VOWELS = 'аеёиоуыэюя';
/** После этих букв пишется «и», а не «ы»: Ольги, Никиты → но Ольги. */
const HUSHING = 'гкхжчшщ';

/** Мужские имена на «-а»/«-я». */
const MALE_A = new Set(['никита', 'илья', 'фома', 'лука', 'савва', 'кузьма', 'данила', 'гаврила', 'фока', 'добрыня', 'миша', 'саша', 'женя', 'ваня', 'коля', 'петя', 'дима', 'вова', 'серёжа', 'сережа', 'лёша', 'леша']);
/** Имена с беглой гласной или «ё». */
const NAME_STEMS: Record<string, string> = { лев: 'льв', пётр: 'петр', павел: 'павл' };

const isInitial = (w: string) => /^[А-ЯЁA-Z]\.(?:[А-ЯЁA-Z]\.)*$/.test(w);
const isWord = (w: string) => /^[\p{L}-]+$/u.test(w) && !isInitial(w);

/** Сохранить регистр первой буквы исходного слова. */
function keepCase(src: string, out: string): string {
  if (src === src.toUpperCase() && src.length > 1) return out.toUpperCase();
  return /^\p{Lu}/u.test(src) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

/** Окончание «ы» или «и» для слова на «-а»: Анны, Ольги. */
const aGen = (stem: string) => (HUSHING.includes(stem.slice(-1)) ? 'и' : 'ы');

export function declineSurname(word: string, c: NameCase, g: Gender): string {
  if (word.includes('-')) return word.split('-').map((p) => declineSurname(p, c, g)).join('-');
  const w = word.toLowerCase();
  const end = (s: string) => w.endsWith(s);
  const cut = (n: number, add: string) => keepCase(word, w.slice(0, w.length - n) + add);
  if (g === 'f') {
    if (/(ова|ева|ёва|ина|ына)$/.test(w)) return cut(1, 'ой');
    if (end('ая')) return cut(2, 'ой');
    if (end('яя')) return cut(2, 'ей');
    if (end('ия')) return cut(1, c === 'gen' ? 'и' : 'и');
    if (end('а') && !VOWELS.includes(w.slice(-2, -1))) return cut(1, c === 'gen' ? aGen(w.slice(0, -1)) : 'е');
    if (end('я')) return cut(1, c === 'gen' ? 'и' : 'е');
    return word;
  }
  if (/(ых|их)$/.test(w)) return word; // Черных, Седых — не склоняются
  if (/(ов|ев|ёв|ин|ын)$/.test(w)) return cut(0, c === 'gen' ? 'а' : 'у');
  if (/(ский|цкий|ской|цкой)$/.test(w) || /[гкх]ий$/.test(w)) return cut(2, c === 'gen' ? 'ого' : 'ому');
  if (end('ый') || end('ой')) return cut(2, c === 'gen' ? 'ого' : 'ому');
  if (end('ий')) return cut(2, c === 'gen' ? 'его' : 'ему');
  if (end('ь') || end('й')) return cut(1, c === 'gen' ? 'я' : 'ю');
  if (end('ия')) return cut(1, c === 'gen' ? 'и' : 'и');
  if (end('а') && !VOWELS.includes(w.slice(-2, -1))) return cut(1, c === 'gen' ? aGen(w.slice(0, -1)) : 'е');
  if (end('я')) return cut(1, c === 'gen' ? 'и' : 'е');
  if (VOWELS.includes(w.slice(-1))) return word; // Шевченко, Дурново
  return cut(0, c === 'gen' ? 'а' : 'у');
}

export function declineFirstName(word: string, c: NameCase, g: Gender): string {
  if (word.includes('-')) return word.split('-').map((p) => declineFirstName(p, c, g)).join('-');
  const w = word.toLowerCase();
  const cut = (n: number, add: string) => keepCase(word, w.slice(0, w.length - n) + add);
  if (end(w, 'ия')) return cut(1, 'и');
  if (end(w, 'а')) return cut(1, c === 'gen' ? aGen(w.slice(0, -1)) : 'е');
  if (end(w, 'я')) return cut(1, c === 'gen' ? 'и' : 'е');
  if (g === 'f') return end(w, 'ь') ? cut(1, 'и') : word;
  if (end(w, 'й') || end(w, 'ь')) return cut(1, c === 'gen' ? 'я' : 'ю');
  if (VOWELS.includes(w.slice(-1))) return word;
  const stem = NAME_STEMS[w] ?? w;
  return keepCase(word, stem + (c === 'gen' ? 'а' : 'у'));
}

function end(w: string, s: string) {
  return w.endsWith(s);
}

export function declinePatronymic(word: string, c: NameCase): string {
  const w = word.toLowerCase();
  if (w.endsWith('ич')) return keepCase(word, w + (c === 'gen' ? 'а' : 'у'));
  if (w.endsWith('на')) return keepCase(word, w.slice(0, -1) + (c === 'gen' ? 'ы' : 'е'));
  return word;
}

/** Пол по отчеству, затем по имени, затем по фамилии. */
export function guessGender(parts: { last?: string; first?: string; middle?: string }): Gender | null {
  const m = parts.middle?.toLowerCase() ?? '';
  if (/(вна|чна|кызы|гызы)$/.test(m)) return 'f';
  if (/(ич|оглы|улы)$/.test(m)) return 'm';
  const f = parts.first?.toLowerCase() ?? '';
  if (f) {
    if (MALE_A.has(f)) return 'm';
    if (/[ая]$/.test(f)) return 'f';
    if (/[бвгджзклмнпрстфхцчшщй]$/.test(f)) return 'm';
  }
  const l = parts.last?.toLowerCase() ?? '';
  if (/(ова|ева|ёва|ина|ына|ская|цкая|ая)$/.test(l)) return 'f';
  if (/(ов|ев|ёв|ин|ын|ский|цкий|ой|ый)$/.test(l)) return 'm';
  return null;
}

/** Пол из поля «Пол» анкеты: «Мужской»/«Женский» (или «М»/«Ж»). */
export function genderFromField(v: string | undefined): Gender | null {
  const s = (v ?? '').trim().toLowerCase();
  if (s.startsWith('ж')) return 'f';
  if (s.startsWith('м')) return 'm';
  return null;
}

interface Parsed {
  /** Слова и инициалы по порядку. */
  words: string[];
  last: number;
  first: number;
  middle: number;
}

/** Разобрать «Фамилия Имя Отчество», «Фамилия И. О.» или «И. О. Фамилия». */
function parse(text: string): Parsed {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const full = words.map((w, i) => (isWord(w) ? i : -1)).filter((i) => i >= 0);
  if (!full.length) return { words, last: -1, first: -1, middle: -1 };
  // Инициалы впереди — «И. О. Фамилия»: фамилия последняя.
  if (isInitial(words[0])) return { words, last: full[full.length - 1], first: -1, middle: -1 };
  return { words, last: full[0], first: full[1] ?? -1, middle: full[2] ?? -1 };
}

/** Просклонять ФИО (полное или с инициалами). Пол не задан — по отчеству, имени или фамилии. */
export function declineFio(text: string, c: NameCase, gender?: Gender | null): string {
  const p = parse(text);
  if (p.last < 0) return text;
  const at = (i: number) => (i >= 0 ? p.words[i] : undefined);
  const g = gender ?? guessGender({ last: at(p.last), first: at(p.first), middle: at(p.middle) }) ?? 'm';
  return p.words
    .map((w, i) => {
      if (i === p.last) return declineSurname(w, c, g);
      if (i === p.first) return declineFirstName(w, c, g);
      if (i === p.middle) return declinePatronymic(w, c);
      return w;
    })
    .join(' ');
}

const initial = (w?: string) => (w ? `${w.charAt(0).toUpperCase()}.` : '');

/** «Иванов И. И.» */
export function shortFio(text: string): string {
  const p = parse(text);
  if (p.last < 0 || p.first < 0) return text.trim();
  return [p.words[p.last], [initial(p.words[p.first]), initial(p.words[p.middle])].filter(Boolean).join(' ')].join(' ');
}

/** «И. И. Иванов» — для подписи. */
export function signFio(text: string): string {
  const p = parse(text);
  if (p.last < 0) return text.trim();
  if (p.first < 0) {
    // Уже «И. О. Фамилия» или «Фамилия И. О.»: инициалы вперёд.
    const inits = p.words.filter(isInitial).join(' ');
    return [inits, p.words[p.last]].filter(Boolean).join(' ');
  }
  return [initial(p.words[p.first]), initial(p.words[p.middle]), p.words[p.last]].filter(Boolean).join(' ');
}
