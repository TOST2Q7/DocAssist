import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { crc32, readZip, writeZip } from './zip';

describe('ZIP', () => {
  it('записывает и читает русские имена и данные', async () => {
    const enc = new TextEncoder();
    const files = [
      { path: 'Проверка анкет/checks.json', data: enc.encode('{"a":"ё"}') },
      { path: '.docassist/base/Адреса.json', data: enc.encode('{}') },
      { path: 'пусто.txt', data: new Uint8Array() },
    ];
    const back = await readZip(writeZip(files));
    expect(back.map((f) => f.path)).toEqual(files.map((f) => f.path));
    expect(new TextDecoder().decode(back[0].data)).toBe('{"a":"ё"}');
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });

  it('читает сжатые (deflate) файлы', async () => {
    const data = new TextEncoder().encode('Привет, привет, привет!'.repeat(20));
    const zip = writeZip([{ path: 'a.txt', data }]);
    // Подменяем содержимое на сжатое, как сделал бы архиватор.
    const packed = deflateRawSync(data);
    const view = new DataView(zip.buffer);
    const nameLen = view.getUint16(26, true);
    const head = zip.slice(0, 30 + nameLen);
    const hv = new DataView(head.buffer);
    hv.setUint16(8, 8, true);
    hv.setUint32(18, packed.length, true);
    const central = zip.slice(30 + nameLen + data.length);
    const cv = new DataView(central.buffer);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, packed.length, true);
    const endAt = central.length - 22;
    cv.setUint32(endAt + 16, head.length + packed.length, true);
    const out = new Uint8Array([...head, ...packed, ...central]);
    const [f] = await readZip(out);
    expect(new TextDecoder().decode(f.data)).toBe('Привет, привет, привет!'.repeat(20));
  });
});
