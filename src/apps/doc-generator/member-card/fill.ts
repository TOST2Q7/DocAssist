import { cellAfter, findLabel, nextRowCell, openDocx, runXml, saveDocx, tableCells, writeCells, type Cell, type CellWrite } from '../docx/docx';
import { cellCapacity, fits, splitLines } from '../docx/measure';
import { fullName, type CardValues } from './fields';

/*
 * Заполнение шаблона учётной карточки. Значение пишется в ячейку справа от подписи
 * («ФИО», «Серия»…), длинный адрес продолжается в пустой строке под ним — как в образце методички.
 * Ячейки ищутся по подписям, поэтому обновлённый бланк с той же разметкой тоже подойдёт.
 */

export interface Slot {
  /** Поле карточки ('fio' — ФИО целиком). */
  field: string;
  /** Подпись в бланке, справа от которой пишется значение. */
  label: string;
  /** Продолжение — в строке ниже. */
  wrap?: boolean;
}

export const SLOTS: Slot[] = [
  { field: 'rso.cardNumber', label: '№ членского билета' },
  { field: 'fio', label: 'ФИО' },
  { field: 'person.birthDate', label: 'Дата рождения' },
  { field: 'edu.institution', label: 'Место учебы' },
  { field: 'edu.group', label: 'группа' },
  { field: 'work.place', label: 'Место работы' },
  { field: 'work.position', label: 'должность' },
  { field: 'passport.issuedBy', label: 'Выдан' },
  { field: 'passport.issueDate', label: 'Дата выдачи' },
  { field: 'passport.series', label: 'Серия' },
  { field: 'passport.number', label: 'Номер' },
  { field: 'person.regAddress', label: 'Адрес (постоянная регистрация) с индексом', wrap: true },
  { field: 'person.factAddress', label: 'Адрес фактического места жительства', wrap: true },
  { field: 'person.phone', label: 'Конт. тел.' },
  { field: 'person.email', label: 'e-mail' },
  { field: 'rso.cardNumber', label: '№' },
];

/** Знаки для «информ. рассылка»: галочка (по умолчанию), галочка в квадрате (как в образце методички), пустой квадрат. */
export const MAILING_MARKS = { check: '✓', box: '☑', none: '☐' } as const;
/** Шрифт со знаками галочек — есть в Windows; Word и LibreOffice подберут замену, если его нет. */
const MARK_FONT = 'Segoe UI Symbol';

export interface CardLayout {
  /** Ячейки для каждого места: одна, у адресов — две. */
  cells: Map<Slot, Cell[]>;
  /** Ячейки с подписями мест. */
  labels: Map<Slot, Cell>;
  /** Ячейка «информ. рассылка». */
  mailing?: Cell;
  /** Подписи, которых нет в бланке. */
  notFound: string[];
}

export function layoutCard(cells: Cell[]): CardLayout {
  const out: CardLayout = { cells: new Map(), labels: new Map(), notFound: [] };
  for (const slot of SLOTS) {
    const label = findLabel(cells, slot.label);
    const first = label && cellAfter(cells, label);
    if (!first) {
      out.notFound.push(slot.label);
      continue;
    }
    out.labels.set(slot, label);
    const next = slot.wrap ? nextRowCell(cells, label) : undefined;
    // Строка ниже подходит для продолжения, только если она пустая.
    out.cells.set(slot, next && !next.text.trim() && !cellAfter(cells, next) ? [first, next] : [first]);
  }
  out.mailing = cells.find((c) => /рассылк/i.test(c.text));
  if (!out.mailing) out.notFound.push('информ. рассылка');
  return out;
}

/** Ячейки, куда пишется поле (первое его место в бланке). */
export function cellsFor(layout: CardLayout, field: string): Cell[] | undefined {
  for (const [slot, cells] of layout.cells) if (slot.field === field) return cells;
  return undefined;
}

/** Ячейка с подписью места (первое место поля в бланке). */
export function labelFor(layout: CardLayout, field: string): Cell | undefined {
  for (const [slot, cell] of layout.labels) if (slot.field === field) return cell;
  return undefined;
}

/** Текст для места в карточке. */
export function slotText(values: CardValues, field: string): string {
  return (field === 'fio' ? fullName(values) : (values[field] ?? '')).replace(/\s+/g, ' ').trim();
}

export interface Placed {
  /** Текст по строкам карточки. */
  lines: string[];
  /** Не помещается: Word перенесёт текст внутри ячейки, и строка бланка станет выше. */
  overflow: boolean;
}

/** Как значение ляжет в ячейки карточки. */
export function placeText(cells: Cell[], text: string): Placed {
  const caps = cells.map((c) => cellCapacity(c.width));
  if (!text) return { lines: [], overflow: false };
  if (caps.length === 1) return { lines: [text], overflow: !fits(text, caps[0]) };
  return splitLines(text, caps);
}

export interface FillOptions {
  /** Знак у «информ. рассылка». */
  mark: string;
}

export async function fillMemberCard(template: Uint8Array, values: CardValues, opts: FillOptions): Promise<Uint8Array> {
  const doc = await openDocx(template);
  const cells = tableCells(doc.xml);
  const layout = layoutCard(cells);
  const writes: CellWrite[] = [];
  for (const [slot, targets] of layout.cells) {
    const { lines } = placeText(targets, slotText(values, slot.field));
    targets.forEach((cell, i) => writes.push({ cell, runs: lines[i] ? runXml(lines[i]) : '' }));
  }
  if (layout.mailing) {
    // Квадрат из шрифта-символов (в бланке он часто виден как пустой прямоугольник) меняется на обычный знак.
    const label = layout.mailing.text.replace(/^[^\p{L}]+/u, '').trim() || 'информ. рассылка';
    writes.push({ cell: layout.mailing, runs: runXml(opts.mark, { font: MARK_FONT }) + runXml(` ${label}`) });
  }
  doc.xml = writeCells(doc.xml, writes);
  return saveDocx(doc);
}
