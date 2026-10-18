import { describe, expect, it } from 'vitest';
import { nodePath, personStatus, sectionOfRel, subtreeIds, type DriveDoc, type DriveFileLink, type LocalFile } from './model';

const L = (rel: string, md5: string): LocalFile => ({ rel, md5, size: 1, lastModified: 0 });
const link = (p: Partial<DriveFileLink>): DriveFileLink => ({ personId: 'p', id: 'F', name: 'x.jpg', parent: 'S', ...p });

describe('состояние файлов дела', () => {
  it('новый файл, совпадающий, изменённый здесь и на Диске', () => {
    const rows = personStatus(
      [L('Сканы/a.jpg', 'A'), L('Сканы/b.jpg', 'B2'), L('Сканы/c.jpg', 'C'), L('Сканы/d.jpg', 'D2'), L('Сканы/new.jpg', 'N')],
      [
        link({ id: 'a', rel: 'Сканы/a.jpg', md5: 'A', name: 'a.jpg' }),
        link({ id: 'b', rel: 'Сканы/b.jpg', md5: 'B', base: { dev: 'B' } }),
        link({ id: 'c', rel: 'Сканы/c.jpg', md5: 'C2', base: { dev: 'C' } }),
        link({ id: 'd', rel: 'Сканы/d.jpg', md5: 'D3', base: { dev: 'D' } }),
      ],
      'dev',
    );
    const by = Object.fromEntries(rows.map((r) => [r.local?.rel ?? r.link?.id, r.status]));
    expect(by).toEqual({ 'Сканы/a.jpg': 'synced', 'Сканы/b.jpg': 'push', 'Сканы/c.jpg': 'pull', 'Сканы/d.jpg': 'conflict', 'Сканы/new.jpg': 'local' });
  });

  it('у другого устройства своя история: без неё разные версии — расхождение', () => {
    const rows = personStatus([L('Сканы/b.jpg', 'B2')], [link({ rel: 'Сканы/b.jpg', md5: 'B', base: { other: 'B' } })], 'dev');
    expect(rows[0].status).toBe('conflict');
  });

  it('переименованный на устройстве файл узнаётся по сумме', () => {
    const rows = personStatus([L('Сканы/Паспорт.jpg', 'A')], [link({ rel: 'Сканы/scan1.jpg', md5: 'A', base: { dev: 'A' } })], 'dev');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'synced', relinked: true });
  });

  it('только на Диске, удалён здесь, в корзине, отложенное расхождение, имя не по правилам', () => {
    const rows = personStatus(
      [L('Сканы/k.jpg', 'K2'), L('Сканы/r.jpg', 'R')],
      [
        link({ id: 'remote', md5: 'X' }),
        link({ id: 'del', rel: 'Сканы/gone.jpg', md5: 'G', base: { dev: 'G' } }),
        link({ id: 'tr', rel: 'Сканы/t.jpg', md5: 'T', state: 'trashed' }),
        link({ id: 'k', rel: 'Сканы/k.jpg', md5: 'K3', dismissed: 'K2|K3' }),
        link({ id: 'r', rel: 'Сканы/r.jpg', md5: 'R', name: 'r.jpg' }),
      ],
      'dev',
      (rel) => (rel === 'Сканы/r.jpg' ? 'Паспорт — Фамилия И. О.jpg' : rel),
    );
    const by = Object.fromEntries(rows.map((r) => [r.link?.id ?? r.local?.rel, r.status]));
    expect(by).toEqual({ remote: 'remote', del: 'deleted', tr: 'trashed', k: 'kept', r: 'rename' });
  });
});

describe('древо папок', () => {
  const doc: DriveDoc = {
    nodes: [
      { id: 'R', name: 'Выдано', parent: null },
      { id: 'O', name: 'Отряд', parent: 'R' },
      { id: 'P', name: 'Фамилия Имя', parent: 'O', personId: 'p1' },
      { id: 'S', name: 'Сканы', parent: 'P', personId: 'p1', section: 'scans' },
    ],
    files: [],
    rules: { personFolder: '', sections: {} as DriveDoc['rules']['sections'], scanNames: false },
  };
  it('путь и содержимое папки', () => {
    expect(nodePath(doc, 'S').map((n) => n.name)).toEqual(['Выдано', 'Отряд', 'Фамилия Имя', 'Сканы']);
    expect([...subtreeIds(doc, 'O')].sort()).toEqual(['O', 'P', 'S']);
  });
  it('раздел по пути файла', () => {
    expect(sectionOfRel('Сканы/x.jpg')).toBe('scans');
    expect(sectionOfRel('Фотографии/x.jpg')).toBe('photos');
    expect(sectionOfRel('x.pdf')).toBeNull();
  });
});
