import { toBytes, type FileStat, type FsEntry, type StorageAdapter, type StorageKind } from '../storage/types';
import type { Gramotka } from './gramotka';

/**
 * Папка человека — виртуальная папка рабочей папки («@грамотки/<номер>/Сканы/…»), а на самом деле — файлы
 * внутри грамотки. Тот же интерфейс, что у любой папки: приложения не знают, что файлы закрыты.
 */
export class GramotkaFiles implements StorageAdapter {
  readonly label = 'Грамотка';

  constructor(
    private readonly g: () => Gramotka | null,
    readonly kind: StorageKind,
  ) {}

  private get(): Gramotka {
    const g = this.g();
    if (!g) throw new Error('Грамотка закрыта: откройте грамотки.');
    return g;
  }

  async list(path: string): Promise<FsEntry[]> {
    return this.get().list(path);
  }

  readFile(path: string): Promise<Uint8Array | null> {
    return this.get().readFile(path);
  }

  async stat(path: string): Promise<FileStat | null> {
    const f = this.get().stat(path);
    return f ? { size: f.size, lastModified: f.modified } : null;
  }

  writeFile(path: string, data: Uint8Array | string): Promise<void> {
    return this.get().writeFile(path, toBytes(data));
  }

  async remove(path: string): Promise<void> {
    this.get().remove(path);
  }

  async mkdir(path: string): Promise<void> {
    this.get().mkdir(path);
  }
}
