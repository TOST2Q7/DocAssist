import { COUNTRIES, FORMAT_PRESETS, PART_PRESET_BY_ID, type Block, type Count } from './blocks';

/*
 * Перевод форматов версии 0.3 (regex) в блоки — только для переноса сохранённых правил.
 * Известные regex (готовые форматы 0.3) переводятся точно; простые свои — разбором: цифры, текст, варианты.
 * Что не переводится — возвращается null, и правило получает формат по умолчанию (старый regex показывается в правилах).
 */

const DATE_03 =
  '(?:(?:0[1-9]|1\\d|2[0-8])\\.(?:0[1-9]|1[0-2])|(?:29|30)\\.(?:0[13-9]|1[0-2])|31\\.(?:0[13578]|1[02]))\\.(?:19|20)\\d{2}|29\\.02\\.(?:19|20)(?:[02468][048]|[13579][26])';

/** Готовые форматы 0.3: regex → id готового формата. */
const KNOWN_03: Record<string, string> = {
  [`^(?:${DATE_03})$`]: 'date',
  [`^(?:${DATE_03}) (?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$`]: 'datetime',
  '^8\\(\\d{3}\\)\\d{3}-\\d{2}-\\d{2}$': 'phone',
  '^[a-z0-9._-]+@[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}$': 'email',
  '^\\d{3}-\\d{3}-\\d{3} \\d{2}$': 'snils',
  '^\\d{12}$': 'inn',
  '^\\d{4}$': 'series',
  '^\\d{6}$': 'number',
  '^\\d{3}-\\d{3}$': 'code',
  '^\\d{2}-\\d{2} \\d{3}$': 'card',
  '^https://vk\\.(ru|com)/[A-Za-z0-9_.]+$': 'vk',
  '^[А-ЯЁ][а-яё]+(-[А-ЯЁ][а-яё]+)*$': 'name',
  '^\\S+( \\S+)*$': 'text',
  '^«[^«»"“”„\']+»$': 'squad',
  '^(?=\\S)(?!.*\\s$)(?!.*\\s\\s)[^"“”„\']+$': 'quoted',
  '^\\d{2}\\.\\d{2}\\.\\d{2} [А-ЯЁ][^\\s]*( \\S+)*$': 'specialty',
  '^(1|2|3|4|5|6)$': 'course',
  '^\\S+$': 'group',
  '^(Мужской|Женский)$': 'gender',
  '^(очная|заочная|очно-заочная)$': 'form',
  '^(Да|Нет)$': 'yesno',
};

/** Форматы частей конструктора 0.3. */
const KNOWN_PARTS_03: Record<string, string> = {
  '^[А-ЯЁ0-9][А-Яа-яЁё0-9-]*( [А-Яа-яЁё0-9-]+)*$': 'place',
  '^\\d+[а-я]?(/\\d+[а-я]?)?$': 'house',
  '^\\d+[а-я]?$': 'flat',
  [`^(${COUNTRIES.join('|')})$`]: 'country',
};

const PRESET_03 = new Map(FORMAT_PRESETS.map((p) => [p.id, p]));

const count = (min: number, max: number | null): Count => ({ min, max });

/** Простой свой regex → блоки: «^8\(\d{3}\)\d{3}$», «^(а|б)$», «^\d{2,4}$». */
function parseSimple(body: string): Block[] | null {
  // Варианты целиком: «(а|б|в)» — числа подряд становятся «Число от … до …».
  const alt = /^\((?:\?:)?([^()[\]\\^$*+?{}.]+(?:\|[^()[\]\\^$*+?{}.]+)+)\)$/.exec(body);
  if (alt) {
    const opts = alt[1].split('|');
    const nums = opts.every((o) => /^(0|[1-9]\d*)$/.test(o)) ? opts.map(Number) : null;
    if (nums && nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)) return [{ type: 'number', from: nums[0], to: nums[nums.length - 1] }];
    return [{ type: 'oneof', options: opts }];
  }
  // Ловушка 0.3: «[1-11]» задумывалось как «число от 1 до 11».
  const range = /^\[(\d+)-(\d+)\]$/.exec(body);
  if (range && range[2].length > 1) return [{ type: 'number', from: Number(range[1]), to: Number(range[2]) }];

  const out: Block[] = [];
  const pushText = (ch: string) => {
    const last = out[out.length - 1];
    if (ch === ' ') out.push({ type: 'space' });
    else if (last?.type === 'text' && !last.optional) last.text += ch;
    else out.push({ type: 'text', text: ch });
  };
  let i = 0;
  while (i < body.length) {
    const rest = body.slice(i);
    const digits = /^\\d(?:\{(\d+)(?:,(\d*))?\}|([+*?]))?/.exec(rest);
    if (digits) {
      const [, a, b, q] = digits;
      let c: Count;
      if (a !== undefined) c = count(Number(a), b === undefined ? Number(a) : b === '' ? null : Number(b));
      else if (q === '+') c = count(1, null);
      else if (q === '*') c = count(0, null);
      else if (q === '?') c = count(0, 1);
      else c = count(1, 1);
      const last = out[out.length - 1];
      // «\d\d\d» → «Цифры 3».
      if (last?.type === 'digits' && c.max === c.min && last.count.max === last.count.min && !q && a === undefined) last.count = count(last.count.min + 1, last.count.max! + 1);
      else out.push({ type: 'digits', count: c });
      i += digits[0].length;
      continue;
    }
    const esc = /^\\([.()[\]{}+*?^$|/\\-])/.exec(rest);
    if (esc) {
      pushText(esc[1]);
      i += 2;
      continue;
    }
    if (/^[^\\()[\]{}+*?^$|.]/.test(rest)) {
      // Символ с «?» после — необязательный.
      if (rest[1] === '?') {
        out.push(rest[0] === ' ' ? { type: 'space', optional: true } : { type: 'text', text: rest[0], optional: true });
        i += 2;
        continue;
      }
      if (/^[+*{]/.test(rest.slice(1))) return null;
      pushText(rest[0]);
      i += 1;
      continue;
    }
    return null;
  }
  return out.length ? out : null;
}

/**
 * Regex версии 0.3 → блоки. null — не переводится (сложный regex).
 * parts — формат части конструктора (адрес, место рождения).
 */
export function regexToBlocks(regex: string, parts = false): Block[] | null {
  const re = regex.trim();
  if (!re) return [];
  const partId = KNOWN_PARTS_03[re];
  if (partId) return structuredClone(PART_PRESET_BY_ID.get(partId)!.blocks);
  const id = KNOWN_03[re];
  if (id) {
    // В частях конструктора «^\d{6}$» — индекс, а не номер паспорта: блоки те же.
    if (parts && id === 'number') return structuredClone(PART_PRESET_BY_ID.get('index')!.blocks);
    return structuredClone(PRESET_03.get(id)!.blocks);
  }
  if (!re.startsWith('^') || !re.endsWith('$') || re.endsWith('\\$')) return null;
  return parseSimple(re.slice(1, -1));
}
