import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openDocx, tableCells, textOf } from '../docx/docx';
import { cardFileName, cardValues, missingFields, shortInstitution } from './fields';
import { fillMemberCard, layoutCard, MAILING_MARKS, placeText } from './fill';

const template = new Uint8Array(readFileSync(new URL('./template.docx', import.meta.url)));

/** Как образец заполнения из методички (рисунок 1.12), но с нейтральными данными. */
const SAMPLE = {
  'person.lastName': 'Примеров',
  'person.firstName': 'Пример',
  'person.middleName': 'Примерович',
  'person.birthDate': '01.01.2000',
  'edu.institution': 'ФГБОУ ВО «ХГУ им. Н.Ф. Катанова», КПОИиП',
  'edu.group': 'И-12',
  'passport.issuedBy': 'МВД по Республике Регион',
  'passport.issueDate': '01.01.2014',
  'passport.series': '0000',
  'passport.number': '000000',
  'person.regAddress': '000000, Респ. Регион, р-н Районный, с. Примерное, ул. Примерная, д. 1, кв. 1',
  'person.factAddress': 'Респ. Регион, г. Примерск, ул. Примерная, д. 1, кв. 1',
  'person.phone': '8(000)000-00-00',
  'person.email': 'name@example.com',
};

const rowText = (cells: ReturnType<typeof tableCells>, row: number) => cells.filter((c) => c.row === row).map((c) => c.text);

describe('учётная карточка члена организации', () => {
  it('в бланке находятся все подписи', async () => {
    const doc = await openDocx(template);
    const layout = layoutCard(tableCells(doc.xml));
    expect(layout.notFound).toEqual([]);
    expect(layout.mailing?.text).toContain('рассылка');
  });

  it('заполняется как образец методички, сетка таблицы не меняется', async () => {
    const before = await openDocx(template);
    const out = await fillMemberCard(template, cardValues(SAMPLE), { mark: MAILING_MARKS.check });
    const doc = await openDocx(out);
    const cells = tableCells(doc.xml);
    // Та же таблица: строки, ячейки, ширины.
    expect(cells.map((c) => [c.row, c.col, c.width])).toEqual(tableCells(before.xml).map((c) => [c.row, c.col, c.width]));
    expect(rowText(cells, 3)).toEqual(['ФИО', 'Примеров Пример Примерович']);
    expect(rowText(cells, 4)).toEqual(['Дата рождения', '01.01.2000', '']);
    expect(rowText(cells, 5)).toEqual(['Место учебы', 'ФГБОУ ВО «ХГУ им. Н.Ф. Катанова», КПОИиП', 'группа', 'И-12']);
    expect(rowText(cells, 6)).toEqual(['Место работы', '', 'должность', '']);
    expect(rowText(cells, 8)).toEqual(['Выдан', 'МВД по Республике Регион']);
    expect(rowText(cells, 9)).toEqual(['Дата выдачи', '01.01.2014', 'Серия', '0000', 'Номер', '000000', '']);
    // Адрес регистрации — в две строки, перенос после запятой, как в образце.
    expect(rowText(cells, 10)[1]).toBe('000000, Респ. Регион, р-н Районный,');
    expect(rowText(cells, 11)).toEqual(['с. Примерное, ул. Примерная, д. 1, кв. 1']);
    expect(rowText(cells, 12)[1]).toBe('Респ. Регион, г. Примерск, ул. Примерная, д. 1, кв. 1');
    expect(rowText(cells, 13)).toEqual(['']);
    expect(rowText(cells, 14)).toEqual(['Конт. тел.', '8(000)000-00-00', 'е-mail', 'name@example.com', '✓ информ. рассылка']);
    // Квадрат из шрифта-символов больше нигде не встречается.
    expect(textOf(doc.xml)).not.toMatch(/[-]/);
    // Шрифт по методичке — Times New Roman 12.
    expect(doc.xml).toContain('<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/>');
    // Остальные файлы документа (картинка, стили) — без изменений.
    expect(doc.entries.map((e) => e.path)).toEqual(before.entries.map((e) => e.path));
    expect(doc.entries.find((e) => e.path === 'word/media/image1.png')?.data).toEqual(before.entries.find((e) => e.path === 'word/media/image1.png')?.data);
  });

  it('без согласия на рассылку — пустой квадрат; спецсимволы экранируются', async () => {
    const out = await fillMemberCard(template, cardValues({ ...SAMPLE, 'work.place': 'ООО «Название & Ко» <филиал>' }), { mark: MAILING_MARKS.none });
    const cells = tableCells((await openDocx(out)).xml);
    expect(rowText(cells, 6)[1]).toBe('ООО «Название & Ко» <филиал>');
    expect(rowText(cells, 14)[4]).toBe('☐ информ. рассылка');
  });

  it('номер членского билета — в шапку и в строку «Членский билет»', async () => {
    const out = await fillMemberCard(template, cardValues({ ...SAMPLE, 'rso.cardNumber': '00-00 000' }), { mark: MAILING_MARKS.box });
    const cells = tableCells((await openDocx(out)).xml);
    expect(rowText(cells, 2)[2]).toBe('00-00 000');
    expect(rowText(cells, 16)[1]).toBe('00-00 000');
    expect(rowText(cells, 14)[4]).toBe('☑ информ. рассылка');
  });

  it('слишком длинное значение отмечается', async () => {
    const layout = layoutCard(tableCells((await openDocx(template)).xml));
    const cellsOf = (field: string) => [...layout.cells].find(([s]) => s.field === field)![1];
    expect(placeText(cellsOf('edu.institution'), 'ГБПОУ РХ «ХПК»').overflow).toBe(false);
    // В бланке 2026 года ячейка «Место учебы» уже, чем в образце методички: Word перенесёт и сокращённое название.
    expect(placeText(cellsOf('edu.institution'), SAMPLE['edu.institution']).overflow).toBe(true);
    expect(placeText(cellsOf('person.regAddress'), 'Россия, '.repeat(40)).overflow).toBe(true);
    expect(placeText(cellsOf('person.phone'), SAMPLE['person.phone']).overflow).toBe(false);
    expect(placeText(cellsOf('person.email'), SAMPLE['person.email']).overflow).toBe(false);
  });

  it('недостающие поля, имя файла и сокращённое название учебного заведения', () => {
    const values = cardValues({ ...SAMPLE, 'edu.group': '', 'person.middleName': '' });
    expect(missingFields(values).map((f) => f.id)).toEqual(['edu.group']);
    expect(cardFileName(cardValues(SAMPLE))).toBe('Примеров П.П. - Учетная карточка члена организации.docx');
    expect(cardFileName(values)).toBe('Примеров П. - Учетная карточка члена организации.docx');
    expect(shortInstitution('ФГБОУ ВО «Хакасский государственный университет им. Н.Ф. Катанова», Колледж педагогического образования, информатики и права')).toBe(
      'ФГБОУ ВО «ХГУ им. Н.Ф. Катанова», КПОИиП',
    );
    expect(shortInstitution('ФГБОУ ВО "ХГУ им. Н.Ф. Катанова", КПОИиП')).toBe('ФГБОУ ВО «ХГУ им. Н.Ф. Катанова», КПОИиП');
    expect(shortInstitution(SAMPLE['edu.institution'])).toBeUndefined();
  });
});
