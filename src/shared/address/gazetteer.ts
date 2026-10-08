import { COUNTRY_NAME, normWord, TYPE_BY_ID } from './addrTypes';
import { REGIONS, type Region, type RegionType } from './regions';
import { REGION_SEEDS, type Seed } from './seed';
import type { Level } from './types';

/*
 * Газеттир — дерево адресных объектов: Россия → регион → район/город → населённый пункт → улица.
 * Используется для проверки «кто чей родитель»: «Абакан» бывает только в Хакасии.
 *
 * Ключ узла (key) — «тип:название», путь — цепочка ключей от корня.
 * Пользовательские узлы ссылаются на родителя по пути, а не по внутреннему id,
 * поэтому сохраняются между версиями приложения.
 */

export interface GeoNode {
  id: string;
  name: string;
  /** id типа из addrTypes ('s', 'rn', 'resp'…); для страны — 'country'. */
  type: string;
  level: Level;
  parentId: string | null;
  key: string;
  aliases: string[];
  region?: Region;
  user?: boolean;
}

/** Запись пользовательского справочника адресов. */
export interface UserGeoEntry {
  name: string;
  type: string;
  /** Путь родителя: ключи от корня, например ['country:россия', 'resp:хакасия', 'rn:аскизский']. */
  parentPath: string[];
  aliases?: string[];
}

const REGION_TYPE_TO_ADDR: Record<RegionType, string> = { resp: 'resp', kray: 'kray', obl: 'obl', ao: 'ao', aobl: 'aobl', gfz: 'g' };

/** Нормализация названия: регистр, ё, дефисы и пробелы вокруг них, скобки. */
export function normName(s: string): string {
  return normWord(s)
    .replace(/\s*-\s*/g, '-')
    .replace(/[()«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nodeKey(type: string, name: string): string {
  return `${type}:${normName(name)}`;
}

export class Gazetteer {
  readonly nodes = new Map<string, GeoNode>();
  private byName = new Map<string, GeoNode[]>();
  private children = new Map<string, GeoNode[]>();
  readonly root: GeoNode;
  private seq = 0;

  constructor(user: UserGeoEntry[] = []) {
    this.root = this.add({ name: COUNTRY_NAME, type: 'country', level: 'country', parentId: null, aliases: ['РФ', 'Российская Федерация'] });
    for (const region of REGIONS) {
      const node = this.add({
        name: region.name,
        type: REGION_TYPE_TO_ADDR[region.type],
        level: 'region',
        parentId: this.root.id,
        aliases: [...(region.aliases ?? []), region.short, region.full],
        region,
      });
      for (const seed of REGION_SEEDS[region.name] ?? []) this.addSeed(seed, node.id);
    }
    for (const entry of user) this.addUser(entry);
  }

  private add(n: Omit<GeoNode, 'id' | 'key'> & { id?: string }): GeoNode {
    const node: GeoNode = { ...n, id: n.id ?? `n${++this.seq}`, key: nodeKey(n.type, n.name) };
    this.nodes.set(node.id, node);
    for (const name of [node.name, ...node.aliases]) {
      const k = normName(name);
      const list = this.byName.get(k) ?? [];
      list.push(node);
      this.byName.set(k, list);
    }
    if (node.parentId) {
      const list = this.children.get(node.parentId) ?? [];
      list.push(node);
      this.children.set(node.parentId, list);
    }
    return node;
  }

  private addSeed([type, name, kids]: Seed, parentId: string) {
    const t = TYPE_BY_ID.get(type);
    if (!t) throw new Error(`Неизвестный тип в базе адресов: ${type}`);
    const node = this.add({ name, type, level: t.level, parentId, aliases: name.includes('ё') ? [name.replace(/ё/g, 'е')] : [] });
    for (const k of kids ?? []) this.addSeed(k, node.id);
  }

  /** Добавить пользовательский узел. Возвращает null, если родитель не найден. */
  addUser(entry: UserGeoEntry): GeoNode | null {
    const parent = this.byPath(entry.parentPath);
    const t = TYPE_BY_ID.get(entry.type);
    if (!parent || !t) return null;
    const existing = this.childrenOf(parent.id).find((c) => c.key === nodeKey(entry.type, entry.name));
    if (existing) return existing;
    return this.add({ name: entry.name, type: entry.type, level: t.level, parentId: parent.id, aliases: entry.aliases ?? [], user: true });
  }

  byPath(path: string[]): GeoNode | null {
    let cur: GeoNode | null = null;
    for (const key of path) {
      const candidates: GeoNode[] = cur ? this.childrenOf(cur.id) : [this.root];
      cur = candidates.find((c) => c.key === key) ?? null;
      if (!cur) return null;
    }
    return cur;
  }

  pathOf(node: GeoNode): string[] {
    return this.ancestors(node, true)
      .reverse()
      .map((n) => n.key);
  }

  childrenOf(id: string): GeoNode[] {
    return this.children.get(id) ?? [];
  }

  parentOf(node: GeoNode): GeoNode | null {
    return node.parentId ? (this.nodes.get(node.parentId) ?? null) : null;
  }

  /** Предки узла (от ближайшего к корню). */
  ancestors(node: GeoNode, includeSelf = false): GeoNode[] {
    const out: GeoNode[] = includeSelf ? [node] : [];
    let cur = this.parentOf(node);
    while (cur) {
      out.push(cur);
      cur = this.parentOf(cur);
    }
    return out;
  }

  isAncestor(ancestor: GeoNode, node: GeoNode): boolean {
    return this.ancestors(node).some((a) => a.id === ancestor.id);
  }

  regionOf(node: GeoNode): GeoNode | null {
    return this.ancestors(node, true).find((n) => n.level === 'region') ?? null;
  }

  /** Найти узлы по названию (с учётом алиасов). */
  find(name: string): GeoNode[] {
    return this.byName.get(normName(name)) ?? [];
  }

  /** Есть ли такое слово в базе (для поиска «слипшихся» слов). */
  hasName(name: string): boolean {
    return this.byName.has(normName(name));
  }

  /** Краткая подпись: «с. Аскиз», «Аскизский р-н», «Респ. Хакасия». */
  label(node: GeoNode, style: 'short' | 'full' = 'short'): string {
    if (node.region) return style === 'short' ? node.region.short : node.region.full;
    if (node.type === 'country') return node.name;
    const t = TYPE_BY_ID.get(node.type);
    if (!t) return node.name;
    const typeText = style === 'short' ? t.short : t.full;
    return t.placement === 'before' ? `${typeText} ${node.name}` : `${node.name} ${typeText}`;
  }

  /** Полная цепочка: «с. Аскиз, Аскизский р-н, Респ. Хакасия». */
  chain(node: GeoNode): string {
    return this.ancestors(node, true)
      .filter((n) => n.type !== 'country')
      .map((n) => this.label(n))
      .join(', ');
  }

  allNames(): string[] {
    return [...this.byName.keys()];
  }
}

let defaultInstance: Gazetteer | null = null;
/** Газеттир без пользовательских дополнений (для тестов и быстрых проверок). */
export function defaultGazetteer(): Gazetteer {
  defaultInstance ??= new Gazetteer();
  return defaultInstance;
}
