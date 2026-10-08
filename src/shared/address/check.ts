import { confirm, err } from '../check/finalize';
import type { FieldCheck, Issue } from '../check/types';
import { fixMixedScript, fixNameCase, fixSpaces } from '../text/text';
import { COUNTRY_NAME, TYPE_BY_ID } from './addrTypes';
import { nodeKey, type Gazetteer, type GeoNode } from './gazetteer';
import { applyGlues, findGlues } from './glue';
import { parseAddress, type Component } from './parse';
import type { AddressTemplate } from './template';
import { LEVEL_LABELS, levelRank, type AddrType, type AddressPart, type Level } from './types';

/*
 * Строгая проверка адреса.
 *
 * 1. «Слипшиеся» слова ищутся отдельным этапом (своя категория).
 * 2. Адрес разбирается на части, каждая часть сверяется с деревом «регион → район → населённый пункт → улица».
 * 3. Строятся две формы:
 *      local     — части в том порядке, как написаны, но каждая записана правильно;
 *      canonical — адрес строго по шаблону (порядок, обязательные и запрещённые части, данные справочника).
 *    Отличия исходного текста от local объясняются автоматически (регистр, точки, запятые, лишние слова),
 *    а отличия local от canonical — отдельными замечаниями (порядок, недостающие части, конфликт с деревом).
 * 4. Всё, чего нет в справочнике (село, улица, индекс), требует подтверждения человеком.
 * Итог: адрес верен, только если он в точности равен canonical и всё подтверждено.
 */

export interface AddressCheck extends FieldCheck {
  parts: AddressPart[];
  regionNode: GeoNode | null;
  localityNode: GeoNode | null;
}

interface Item {
  comp: Component;
  node: GeoNode | null;
  /** Узел для итоговой формы (при конфликте с деревом — исправленный). */
  finalNode?: GeoNode | null;
  added?: boolean;
  status: AddressPart['status'];
}

const NAMED: Level[] = ['region', 'district', 'city', 'settlement', 'area'];
const populated = (l: Level | null) => l === 'city' || l === 'settlement';

function levelCompatible(n: GeoNode, c: Component): boolean {
  if (!c.level) return false;
  if (n.level === c.level) return true;
  if (populated(n.level) && populated(c.level)) return true;
  // «г. Москва» — город федерального значения, это регион.
  return n.level === 'region' && n.type === 'g' && c.type?.id === 'g';
}

/** Найти название в дереве; если целиком не найдено — самое длинное известное начало (остальное — лишнее). */
function resolveName(gaz: Gazetteer, c: Component, within: GeoNode | null, ok: (n: GeoNode) => boolean) {
  const words = c.name.split(' ');
  for (let k = words.length; k >= 1; k--) {
    const name = words.slice(0, k).join(' ');
    const found = gaz.findUnder(name, within).filter(ok);
    if (found.length) return { candidates: found, name, extra: words.slice(k).join(' ') };
  }
  return null;
}

function numberText(c: Component, t: AddressTemplate): string {
  const joined = c.name.replace(/^(\d+)\s+([\p{L}])$/u, '$1$2');
  return t.houseLetter === 'upper' ? joined.toUpperCase() : joined.toLowerCase();
}

function render(item: Item, t: AddressTemplate, gaz: Gazetteer, mode: 'local' | 'final'): string {
  const c = item.comp;
  const node = mode === 'final' ? (item.finalNode ?? item.node) : item.node;
  let text: string;
  if (c.level === 'index') text = c.name;
  else if (c.level === 'country') text = COUNTRY_NAME;
  else if (node && (node.region || (node.level === 'region' && node.type === 'g'))) text = gaz.label(node, t.regionStyle);
  else {
    let type: AddrType | null = c.type ?? (node ? (TYPE_BY_ID.get(node.type) ?? null) : null);
    if (mode === 'final' && node && TYPE_BY_ID.get(node.type)) type = TYPE_BY_ID.get(node.type)!;
    const name = type?.numbered ? numberText(c, t) : node ? node.name : fixNameCase(c.name);
    if (!type) text = name;
    else {
      const typeText = t.typeStyle === 'short' ? type.short : type.full;
      let placement = type.placement;
      if (mode === 'local' && c.typeMisplaced) placement = placement === 'before' ? 'after' : 'before';
      text = placement === 'before' ? `${typeText} ${name}` : `${name} ${typeText}`;
    }
  }
  const a = c.level ? t.affixes?.[c.level] : undefined;
  return `${a?.prefix ?? ''}${text}${a?.suffix ?? ''}`;
}

export function checkAddress(raw: string, t: AddressTemplate, gaz: Gazetteer): AddressCheck {
  const value = raw ?? '';
  const empty: AddressCheck = { issues: [], parts: [], regionNode: null, localityNode: null };
  if (!value.trim()) return { ...empty, issues: [err('empty', 'missing', 'Адрес не заполнен')] };

  const issues: Issue[] = [];
  const glues = findGlues(value, { isKnownName: (w) => gaz.hasName(w) });
  for (const g of glues) issues.push(err('glued', 'glued', `${g.reason} → «${g.fixed}»`, { span: [g.start, g.end] }));

  const clean = fixSpaces(applyGlues(fixMixedScript(value), glues));
  const items: Item[] = parseAddress(clean, gaz).components.map((comp) => ({ comp, node: null, status: 'ok' }));
  const mark = (it: Item, s: AddressPart['status']) => {
    if (it.status !== 'error') it.status = s;
  };

  // --- Сверка с деревом: от крупного к мелкому, каждая часть должна лежать внутри предыдущей.
  const named = items.filter((it) => it.comp.level && NAMED.includes(it.comp.level)).sort((a, b) => levelRank(a.comp.level!) - levelRank(b.comp.level!));
  let context: Item | null = null;
  for (const it of named) {
    const res = resolveName(gaz, it.comp, null, (n) => levelCompatible(n, it.comp));
    if (!res) continue;
    if (res.extra) it.comp = { ...it.comp, name: res.name }; // лишние слова уйдут из правильной формы
    if (it.comp.level !== 'region' && res.candidates.some((n) => n.level === 'region')) it.comp = { ...it.comp, level: 'region' };
    const ctx = context?.node;
    if (!ctx) {
      it.node = res.candidates[0];
      if (res.candidates.length > 1 && new Set(res.candidates.map((c) => gaz.regionOf(c)?.id)).size > 1 && !items.some((x) => x.comp.level === 'region')) {
        issues.push(err('ambiguous', 'missing', `«${it.comp.name}» есть в нескольких регионах — укажите регион`));
        mark(it, 'error');
      }
      context = it;
      continue;
    }
    const inside = res.candidates.filter((c) => gaz.isAncestor(ctx, c));
    if (inside.length) {
      it.node = inside[0];
      context = it;
      continue;
    }
    // Конфликт: «Абакан» лежит не в том регионе, что указан.
    it.node = res.candidates[0];
    const actual = gaz.ancestors(it.node).find((a) => a.level === ctx.level) ?? null;
    if (actual && res.candidates.length === 1) context!.finalNode = actual;
    issues.push(
      err(
        'tree-conflict',
        'consistency',
        actual
          ? `«${gaz.label(it.node)}» находится в «${gaz.label(actual)}», а указано «${gaz.label(ctx)}»`
          : `«${gaz.label(it.node)}» не находится в «${gaz.label(ctx)}»`,
      ),
    );
    mark(it, 'error');
    mark(context!, 'error');
    context = it;
  }

  const finalOf = (it: Item) => it.finalNode ?? it.node;
  const deepestKnown = [...named].reverse().find((it) => it.node);
  const deepNode = deepestKnown ? finalOf(deepestKnown) : null;
  const regionNode = deepNode ? gaz.regionOf(deepNode) : null;
  const locality = items.filter((it) => populated(it.comp.level)).pop() ?? null;
  const localityNode = locality ? finalOf(locality) : null;

  // Где должен лежать неизвестный населённый пункт: ближайшая известная часть выше него.
  const knownParentOf = (it: Item): GeoNode | null => {
    const above = items.filter((o) => o.node && o.comp.level && levelRank(o.comp.level) < levelRank(it.comp.level ?? 'flat'));
    above.sort((a, b) => levelRank(b.comp.level!) - levelRank(a.comp.level!));
    return above[0] ? finalOf(above[0]) : null;
  };

  // --- Населённый пункт по справочнику.
  if (locality && !locality.node && t.verify.locality) {
    const parent = knownParentOf(locality);
    issues.push(
      confirm('locality-unknown', 'dictionary', `«${render(locality, t, gaz, 'final')}» нет в справочнике${parent ? ` (${gaz.chain(parent)})` : ''} — проверьте и подтвердите`, {
        action: { kind: 'add-place', name: fixNameCase(locality.comp.name), type: locality.comp.type?.id ?? null, parentPath: parent ? gaz.pathOf(parent) : null, parentLabel: parent ? gaz.chain(parent) : null },
      }),
    );
    mark(locality, 'confirm');
  }
  // Путь населённого пункта — известный или будущий (если его подтвердят вместе с улицей).
  const localityPath = (() => {
    if (localityNode) return gaz.pathOf(localityNode);
    if (!locality?.comp.type) return null;
    const parent = knownParentOf(locality);
    return parent ? [...gaz.pathOf(parent), nodeKey(locality.comp.type.id, fixNameCase(locality.comp.name))] : null;
  })();
  const localityLabel = locality ? render(locality, t, gaz, 'final') : '';

  // Тип по справочнику: «п. Аскиз», а это село.
  for (const it of items) {
    const n = it.node;
    if (!n || n.region || n.type === 'country' || !it.comp.type || it.comp.typeInferred) continue;
    if (n.type !== it.comp.type.id) {
      const actual = TYPE_BY_ID.get(n.type);
      if (actual) {
        issues.push(err('type-mismatch', 'dictionary', `По справочнику «${n.name}» — ${actual.full} (${actual.short}), а указано «${it.comp.typeText ?? it.comp.type.short}»`));
        mark(it, 'error');
      }
    }
  }

  // --- Улица по справочнику.
  const street = items.find((it) => it.comp.level === 'street');
  if (street) {
    if (localityNode) {
      const res = resolveName(gaz, street.comp, localityNode, (n) => n.level === 'street');
      if (res) {
        if (res.extra) street.comp = { ...street.comp, name: res.name };
        street.node = res.candidates.find((n) => n.type === street.comp.type?.id) ?? res.candidates[0];
        if (street.comp.type && street.node.type !== street.comp.type.id && !street.comp.typeGuessed) {
          const actual = TYPE_BY_ID.get(street.node.type)!;
          issues.push(err('type-mismatch', 'dictionary', `По справочнику — ${actual.full} ${street.node.name} (${actual.short}), а указано «${street.comp.typeText ?? street.comp.type.short}»`));
          mark(street, 'error');
        }
      }
    }
    if (!street.node && t.verify.street && t.parts.street !== 'never') {
      const type = street.comp.type?.id ?? 'ul';
      const name = fixNameCase(street.comp.name);
      issues.push(
        confirm('street-unknown', 'dictionary', `Улицы «${render(street, t, gaz, 'final')}» нет в справочнике${localityLabel ? ` для «${localityLabel}»` : ''} — проверьте и подтвердите`, {
          action: { kind: 'add-place', name, type, parentPath: localityPath, parentLabel: localityNode ? gaz.chain(localityNode) : localityLabel || null },
        }),
      );
      mark(street, 'confirm');
    }
  }

  // --- Индекс.
  const index = items.find((it) => it.comp.level === 'index');
  if (index) {
    const prefixes = regionNode?.region?.postal;
    if (prefixes?.length && !prefixes.some((p) => index.comp.name.startsWith(p))) {
      issues.push(err('index-region', 'consistency', `Индекс ${index.comp.name} не относится к региону «${gaz.label(regionNode!)}» (индексы региона начинаются с ${prefixes.slice(0, 5).join(', ')}${prefixes.length > 5 ? '…' : ''})`));
      mark(index, 'error');
    } else if (t.verify.index && t.parts.index !== 'never' && locality) {
      const known = localityNode?.postal ?? [];
      if (!known.includes(index.comp.name)) {
        issues.push(
          confirm('index-unknown', 'dictionary', `Индекс ${index.comp.name} не подтверждён для «${localityLabel}»${known.length ? ` (известны: ${known.join(', ')})` : ''} — проверьте и подтвердите`, {
            action: localityPath ? { kind: 'add-postal', index: index.comp.name, path: localityPath, label: `Индекс ${index.comp.name} → ${localityLabel}` } : undefined,
          }),
        );
        mark(index, 'confirm');
      }
    }
  }

  // --- Нераспознанные части.
  items.forEach((it, i) => {
    const c = it.comp;
    if (c.level !== null) return;
    if (/^\d/.test(c.name)) {
      const msg = i === 0 && /^\d{5,7}$/.test(c.name) ? `Индекс должен состоять из 6 цифр, а здесь ${c.name.length}` : `Непонятный номер «${c.name}» — укажите, что это (д., корп., кв.)`;
      issues.push(err('unknown-number', 'format', msg));
    } else {
      const parent = knownParentOf(it);
      issues.push(
        err('unknown-part', 'format', `Не удалось определить, что такое «${c.name}». Укажите тип (г., с., ул.…) или добавьте в справочник`, {
          action: { kind: 'add-place', name: fixNameCase(c.name), type: null, parentPath: parent ? gaz.pathOf(parent) : null, parentLabel: parent ? gaz.chain(parent) : null },
        }),
      );
    }
    mark(it, 'error');
  });

  // --- Номера домов и квартир.
  for (const it of items) {
    if (!it.comp.type?.numbered) continue;
    const n = numberText(it.comp, t);
    const ok = it.comp.level === 'house' ? /^\d+[\p{L}]?(\/\d+[\p{L}]?)?$/u.test(n) : /^(\d+[\p{L}]?|[\p{L}])$/u.test(n);
    if (!ok || !it.comp.name) {
      issues.push(err('number-format', 'format', `${LEVEL_LABELS[it.comp.level!]}: неверный номер «${it.comp.name}»`));
      mark(it, 'error');
    }
  }

  // --- Повторы.
  const counts = new Map<Level, number>();
  for (const it of items) if (it.comp.level) counts.set(it.comp.level, (counts.get(it.comp.level) ?? 0) + 1);
  for (const [lvl, n] of counts) {
    if (n > 1 && lvl !== 'settlement') issues.push(err('duplicate-part', 'format', `${LEVEL_LABELS[lvl]} указан(а) ${n} раза`));
  }

  // --- Обязательные и запрещённые части по шаблону.
  const has = (l: Level) => items.some((it) => it.comp.level === l || (l === 'city' && populated(it.comp.level)));
  const final: Item[] = [...items];
  const addPart = (level: Level, node: GeoNode | null, name: string) =>
    final.push({ comp: { level, type: node ? (TYPE_BY_ID.get(node.type) ?? null) : null, typeText: null, name, segment: -1, start: 0, end: 0 }, node, added: true, status: 'ok' });

  const P = t.parts;
  if (P.index === 'required' && !has('index')) issues.push(err('missing-index', 'missing', 'Нет почтового индекса (6 цифр в начале адреса)'));
  if (P.region === 'required' && !has('region')) {
    if (regionNode) {
      addPart('region', regionNode, regionNode.name);
      issues.push(err('missing-region', 'missing', `Не указан регион — по справочнику «${gaz.label(regionNode, t.regionStyle)}»`));
    } else issues.push(err('missing-region', 'missing', 'Не указан регион'));
  }
  if (!locality) issues.push(err('missing-locality', 'missing', 'Не указан населённый пункт (г., с., пгт…)'));
  if (P.district === 'required' && !has('district') && localityNode) {
    const d = gaz.ancestors(localityNode).find((n) => n.level === 'district');
    if (d) {
      addPart('district', d, d.name);
      issues.push(err('missing-district', 'missing', `Не указан район — по справочнику «${gaz.label(d)}»`));
    }
  }
  if (P.country === 'required' && !has('country')) {
    addPart('country', gaz.root, COUNTRY_NAME);
    issues.push(err('missing-country', 'missing', 'В конце указывается страна «Россия»'));
  }
  if (P.street === 'required' && !has('street') && locality) issues.push(err('missing-street', 'missing', 'Не указана улица'));
  if (P.house === 'required' && !has('house') && locality) issues.push(err('missing-house', 'missing', 'Не указан номер дома'));

  const forbidden: Partial<Record<Level, string>> = {
    index: P.index === 'never' ? 'Индекс' : undefined,
    country: P.country === 'never' ? 'Страна' : undefined,
    district: P.district === 'never' ? 'Район' : undefined,
    street: P.street === 'never' ? 'Улица' : undefined,
    house: P.house === 'never' ? 'Дом' : undefined,
    building: P.building === 'never' ? 'Корпус/строение' : undefined,
    flat: P.flat === 'never' ? 'Квартира' : undefined,
  };
  const kept = final.filter((it) => {
    const label = it.comp.level ? forbidden[it.comp.level] : undefined;
    if (!label) return true;
    issues.push(err('extra-part', 'format', `${label} в этом адресе не указывается — уберите «${render(it, t, gaz, 'local')}»`));
    mark(it, 'error');
    return false;
  });

  // --- Порядок и место типа.
  const dir = t.order === 'big-to-small' ? 1 : -1;
  const written = items.filter((it) => it.comp.level && it.comp.level !== 'index');
  const ranks = written.map((it) => levelRank(it.comp.level!));
  if (ranks.some((r, i) => i > 0 && (r - ranks[i - 1]) * dir < 0)) {
    issues.push(
      err(
        'order',
        'format',
        t.order === 'big-to-small'
          ? 'Нарушен порядок: нужно от крупного к мелкому — регион, населённый пункт, улица, дом, квартира'
          : 'Нарушен порядок: нужно от мелкого к крупному — населённый пункт, район, регион, страна',
      ),
    );
  }
  const idxPos = items.findIndex((it) => it.comp.level === 'index');
  if (idxPos > 0) issues.push(err('order', 'format', 'Индекс пишется в начале адреса'));
  for (const it of items) {
    if (it.comp.typeMisplaced) {
      issues.push(err('type-misplaced', 'format', `Тип стоит не на своём месте: «${render(it, t, gaz, 'local')}» → «${render(it, t, gaz, 'final')}»`));
      mark(it, 'error');
    }
  }

  // --- Две формы: «как написано, но правильно» и «строго по шаблону».
  const local = items.map((it) => render(it, t, gaz, 'local')).join(t.separator);
  const ordered = kept
    .map((it, i) => ({ it, i, rank: it.comp.level ? levelRank(it.comp.level) : NaN }))
    .map((o, i, arr) => (Number.isNaN(o.rank) ? { ...o, rank: i > 0 ? arr[i - 1].rank + 0.5 : 0.5 } : o))
    .sort((a, b) => (a.rank - b.rank) * dir || a.i - b.i);
  const idx = ordered.findIndex((o) => o.it.comp.level === 'index');
  if (idx > 0) ordered.unshift(...ordered.splice(idx, 1));
  const canonical = ordered.map((o) => render(o.it, t, gaz, 'final')).join(t.separator);

  const parts: AddressPart[] = ordered.map(({ it }) => {
    const node = finalOf(it);
    return {
      level: it.comp.level,
      levelLabel: it.comp.level ? LEVEL_LABELS[it.comp.level] : 'Не распознано',
      text: render(it, t, gaz, 'final'),
      known: !!node,
      chain: node && node.type !== 'country' ? gaz.chain(node) : undefined,
      status: it.status,
    };
  });

  // Структурные ошибки исправляются приведением к шаблону.
  const FIXABLE = new Set(['tree-conflict', 'type-mismatch', 'missing-region', 'missing-district', 'missing-country', 'extra-part', 'order', 'type-misplaced']);
  if (canonical !== value) for (const i of issues) if (FIXABLE.has(i.code) && i.fix === undefined) i.fix = canonical;

  return { canonical, explainAgainst: local, issues, parts, regionNode, localityNode };
}

