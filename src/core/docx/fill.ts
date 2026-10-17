import { readZip, writeZip } from '../util/zip';
import { escapeXml, fromUtf8, unescapeXml, utf8 } from './xml';

/*
 * Заполнение своего шаблона Word: в тексте документа пишутся метки в фигурных скобках — {ФИО}, {Дата перевода} —
 * и заменяются значениями. Word часто разбивает набранный текст на несколько кусков (из-за проверки орфографии
 * или правок) — метка всё равно находится, если она целиком внутри одного абзаца.
 * Оформление сохраняется: значение получает оформление первой буквы метки.
 */

/** Значение метки или undefined — метка неизвестна и остаётся как есть. */
export type Resolver = (key: string) => string | undefined;

export interface FillResult {
  data: Uint8Array;
  /** Какие метки заменены. */
  used: string[];
  /** Метки, для которых нет значения (остались в документе). */
  missing: string[];
}

const PLACEHOLDER = /\{([^{}]{1,80})\}/g;

/** Метка из текста: без лишних и неразрывных пробелов. */
export const normalizeKey = (key: string) => key.replace(/[\s ]+/g, ' ').trim();

interface TextNode {
  start: number;
  end: number;
  open: string;
  text: string;
  changed: boolean;
}

/** Заменить метки в XML одной части документа. */
export function fillXml(xml: string, resolve: Resolver, used: Set<string>, missing: Set<string>): string {
  const groups: TextNode[][] = [[]];
  const re = /(<w:t(?:\s[^>]*)?>)([^<]*)<\/w:t>|<\/w:p>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (!m[1]) {
      groups.push([]);
      continue;
    }
    groups[groups.length - 1].push({ start: m.index, end: m.index + m[0].length, open: m[1], text: unescapeXml(m[2]), changed: false });
  }

  for (const nodes of groups) {
    if (!nodes.length) continue;
    const offsets: number[] = [];
    let full = '';
    for (const n of nodes) {
      offsets.push(full.length);
      full += n.text;
    }
    if (!full.includes('{')) continue;
    const reps: { from: number; to: number; value: string }[] = [];
    for (const m of full.matchAll(PLACEHOLDER)) {
      const key = normalizeKey(m[1]);
      if (!key) continue;
      const value = resolve(key);
      if (value === undefined) {
        missing.add(key);
        continue;
      }
      used.add(key);
      reps.push({ from: m.index!, to: m.index! + m[0].length, value });
    }
    const nodeAt = (pos: number) => {
      let i = 0;
      while (i + 1 < nodes.length && offsets[i + 1] <= pos) i++;
      return i;
    };
    // С конца, чтобы позиции ещё не обработанных меток не сдвигались.
    for (const r of reps.reverse()) {
      const a = nodeAt(r.from);
      const b = nodeAt(r.to - 1);
      if (a === b) {
        const n = nodes[a];
        n.text = n.text.slice(0, r.from - offsets[a]) + r.value + n.text.slice(r.to - offsets[a]);
        n.changed = true;
        continue;
      }
      nodes[a].text = nodes[a].text.slice(0, r.from - offsets[a]) + r.value;
      nodes[a].changed = true;
      for (let i = a + 1; i < b; i++) {
        nodes[i].text = '';
        nodes[i].changed = true;
      }
      nodes[b].text = nodes[b].text.slice(r.to - offsets[b]);
      nodes[b].changed = true;
    }
  }

  const changed = groups.flat().filter((n) => n.changed);
  if (!changed.length) return xml;
  let out = '';
  let at = 0;
  for (const n of changed) {
    const open = /xml:space=/.test(n.open) ? n.open : n.open.replace(/^<w:t/, '<w:t xml:space="preserve"');
    // Перенос строки в значении — перенос строки в документе.
    const body = escapeXml(n.text).replace(/\r?\n/g, `</w:t><w:br/>${open}`);
    out += xml.slice(at, n.start) + open + body + '</w:t>';
    at = n.end;
  }
  return out + xml.slice(at);
}

/** Части документа, где бывает текст: основной текст, колонтитулы, сноски. */
const TEXT_PART = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/** Заполнить шаблон .docx. */
export async function fillDocx(bytes: Uint8Array, resolve: Resolver): Promise<FillResult> {
  const entries = await readZip(bytes);
  if (!entries.some((e) => e.path === 'word/document.xml')) throw new Error('Это не документ Word (.docx)');
  const used = new Set<string>();
  const missing = new Set<string>();
  const out = entries.map((e) => (TEXT_PART.test(e.path) ? { ...e, data: utf8(fillXml(fromUtf8(e.data), resolve, used, missing)) } : e));
  return { data: writeZip(out), used: [...used], missing: [...missing] };
}

/** Какие метки есть в шаблоне (чтобы показать, что будет заполнено). */
export async function docxPlaceholders(bytes: Uint8Array): Promise<string[]> {
  const found = new Set<string>();
  await fillDocx(bytes, (key) => {
    found.add(key);
    return undefined;
  });
  return [...found];
}
