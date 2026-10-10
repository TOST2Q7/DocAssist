import { describe, expect, it } from 'vitest';
import { defineDocType, upgrade, wrap } from './docType';

interface V3 {
  items: { key: string; value: string; kind: string }[];
}

const dt = defineDocType<V3>({
  type: 'test/vars',
  version: 3,
  migrations: {
    0: (raw: Record<string, string>) => ({ list: Object.entries(raw).map(([k, v]) => ({ k, v })) }),
    1: (d: { list: { k: string; v: string }[] }) => ({ items: d.list.map((x) => ({ key: x.k, value: x.v })) }),
    2: (d: { items: { key: string; value: string }[] }) => ({ items: d.items.map((x) => ({ ...x, kind: 'text' })) }),
  },
  empty: () => ({ items: [] }),
});

describe('версионирование документов', () => {
  it('поднимает «сырой» JSON без конверта через все миграции', () => {
    const r = upgrade(dt, { fio: 'Иванов' });
    expect(r.data).toEqual({ items: [{ key: 'fio', value: 'Иванов', kind: 'text' }] });
    expect(r.migratedFrom).toBe(0);
    expect(r.tooNew).toBe(false);
  });

  it('поднимает конверт старой версии', () => {
    const r = upgrade(dt, { $type: 'test/vars', $version: 2, data: { items: [{ key: 'a', value: 'b' }] } });
    expect(r.data.items[0].kind).toBe('text');
    expect(r.migratedFrom).toBe(2);
  });

  it('текущая версия читается без изменений', () => {
    const env = wrap(dt, { items: [] });
    const r = upgrade(dt, JSON.parse(JSON.stringify(env)));
    expect(r.migratedFrom).toBeUndefined();
    expect(r.data).toEqual({ items: [] });
  });

  it('файл из будущей версии помечается как tooNew', () => {
    const r = upgrade(dt, { $type: 'test/vars', $version: 9, data: { anything: 1 } });
    expect(r.tooNew).toBe(true);
  });

  it('старый формат без миграции (тестовая версия) — начинается заново', () => {
    const fresh = defineDocType<V3>({ type: 'test/vars', version: 3, migrations: {}, empty: () => ({ items: [] }) });
    expect(upgrade(fresh, { $type: 'test/vars', $version: 2, data: { old: true } })).toEqual({ data: { items: [] }, migratedFrom: 2, reset: true, tooNew: false });
  });

  it('чужой тип документа — ошибка', () => {
    expect(() => upgrade(dt, { $type: 'other', $version: 1, data: {} })).toThrow();
  });
});
