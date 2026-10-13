import type { DocBlock, Run, TableCell } from '@/core/docx/write';
import { buildDocx } from '@/core/docx/write';
import { fioText, type PersonRecord } from '@/core/people/people';
import { FIELD_BY_ID } from '@/core/schema/fields';
import type { PersonCase } from './cases';
import { FIELD_GROUPS } from './groups';

/*
 * Личная карточка бойца: фото, все данные по разделам, достижения и история переводов.
 * Пустые поля остаются в карточке — видно, чего не хватает (можно дописать от руки).
 */

const SIZE = 12;

export function cardBlocks(record: Pick<PersonRecord, 'fields'>, c?: Pick<PersonCase, 'achievements' | 'transfers'>, photo?: Uint8Array): DocBlock[] {
  const f = record.fields;
  const v = (id: string) => f[id] ?? '';
  const blocks: DocBlock[] = [{ type: 'p', text: 'Личная карточка бойца', align: 'center', bold: true, size: 16, after: 12 }];

  const info: Run[] = [{ text: fioText(f) || '(без ФИО)', bold: true, size: 14 }];
  const line = (label: string, value: string) => value && info.push({ text: `\n${label}: `, size: SIZE }, { text: value, size: SIZE, bold: true });
  line('Дата рождения', v('person.birthDate'));
  line('Отряд', v('rso.squad'));
  line('Должность', v('rso.position'));
  line('Направление', v('rso.direction'));
  line('Региональное отделение', v('rso.branch'));
  line('Членский билет', v('rso.cardNumber'));
  const photoCell: TableCell = photo ? { image: { data: photo, widthMm: 30 } } : { text: 'место\nдля фото\n3×4', align: 'center' };
  blocks.push({ type: 'table', borders: false, widths: [38, 127], rows: [[photoCell, { runs: info }]] }, { type: 'p' });

  const rows: TableCell[][] = [];
  for (const g of FIELD_GROUPS) {
    rows.push([{ text: g.title, span: 2, bold: true }]);
    for (const id of g.ids) rows.push([FIELD_BY_ID.get(id)?.label ?? id, v(id)]);
  }
  blocks.push({ type: 'table', widths: [2, 3], size: SIZE, rows });

  const achievements = c?.achievements ?? [];
  if (achievements.length) {
    blocks.push({ type: 'p' }, { type: 'p', text: 'Достижения', bold: true, keepNext: true });
    blocks.push({
      type: 'table',
      header: true,
      size: SIZE,
      widths: [1, 4, 2],
      rows: [['Дата', 'Достижение', 'Уровень'], ...achievements.map((a) => [a.date, a.title, a.level ?? ''])],
    });
  }
  const transfers = c?.transfers ?? [];
  if (transfers.length) {
    blocks.push({ type: 'p' }, { type: 'p', text: 'Переводы', bold: true, keepNext: true });
    blocks.push({
      type: 'table',
      header: true,
      size: SIZE,
      widths: [1, 3, 3, 1],
      rows: [
        ['Дата', 'Из отряда', 'В отряд', 'Состоялся'],
        ...transfers.map((t) => [t.date, [t.from.squad, t.from.branch].filter(Boolean).join(', '), [t.to.squad, t.to.branch].filter(Boolean).join(', '), t.status === 'done' ? 'да' : 'нет']),
      ],
    });
  }
  return blocks;
}

export function cardDocx(record: Pick<PersonRecord, 'fields'>, c?: Pick<PersonCase, 'achievements' | 'transfers'>, photo?: Uint8Array): Uint8Array {
  return buildDocx(cardBlocks(record, c, photo), { margins: { top: 15, right: 15, bottom: 15, left: 25 } });
}
