import { fixMixedScript, fixNameCase, fixSpaces, levenshtein, mixedScriptProblems, spaceProblems } from '../text/text';
import { COUNTRY_NAME, needsDot, normWord, TYPE_BY_ID } from './addrTypes';
import type { Gazetteer, GeoNode } from './gazetteer';
import { applyGlues, findGlues } from './glue';
import { parseAddress, type Component } from './parse';
import { REGIONS } from './regions';
import type { AddressTemplate } from './template';
import { LEVEL_LABELS, levelRank, type Level } from './types';

/*
 * Проверка адреса по шаблону и по дереву населённых пунктов.
 * Возвращает: части адреса (для подсветки), список замечаний и исправленный вариант.
 */

export type Severity = 'error' | 'warning' | 'info';
export type IssueCategory = 'glued' | 'format' | 'order' | 'tree' | 'missing' | 'dictionary' | 'typo';

export interface AddToDictionaryAction {
  kind: 'add-to-dictionary';
  name: string;
  /** Предполагаемый тип (id из addrTypes). */
  type: string | null;
  /** Путь родителя в дереве (если известен). */
  parentPath: string[] | null;
  parentLabel: string | null;
}

export interface AddressIssue {
  code: string;
  severity: Severity;
  category: IssueCategory;
  message: string;
  span?: [number, number];
  /** Полностью исправленное значение поля (если есть точечное исправление). */
  fix?: string;
  partIndex?: number;
  action?: AddToDictionaryAction;
}

export interface AddressPart {
  level: Level | null;
  levelLabel: string;
  text: string;
  original: string;
  known: boolean;
  node?: GeoNode;
  chain?: string;
  status: 'ok' | 'info' | 'warning' | 'error';
}

export interface AddressCheck {
  parts: AddressPart[];
  issues: AddressIssue[];
  suggestion: string;
  regionNode: GeoNode | null;
}

interface Resolved {
  comp: Component;
  node: GeoNode | null;
  candidates: GeoNode[];
  added?: boolean;
}

const NAMED_LEVELS: Level[] = ['region', 'district', 'city', 'settlement', 'area', 'street'];

function candidatesFor(c: Component, gaz: Gazetteer): GeoNode[] {
  if (!c.level || !NAMED_LEVELS.includes(c.level) || !c.name) return [];
  const all = gaz.find(c.name);
  return all.filter((n) => {
    if (n.level === c.level) return true;
    const populated = (l: Level | null) => l === 'city' || l === 'settlement';
    if (populated(n.level) && populated(c.level)) return true;
    // «г. Москва» — город федерального значения, это уровень региона.
    if (n.level === 'region' && n.type === 'g' && c.type?.id === 'g') return true;
    return false;
  });
}

function nameIsBadCase(name: string): boolean {
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return false;
  return name !== fixNameCase(name);
}

export function renderComponent(c: Component, node: GeoNode | null, t: AddressTemplate, gaz: Gazetteer): string {
  let text: string;
  if (c.level === 'index') text = c.name;
  else if (c.level === 'country') text = COUNTRY_NAME;
  else if (node && (node.region || node.level === 'region')) text = gaz.label(node, t.regionStyle);
  else {
    const type = c.type ?? (node ? (TYPE_BY_ID.get(node.type) ?? null) : null);
    let name = node ? node.name : fixNameCase(c.name);
    if (type?.numbered) name = c.name.replace(/^(\d+)\s+([\p{L}])$/u, '$1$2');
    if (!type) text = name;
    else {
      const typeText = t.typeStyle === 'short' ? type.short : type.full;
      text = type.placement === 'before' ? `${typeText} ${name}` : `${name} ${typeText}`;
    }
  }
  const part = c.level ? t.parts?.[c.level] : undefined;
  return `${part?.prefix ?? ''}${text}${part?.suffix ?? ''}`;
}

export function checkAddress(raw: string, t: AddressTemplate, gaz: Gazetteer): AddressCheck {
  const issues: AddressIssue[] = [];
  const value = raw ?? '';
  if (!value.trim()) {
    return {
      parts: [],
      issues: [{ code: 'empty', severity: 'error', category: 'missing', message: 'Адрес не заполнен' }],
      suggestion: '',
      regionNode: null,
    };
  }

  // 1. Текстовые проблемы (пробелы, латиница в русских словах).
  for (const p of spaceProblems(value)) issues.push({ code: p.code, severity: 'warning', category: 'format', message: p.message, span: p.span });
  for (const p of mixedScriptProblems(value)) issues.push({ code: p.code, severity: 'error', category: 'typo', message: p.message, span: p.span });

  // 2. Слипшиеся слова — отдельная категория.
  const glues = findGlues(value, { isKnownName: (w) => gaz.hasName(w) });
  for (const g of glues) {
    issues.push({ code: 'glued', severity: 'warning', category: 'glued', message: `${g.reason}: «${g.fixed}»`, span: [g.start, g.end] });
  }

  // 3. Разбор очищенного текста.
  const clean = fixSpaces(applyGlues(fixMixedScript(value), glues));
  const { components } = parseAddress(clean, gaz);
  const resolved: Resolved[] = components.map((comp) => ({ comp, node: null, candidates: candidatesFor(comp, gaz) }));

  // 4. Сверка с деревом: идём от крупного к мелкому, каждый следующий должен лежать внутри предыдущего.
  const byLevel = [...resolved].sort((a, b) => levelRank(a.comp.level ?? 'flat') - levelRank(b.comp.level ?? 'flat'));
  let context: GeoNode | null = null;
  let contextRes: Resolved | null = null;
  const conflicts = new Set<Resolved>();
  for (const r of byLevel) {
    if (!r.candidates.length) continue;
    if (!context) {
      r.node = r.candidates[0];
      if (r.candidates.length > 1 && new Set(r.candidates.map((c) => gaz.regionOf(c)?.id)).size > 1) {
        issues.push({
          code: 'ambiguous',
          severity: 'info',
          category: 'tree',
          message: `«${r.comp.name}» есть в нескольких регионах — укажите регион, чтобы проверка была точной`,
        });
      }
      context = r.node;
      contextRes = r;
      continue;
    }
    const ctx: GeoNode = context;
    const inside = r.candidates.filter((c) => gaz.isAncestor(ctx, c) || c.id === ctx.id);
    if (inside.length) {
      r.node = inside[0];
      context = r.node;
      contextRes = r;
      continue;
    }
    // Конфликт: «Абакан» лежит не в том регионе, что указан.
    r.node = r.candidates[0];
    conflicts.add(r);
    conflicts.add(contextRes!);
    const actual = gaz.ancestors(r.node).find((a) => a.level === ctx.level) ?? gaz.regionOf(r.node);
    const conflictWith = contextRes!;
    const nodeLabel = gaz.label(r.node);
    const ctxLabel = gaz.label(ctx);
    let fix: string | undefined;
    if (actual && r.candidates.length === 1) {
      conflictWith.node = actual;
      fix = '__RENDER__';
    }
    issues.push({
      code: 'tree-conflict',
      severity: 'error',
      category: 'tree',
      message: actual
        ? `«${nodeLabel}» относится к «${gaz.label(actual)}», а указано «${ctxLabel}»`
        : `«${nodeLabel}» не находится в «${ctxLabel}»`,
      fix,
    });
    context = r.node;
    contextRes = r;
  }

  // «г. Москва» — это регион (город федерального значения).
  for (const r of resolved) {
    if (r.node?.level === 'region' && r.comp.level !== 'region') r.comp.level = 'region';
  }

  // Определяем регион адреса.
  const deepest = context;
  const regionNode = deepest ? gaz.regionOf(deepest) : null;

  const comps: Resolved[] = [...resolved];

  // 5. Недостающие части.
  const has = (l: Level) => comps.some((r) => r.comp.level === l);
  if (t.region === 'required' && !has('region')) {
    if (regionNode && regionNode.region) {
      comps.push({ comp: { level: 'region', type: TYPE_BY_ID.get(regionNode.type) ?? null, typeText: null, name: regionNode.name, segment: -1, start: 0, end: 0 }, node: regionNode, candidates: [regionNode], added: true });
      issues.push({ code: 'missing-region', severity: 'warning', category: 'missing', message: `Не указан регион — по базе это «${gaz.label(regionNode)}»`, fix: '__RENDER__' });
    } else {
      issues.push({ code: 'missing-region', severity: 'warning', category: 'missing', message: 'Не указан регион' });
    }
  }
  if (t.district === 'always' && !has('district') && deepest) {
    const d = gaz.ancestors(deepest, true).find((n) => n.level === 'district');
    if (d) {
      comps.push({ comp: { level: 'district', type: TYPE_BY_ID.get(d.type) ?? null, typeText: null, name: d.name, segment: -1, start: 0, end: 0 }, node: d, candidates: [d], added: true });
      issues.push({ code: 'missing-district', severity: 'info', category: 'missing', message: `Добавлен район по базе: «${gaz.label(d)}»`, fix: '__RENDER__' });
    }
  }
  if (t.country === 'always' && !has('country')) {
    comps.push({ comp: { level: 'country', type: null, typeText: null, name: COUNTRY_NAME, segment: 99, start: 0, end: 0 }, node: gaz.root, candidates: [], added: true });
    issues.push({ code: 'missing-country', severity: 'info', category: 'missing', message: 'По шаблону в конце указывается страна «Россия»', fix: '__RENDER__' });
  }
  const index = comps.find((r) => r.comp.level === 'index');
  if (t.index === 'required' && !index) {
    issues.push({ code: 'missing-index', severity: 'error', category: 'missing', message: 'Нет почтового индекса (6 цифр в начале адреса)' });
  }
  if (t.index === 'never' && index) {
    issues.push({ code: 'extra-index', severity: 'info', category: 'format', message: 'Индекс здесь не нужен — он будет убран', fix: '__RENDER__' });
  }
  if (index && regionNode?.region?.postal?.length && !regionNode.region.postal.some((p) => index.comp.name.startsWith(p))) {
    issues.push({
      code: 'index-region',
      severity: 'warning',
      category: 'tree',
      message: `Индекс ${index.comp.name} не похож на индексы региона «${gaz.label(regionNode)}» (${regionNode.region.postal.join(', ')}…)`,
    });
  }
  if (t.house === 'required' && !has('house') && (has('street') || has('settlement') || has('city'))) {
    issues.push({ code: 'missing-house', severity: 'warning', category: 'missing', message: 'Не указан номер дома' });
  }
  if (t.district === 'never' && has('district')) {
    issues.push({ code: 'extra-district', severity: 'info', category: 'format', message: 'Район по шаблону не указывается — он будет убран', fix: '__RENDER__' });
  }

  // 6. Части, которые не удалось распознать или которых нет в базе.
  comps.forEach((r) => {
    const c = r.comp;
    if (r.added) return;
    if (c.level === null) {
      const isNum = /^\d/.test(c.name);
      const nextIsHouse = comps[comps.indexOf(r) + 1]?.comp.level === 'house';
      issues.push({
        code: 'unknown-part',
        severity: 'warning',
        category: 'dictionary',
        message: isNum
          ? `Непонятный номер «${c.name}» — укажите, что это (д., корп., кв.)`
          : nextIsHouse
            ? `«${c.name}» — не указан тип. Если это улица, нужно «ул. ${fixNameCase(c.name)}»`
            : `Не удалось определить, что такое «${c.name}» — укажите тип (с., г., ул.…) или добавьте в справочник`,
        action: isNum
          ? undefined
          : { kind: 'add-to-dictionary', name: fixNameCase(c.name), type: nextIsHouse ? 'ul' : null, parentPath: deepest ? gaz.pathOf(deepest) : null, parentLabel: deepest ? gaz.chain(deepest) : null },
      });
      return;
    }
    if (c.level === 'region' && !r.node) {
      const best = REGIONS.map((reg) => ({ reg, d: levenshtein(normWord(c.name), normWord(reg.name)) })).sort((a, b) => a.d - b.d)[0];
      const close = best && best.d <= 2;
      issues.push({
        code: 'unknown-region',
        severity: 'error',
        category: 'typo',
        message: close ? `Неизвестный регион «${c.name}». Возможно, «${best.reg.short}»?` : `Неизвестный регион «${c.name}»`,
      });
      if (close) {
        const node = gaz.find(best.reg.name).find((n) => n.level === 'region');
        if (node) {
          r.node = node;
          issues[issues.length - 1].fix = '__RENDER__';
        }
      }
      return;
    }
    if ((c.level === 'district' || c.level === 'city' || c.level === 'settlement' || c.level === 'area') && !r.node) {
      // Ищем родителя: ближайшая распознанная часть выше по уровню.
      const parent = comps
        .filter((o) => o.node && o.comp.level && levelRank(o.comp.level) < levelRank(c.level!))
        .sort((a, b) => levelRank(b.comp.level!) - levelRank(a.comp.level!))[0]?.node;
      issues.push({
        code: 'not-in-dictionary',
        severity: 'info',
        category: 'dictionary',
        message: `«${fixNameCase(c.name)}» нет в справочнике${parent ? ` (${gaz.label(parent)})` : ''} — проверка по дереву неполная`,
        action: {
          kind: 'add-to-dictionary',
          name: fixNameCase(c.name),
          type: c.type?.id ?? null,
          parentPath: parent ? gaz.pathOf(parent) : null,
          parentLabel: parent ? gaz.chain(parent) : null,
        },
      });
    }
  });

  // 7. Тип в базе отличается от указанного («п. Аскиз», а это село).
  for (const r of comps) {
    const c = r.comp;
    if (r.added || !r.node || !c.type || c.typeInferred || c.typeImplicit) continue;
    if (r.node.region || r.node.type === 'country') continue;
    if (r.node.type !== c.type.id) {
      const actual = TYPE_BY_ID.get(r.node.type);
      const populated = (l: Level) => l === 'city' || l === 'settlement';
      if (actual && (actual.level === c.type.level || (populated(actual.level) && populated(c.type.level)))) {
        issues.push({
          code: 'type-mismatch',
          severity: 'warning',
          category: 'tree',
          message: `«${r.node.name}» по справочнику — ${actual.full} (${actual.short}), а указано «${c.typeText ?? c.type.short}»`,
          fix: '__RENDER__',
        });
        c.type = actual;
      }
    }
  }

  // 8. Формат: сокращения, точки, регистр, отсутствующие типы.
  for (const r of comps) {
    const c = r.comp;
    if (r.added) continue;
    if (c.typeInferred && c.level && c.level !== 'country' && c.level !== 'index') {
      const label = r.node ? gaz.label(r.node, c.level === 'region' ? t.regionStyle : t.typeStyle) : c.name;
      issues.push({ code: 'type-missing', severity: 'warning', category: 'format', message: `Не указан тип: «${c.name}» → «${label}»`, fix: '__RENDER__' });
    }
    if (c.typeGuessed) {
      issues.push({
        code: 'type-guessed',
        severity: 'warning',
        category: 'format',
        message: `Не указан тип: «${c.name}» — похоже на улицу, «ул. ${fixNameCase(c.name)}» (если это переулок или проспект — поправьте)`,
        fix: '__RENDER__',
      });
    }
    if (c.shorthand && c.level === 'house') {
      const flat = comps.find((o) => o.comp.shorthand && o.comp.level === 'flat');
      issues.push({ code: 'shorthand', severity: 'warning', category: 'format', message: `«${c.name}-${flat?.comp.name}» понято как «д. ${c.name}, кв. ${flat?.comp.name}»`, fix: '__RENDER__' });
    } else if (c.typeImplicit && !c.shorthand) {
      issues.push({ code: 'type-missing', severity: 'warning', category: 'format', message: `Номер без обозначения: «${c.name}» → «${c.type?.short} ${c.name}»`, fix: '__RENDER__' });
    }
    if (c.typeMisplaced) {
      issues.push({ code: 'type-misplaced', severity: 'warning', category: 'format', message: `Тип стоит после названия: «${c.name} ${c.typeText}» → «${c.type?.short} ${c.name}»`, fix: '__RENDER__' });
    }
    if (c.type && c.typeText && c.level !== 'region') {
      const want = t.typeStyle === 'short' ? c.type.short : c.type.full;
      const written = c.typeText;
      if (normWord(written) !== normWord(want)) {
        issues.push({ code: 'type-form', severity: 'warning', category: 'format', message: `«${written}» → «${want}»`, fix: '__RENDER__' });
      } else if (t.typeStyle === 'short' && needsDot(c.type) && !written.endsWith('.')) {
        issues.push({ code: 'type-dot', severity: 'warning', category: 'format', message: `Сокращение без точки: «${written}» → «${want}»`, fix: '__RENDER__' });
      } else if (written !== want && written.toLowerCase() === want.toLowerCase()) {
        issues.push({ code: 'type-case', severity: 'info', category: 'format', message: `Регистр сокращения: «${written}» → «${want}»`, fix: '__RENDER__' });
      }
    }
    if (c.level === 'region' && r.node && !c.typeInferred && !c.typeMisplaced && !nameIsBadCase(c.name)) {
      const written = clean.slice(c.start, c.end);
      const want = gaz.label(r.node, t.regionStyle);
      if (normWord(written).replace(/\s+/g, ' ') !== normWord(want).replace(/\s+/g, ' ')) {
        issues.push({ code: 'region-form', severity: 'warning', category: 'format', message: `Регион по шаблону: «${written}» → «${want}»`, fix: '__RENDER__' });
      }
    }
    if (c.level && NAMED_LEVELS.includes(c.level) && nameIsBadCase(c.name)) {
      issues.push({ code: 'name-case', severity: 'warning', category: 'format', message: `Регистр названия: «${c.name}» → «${r.node?.name ?? fixNameCase(c.name)}»`, fix: '__RENDER__' });
    } else if (r.node && !r.node.region && r.node.name !== c.name && normWord(r.node.name) === normWord(c.name)) {
      issues.push({ code: 'name-spelling', severity: 'info', category: 'format', message: `Написание по справочнику: «${r.node.name}»`, fix: '__RENDER__' });
    }
  }

  // 9. Повторы уровней.
  const seen = new Map<Level, number>();
  for (const r of comps) {
    if (!r.comp.level) continue;
    seen.set(r.comp.level, (seen.get(r.comp.level) ?? 0) + 1);
  }
  for (const [lvl, n] of seen) {
    if (n > 1 && lvl !== 'settlement' && lvl !== 'area') {
      issues.push({ code: 'duplicate-level', severity: 'warning', category: 'format', message: `Часть «${LEVEL_LABELS[lvl]}» указана ${n} раза` });
    }
  }

  // 10. Порядок частей и запятые.
  const original = resolved.filter((r) => r.comp.level && r.comp.level !== 'index' && r.comp.level !== 'country');
  const ranks = original.map((r) => levelRank(r.comp.level!));
  const dir = t.order === 'big-to-small' ? 1 : -1;
  const badOrder = ranks.some((rk, i) => i > 0 && (rk - ranks[i - 1]) * dir < 0);
  if (badOrder) {
    const words = t.order === 'big-to-small' ? 'от крупного к мелкому: регион → район → населённый пункт → улица → дом' : 'от мелкого к крупному: населённый пункт → район → регион → страна';
    issues.push({ code: 'order', severity: 'warning', category: 'order', message: `Нарушен порядок частей адреса. Нужно ${words}`, fix: '__RENDER__' });
  }
  if (t.separator.includes(',')) {
    const pairs: string[] = [];
    for (let i = 1; i < resolved.length; i++) {
      const a = resolved[i - 1].comp;
      const b = resolved[i].comp;
      if (a.segment === b.segment && a.segment >= 0 && !(a.shorthand && b.shorthand)) {
        pairs.push(`«${clean.slice(a.start, a.end)}» и «${clean.slice(b.start, b.end)}»`);
      }
    }
    if (pairs.length === 1) {
      issues.push({ code: 'missing-comma', severity: 'warning', category: 'format', message: `Не хватает запятой между ${pairs[0]}`, fix: '__RENDER__' });
    } else if (pairs.length > 1) {
      issues.push({ code: 'missing-comma', severity: 'warning', category: 'format', message: `Части адреса не разделены запятыми (${pairs.length} места)`, fix: '__RENDER__' });
    }
  }

  // 11. Сборка исправленного адреса по шаблону.
  const output = comps
    .filter((r) => !(t.index === 'never' && r.comp.level === 'index'))
    .filter((r) => !(t.country === 'never' && r.comp.level === 'country'))
    .filter((r) => !(t.district === 'never' && r.comp.level === 'district'))
    .map((r, i) => ({ r, i, rank: r.comp.level ? levelRank(r.comp.level) : NaN }));
  // Нераспознанные части встают сразу после соседа слева.
  output.forEach((o, i) => {
    if (Number.isNaN(o.rank)) o.rank = i > 0 ? output[i - 1].rank + 0.5 : 0.5;
  });
  output.sort((a, b) => (a.rank - b.rank) * dir || a.i - b.i);
  // Индекс всегда в начале (для обратного порядка — тоже в начале, как пишут на конвертах).
  const idx = output.findIndex((o) => o.r.comp.level === 'index');
  if (idx > 0) output.unshift(...output.splice(idx, 1));
  const texts = output.map((o) => renderComponent(o.r.comp, o.r.node, t, gaz));
  const suggestion = texts.join(t.separator);

  for (const is of issues) if (is.fix === '__RENDER__') is.fix = suggestion;

  if (suggestion !== value && !issues.some((i) => i.fix)) {
    issues.push({ code: 'format', severity: 'info', category: 'format', message: 'Формат отличается от шаблона', fix: suggestion });
  }

  // 12. Части для отображения.
  const parts: AddressPart[] = output.map((o, k) => {
    const c = o.r.comp;
    const known = !!o.r.node;
    const isUnknown = c.level === null;
    const named = c.level && NAMED_LEVELS.includes(c.level) && c.level !== 'street';
    return {
      level: c.level,
      levelLabel: c.level ? LEVEL_LABELS[c.level] : 'Не распознано',
      text: texts[k],
      original: o.r.added ? '' : clean.slice(c.start, c.end),
      known,
      node: o.r.node ?? undefined,
      chain: o.r.node && o.r.node.type !== 'country' ? gaz.chain(o.r.node) : undefined,
      status: conflicts.has(o.r) ? 'error' : isUnknown ? 'warning' : named && !known ? 'info' : 'ok',
    };
  });
  return { parts, issues, suggestion, regionNode };
}
