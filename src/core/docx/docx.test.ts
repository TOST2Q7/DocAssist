import { describe, expect, it } from 'vitest';
import { readZip, writeZip } from '../util/zip';
import { docxPlaceholders, fillDocx, fillXml } from './fill';
import { imageInfo } from './image';
import { buildDocx } from './write';
import { fromUtf8, utf8 } from './xml';

/** Самый маленький PNG 3×4 (заголовок с размерами — остальное не нужно для проверки). */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}

/** JPEG с маркером APP0 и SOF0 нужного размера. */
function jpeg(w: number, h: number): Uint8Array {
  const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0xff, 0xd9]);
  return b;
}

const part = async (docx: Uint8Array, path: string) => {
  const e = (await readZip(docx)).find((x) => x.path === path);
  return e ? fromUtf8(e.data) : undefined;
};

/** .docx с одним абзацем — как его сохраняет Word: текст порезан на куски. */
function wordDoc(paragraphXml: string): Uint8Array {
  const doc = `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${paragraphXml}</w:body></w:document>`;
  return writeZip([
    { path: '[Content_Types].xml', data: utf8('<Types/>') },
    { path: 'word/document.xml', data: utf8(doc) },
    { path: 'word/footer1.xml', data: utf8('<w:ftr xmlns:w="w"><w:p><w:r><w:t>{ФИО}</w:t></w:r></w:p></w:ftr>') },
  ]);
}

describe('картинки', () => {
  it('размер PNG и JPEG по байтам', () => {
    expect(imageInfo(png(300, 400))).toEqual({ type: 'png', width: 300, height: 400 });
    expect(imageInfo(jpeg(600, 800))).toEqual({ type: 'jpeg', width: 600, height: 800 });
    expect(imageInfo(utf8('%PDF-1.4'))).toBeNull();
  });
});

describe('документ Word из блоков', () => {
  it('собирает пакет с текстом, таблицей и фото', async () => {
    const docx = buildDocx([
      { type: 'p', text: 'Командиру отряда\nот бойца', indentLeft: 90 },
      { type: 'p', text: 'Заявление', align: 'center', bold: true },
      { type: 'p', text: 'Прошу перевести меня & <других>', firstLine: 12.5, align: 'both' },
      { type: 'table', rows: [['Фамилия', 'Примеров'], [{ text: 'Фото', span: 2 }]], widths: [1, 2] },
      { type: 'image', image: { data: png(300, 400), widthMm: 30 } },
      { type: 'p', text: '01.01.2026\t__________', rightTab: true },
    ]);
    const entries = await readZip(docx);
    expect(entries[0].path).toBe('[Content_Types].xml');
    expect(entries.map((e) => e.path)).toContain('word/media/image1.png');
    const xml = (await part(docx, 'word/document.xml'))!;
    expect(xml).toContain('Командиру отряда</w:t><w:br/>');
    expect(xml).toContain('&amp; &lt;других&gt;');
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain('<w:gridSpan w:val="2"/>');
    // 30 × 40 мм — пропорции картинки 3:4.
    expect(xml).toContain('cx="1080000" cy="1440000"');
    expect(xml).toMatch(/<w:tab\/>/);
    expect(await part(docx, 'word/_rels/document.xml.rels')).toContain('media/image1.png');
  });

  it('не вставляет то, что не картинка', async () => {
    const docx = buildDocx([{ type: 'image', image: { data: utf8('not an image'), widthMm: 30 } }]);
    expect((await readZip(docx)).some((e) => e.path.startsWith('word/media/'))).toBe(false);
  });
});

describe('заполнение шаблона Word', () => {
  const values: Record<string, string> = { ФИО: 'Примеров Пример Примерович', 'Дата перевода': '01.09.2026', Адрес: 'строка 1\nстрока 2', 'A&B': '<&>' };
  const resolve = (k: string) => values[k];

  it('метка целиком в одном куске', () => {
    const used = new Set<string>();
    const missing = new Set<string>();
    const xml = fillXml('<w:p><w:r><w:t>Я, {ФИО}, прошу</w:t></w:r></w:p>', resolve, used, missing);
    expect(xml).toBe('<w:p><w:r><w:t xml:space="preserve">Я, Примеров Пример Примерович, прошу</w:t></w:r></w:p>');
    expect([...used]).toEqual(['ФИО']);
  });

  it('метка разбита Word на несколько кусков — находится и заменяется', () => {
    const xml = fillXml(
      '<w:p><w:r><w:t>с {Дата </w:t></w:r><w:proofErr w:type="spellStart"/><w:r><w:rPr><w:b/></w:rPr><w:t>пере</w:t></w:r><w:r><w:t xml:space="preserve">вода} г.</w:t></w:r></w:p>',
      resolve,
      new Set(),
      new Set(),
    );
    expect(xml).toContain('<w:t xml:space="preserve">с 01.09.2026</w:t>');
    expect(xml).toContain('<w:t xml:space="preserve"></w:t>');
    expect(xml).toContain('<w:t xml:space="preserve"> г.</w:t>');
  });

  it('метки в разных абзацах не склеиваются; неизвестные остаются', () => {
    const missing = new Set<string>();
    const xml = fillXml('<w:p><w:r><w:t>{ФИО</w:t></w:r></w:p><w:p><w:r><w:t>}</w:t></w:r></w:p><w:p><w:r><w:t>{Нет такого}</w:t></w:r></w:p>', resolve, new Set(), missing);
    expect(xml).toContain('{ФИО');
    expect(xml).toContain('{Нет такого}');
    expect([...missing]).toEqual(['Нет такого']);
  });

  it('спецсимволы и переносы строк в значении', () => {
    const xml = fillXml('<w:p><w:r><w:t>{A&amp;B} {Адрес}</w:t></w:r></w:p>', resolve, new Set(), new Set());
    expect(xml).toContain('&lt;&amp;&gt;');
    expect(xml).toContain('строка 1</w:t><w:br/><w:t xml:space="preserve">строка 2');
  });

  it('заполняет весь документ, включая колонтитулы', async () => {
    const src = wordDoc('<w:p><w:r><w:t>{ФИО</w:t></w:r><w:r><w:t>}, {Должность}</w:t></w:r></w:p>');
    expect((await docxPlaceholders(src)).sort()).toEqual(['Должность', 'ФИО']);
    const r = await fillDocx(src, resolve);
    expect(r.used).toEqual(['ФИО']);
    expect(r.missing).toEqual(['Должность']);
    expect(await part(r.data, 'word/document.xml')).toContain('Примеров Пример Примерович');
    expect(await part(r.data, 'word/footer1.xml')).toContain('Примеров Пример Примерович');
    expect(await part(r.data, '[Content_Types].xml')).toBe('<Types/>');
  });

  it('не .docx — понятная ошибка', async () => {
    await expect(fillDocx(writeZip([{ path: 'a.txt', data: utf8('x') }]), resolve)).rejects.toThrow('не документ Word');
  });
});
