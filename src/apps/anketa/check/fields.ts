import { checkAddress } from '@/shared/address/check';
import { REGIONS, regionBySubject, regionsByOkato } from '@/shared/address/regions';
import { parseAddress } from '@/shared/address/parse';
import type { Gazetteer } from '@/shared/address/gazetteer';
import { checkDate } from '@/shared/check/dates';
import { checkEnum } from '@/shared/check/enum';
import { confirm, err } from '@/shared/check/finalize';
import { fillMask, maskDigits, showMask } from '@/shared/check/mask';
import type { FieldCheck, Issue } from '@/shared/check/types';
import { checkNamePart } from '@/shared/people/check';
import { closest, fixAbbreviations, fixMixedScript, normalizeQuotes } from '@/shared/text/text';
import { templateFor } from '../model/rules';
import type { CheckContext } from './context';
import { DICT, looseKey, specialtyLevel } from './dicts';

/*
 * Проверка каждого поля анкеты по его шаблону.
 * Каждая функция строит правильную форму значения (canonical) и замечания, которые нельзя увидеть
 * простым сравнением (контрольные суммы, справочники). Итоговый вердикт — точное совпадение с canonical.
 */

type Validator = (value: string, ctx: CheckContext) => FieldCheck;

const clean = (v: string) => fixMixedScript(v.replace(/[ \t\r\n]+/g, ' ').replace(/[​-‍﻿]/g, '')).replace(/ {2,}/g, ' ').trim();
const digits = (v: string) => v.replace(/\D/g, '');
const whole = (v: string): [number, number] => [0, v.length];

// ---------- Документы ----------

export function snilsChecksum(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (9 - i);
  let cs = sum < 100 ? sum : sum === 100 || sum === 101 ? 0 : sum % 101;
  if (cs === 100) cs = 0;
  return String(cs).padStart(2, '0');
}

const snils: Validator = (v) => {
  if (!v.trim()) return { issues: [err('empty', 'missing', 'СНИЛС не заполнен')] };
  const d = digits(v);
  if (d.length !== 11) return { issues: [err('snils-length', 'format', `В СНИЛС 11 цифр (шаблон XXX-XXX-XXX XX), а здесь ${d.length}`)] };
  const canonical = fillMask(d, '999-999-999 99')!;
  const issues: Issue[] = [];
  if (Number(d.slice(0, 9)) > 1001998 && snilsChecksum(d.slice(0, 9)) !== d.slice(9)) {
    issues.push(err('snils-checksum', 'checksum', `Неверная контрольная сумма: для ${canonical.slice(0, 11)} должно быть ${snilsChecksum(d.slice(0, 9))}, а указано ${d.slice(9)}. Опечатка в цифрах`));
  }
  return { canonical, issues, collapse: { maxHunks: 2, message: 'Не по шаблону XXX-XXX-XXX XX' } };
};

function innDigit(d: string, w: number[]): number {
  return (w.reduce((s, x, i) => s + x * Number(d[i]), 0) % 11) % 10;
}

export function isValidInn12(d: string): boolean {
  return /^\d{12}$/.test(d) && innDigit(d, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(d[10]) && innDigit(d, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(d[11]);
}

const inn: Validator = (v) => {
  if (!v.trim()) return { issues: [err('empty', 'missing', 'ИНН не заполнен')] };
  const d = digits(v);
  if (d.length === 10) return { issues: [err('inn-org', 'format', '10 цифр — это ИНН организации. У человека ИНН из 12 цифр')] };
  if (d.length !== 12) return { issues: [err('inn-length', 'format', `В ИНН 12 цифр, а здесь ${d.length}`)] };
  const issues = isValidInn12(d) ? [] : [err('inn-checksum', 'checksum', 'Неверные контрольные цифры ИНН — опечатка в цифрах')];
  return { canonical: d, issues, collapse: { maxHunks: 2, message: 'ИНН пишется только цифрами' } };
};

/** Две последние цифры серии — год изготовления бланка. */
export function blankYear(series: string): number {
  const yy = Number(series.slice(2, 4));
  return yy >= 97 ? 1900 + yy : 2000 + yy;
}

const passportSeries: Validator = (v, ctx) => {
  if (!v.trim()) return { issues: [err('empty', 'missing', 'Серия паспорта не заполнена')] };
  let d = digits(v);
  const issues: Issue[] = [];
  if (d.length === 3) {
    d = '0' + d;
    issues.push(err('lost-zero', 'format', `Потерян ведущий ноль (так бывает в Excel): серия ${d}`, { span: whole(v), fix: d }));
  }
  if (d.length !== 4) return { issues: [err('series-length', 'format', `Серия паспорта — 4 цифры, а здесь ${d.length}`)] };
  const regions = regionsByOkato(d.slice(0, 2));
  if (!regions.length) issues.push(err('series-region', 'format', `Серии паспортов РФ не начинаются с ${d.slice(0, 2)} — проверьте`));
  const year = blankYear(d);
  if (year > ctx.now.y) issues.push(err('series-year', 'format', `Цифры ${d.slice(2)} означают год бланка ${year} — такого ещё не было`));
  return { canonical: d, issues, meta: regions.length ? `бланк ${year} г., ${regions.map((r) => r.short).join(' / ')}` : undefined };
};

const passportNumber: Validator = (v) => {
  if (!v.trim()) return { issues: [err('empty', 'missing', 'Номер паспорта не заполнен')] };
  const d = digits(v);
  if (d.length === 4 || d.length === 5) {
    const fixed = d.padStart(6, '0');
    return { canonical: fixed, issues: [err('lost-zero', 'format', `Потеряны ведущие нули (так бывает в Excel): номер ${fixed}`, { span: whole(v), fix: fixed })] };
  }
  if (d.length !== 6) return { issues: [err('number-length', 'format', `Номер паспорта — 6 цифр, а здесь ${d.length}`)] };
  return { canonical: d, issues: [] };
};

const divisionCode: Validator = (v) => {
  if (!v.trim()) return { issues: [err('empty', 'missing', 'Код подразделения не заполнен')] };
  const d = digits(v);
  if (d.length !== 6) return { issues: [err('division-length', 'format', `Код подразделения — 6 цифр (XXX-XXX), а здесь ${d.length}`)] };
  const canonical = fillMask(d, '999-999')!;
  const issues: Issue[] = [];
  const region = regionBySubject(d.slice(0, 2));
  if (!region) issues.push(err('division-region', 'format', `Код региона ${d.slice(0, 2)} не существует`));
  if (!'0123'.includes(d[2])) issues.push(err('division-level', 'format', `Третья цифра кода — уровень подразделения (0–3), а здесь ${d[2]}`));
  return { canonical, issues, meta: region?.short, collapse: { maxHunks: 2, message: 'Не по шаблону XXX-XXX' } };
};

const masked =
  (mask: (ctx: CheckContext) => string, label: string): Validator =>
  (v, ctx) => {
    const m = mask(ctx);
    if (!v.trim()) return { issues: [err('empty', 'missing', `${label}: не заполнено`)] };
    const filled = fillMask(digits(v), m);
    if (!filled) return { issues: [err('mask', 'format', `${label}: нужно ${maskDigits(m)} цифр по шаблону ${showMask(m)}`)] };
    return { canonical: filled, issues: [], collapse: { maxHunks: 2, message: `Не по шаблону ${showMask(m)}` } };
  };

// ---------- Контакты ----------

const phone: Validator = (v, ctx) => {
  if (!v.trim()) return { issues: [err('empty', 'missing', 'Телефон не заполнен')] };
  const d = digits(v);
  if (/[a-zа-яё]/i.test(v)) return { issues: [err('phone-chars', 'format', `В номере есть буквы. Нужен один номер по шаблону ${showMask(ctx.rules.phoneMask)}`)] };
  let national: string | null = null;
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) national = d.slice(1);
  else if (d.length === 10) national = d;
  if (!national) return { issues: [err('phone-length', 'format', `Нужен один номер: 8 и ещё 10 цифр (шаблон ${showMask(ctx.rules.phoneMask)}), а здесь ${d.length} цифр`)] };
  const canonical = fillMask(national, ctx.rules.phoneMask) ?? fillMask(national, '8(999)999-99-99')!;
  const issues = national[0] === '9' ? [] : [confirm('phone-not-mobile', 'consistency', `Номер не мобильный (код ${national.slice(0, 3)}) — проверьте`)];
  return { canonical, issues, collapse: { maxHunks: 2, message: `Не по шаблону ${showMask(ctx.rules.phoneMask)}` } };
};

const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.ru': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmall.com': 'gmail.com', 'gmeil.com': 'gmail.com',
  'mail.ry': 'mail.ru', 'mail.ri': 'mail.ru', 'mal.ru': 'mail.ru', 'maill.ru': 'mail.ru', 'mail.tu': 'mail.ru', 'mail.com.ru': 'mail.ru',
  'yandex.ry': 'yandex.ru', 'yadex.ru': 'yandex.ru', 'yandex.com.ru': 'yandex.ru', 'yndex.ru': 'yandex.ru', 'ya.ry': 'ya.ru',
  'bk.ry': 'bk.ru', 'inbox.ry': 'inbox.ru', 'list.ry': 'list.ru', 'rambler.ry': 'rambler.ru', 'ramler.ru': 'rambler.ru',
  'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com', 'outlook.co': 'outlook.com',
};
const CYR_TO_LAT: Record<string, string> = { а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', к: 'k', м: 'm', т: 't', н: 'h', в: 'b' };

const email: Validator = (v, ctx) => {
  if (!v.trim()) return { issues: [err('empty', 'missing', 'Почта не заполнена')] };
  let e = v.replace(/\s+/g, '').replace(/,/g, '.');
  e = e.replace(/[а-яё]/gi, (ch) => CYR_TO_LAT[ch.toLowerCase()] ?? ch);
  if (/[а-яё]/i.test(e)) return { issues: [err('email-cyrillic', 'chars', 'В адресе почты русские буквы — так не бывает')] };
  if (ctx.rules.emailLowercase) e = e.toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e)) return { issues: [err('email-invalid', 'format', 'Не похоже на адрес почты (нужно имя@домен.ru)')] };
  const at = e.lastIndexOf('@');
  let domain = e.slice(at + 1).toLowerCase();
  const issues: Issue[] = [];
  if (DOMAIN_TYPOS[domain]) {
    const pos = v.toLowerCase().lastIndexOf(domain);
    issues.push(err('email-domain-typo', 'format', `Опечатка в домене: «${domain}» → «${DOMAIN_TYPOS[domain]}»`, pos >= 0 ? { span: [pos, pos + domain.length] } : {}));
    domain = DOMAIN_TYPOS[domain];
    e = e.slice(0, at + 1) + domain;
  }
  if (!ctx.emailDomains.has(domain)) {
    issues.push(
      confirm('email-domain-unknown', 'dictionary', `Почтовый домен «${domain}» не встречался — проверьте, нет ли опечатки`, {
        action: { kind: 'add-word', dict: DICT.emailDomains, value: domain, label: `Почтовый домен: ${domain}` },
      }),
    );
  }
  return { canonical: e, issues };
};

const vk: Validator = (v) => {
  if (!v.trim()) return { issues: [err('empty', 'missing', 'Ссылка ВКонтакте не заполнена')] };
  const t = v.trim();
  const m = t.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:vk\.com|vk\.ru|vkontakte\.ru)\/([A-Za-z0-9_.]+)\/?(?:[?#].*)?$/i) ?? t.match(/^@?(id\d+|[A-Za-z][A-Za-z0-9_.]{2,})$/);
  if (!m) return { issues: [err('vk-invalid', 'format', 'Нужна ссылка на страницу: https://vk.com/id123 или https://vk.com/имя')] };
  return { canonical: `https://vk.com/${m[1].toLowerCase()}`, issues: [] };
};

// ---------- Регион и адреса ----------

function findRegion(text: string, gaz: Gazetteer) {
  const direct = gaz.find(text).find((n) => n.level === 'region');
  if (direct) return direct;
  for (const c of parseAddress(text, gaz).components) {
    const node = gaz.find(c.name).find((n) => n.level === 'region');
    if (node) return node;
  }
  return null;
}

const regionField: Validator = (v, ctx) => {
  const t = clean(v);
  if (!t) return { issues: [err('empty', 'missing', 'Регион не заполнен')] };
  const node = findRegion(t, ctx.gaz);
  if (!node?.region) {
    const near = closest(t, REGIONS.map((r) => (ctx.rules.regionStyle === 'full' ? r.full : r.short)), 3);
    return { issues: [err('region-unknown', 'dictionary', near ? `Неизвестный регион. Возможно, «${near}»?` : 'Неизвестный регион', near ? { fix: near } : {})] };
  }
  const canonical = ctx.rules.regionStyle === 'full' ? node.region.full : node.region.short;
  return { canonical, issues: [], meta: node.region.subject ? `код региона ${node.region.subject}` : undefined };
};

const address =
  (fieldId: string): Validator =>
  (v, ctx) =>
    checkAddress(v, templateFor(ctx.rules, fieldId), ctx.gaz);

// ---------- Учёба и отряд ----------

const quoted = (name: string, style: 'guillemets' | 'straight') => (style === 'guillemets' ? `«${name}»` : `"${name}"`);
const capFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const squad: Validator = (v, ctx) => {
  const t = clean(v);
  const inner = t.replace(/^["«“„'\s]+|["»”'\s.]+$/g, '').trim();
  if (!inner) return { issues: [err('empty', 'missing', 'Название отряда не заполнено')] };
  const known = ctx.squads.get(looseKey(inner));
  if (known) return { canonical: known, issues: [] };
  const canonical = quoted(capFirst(inner), ctx.rules.quoteStyle);
  return {
    canonical,
    issues: [
      confirm('squad-unknown', 'dictionary', `Отряда ${canonical} нет в справочнике — проверьте название и подтвердите`, {
        action: { kind: 'add-word', dict: DICT.squads, value: canonical, label: `Отряд: ${canonical}` },
      }),
    ],
  };
};

function balanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === '«') depth++;
    if (ch === '»' && --depth < 0) return false;
  }
  return depth === 0;
}

const institution: Validator = (v, ctx) => {
  const t = clean(v);
  if (!t) return { issues: [err('empty', 'missing', 'Место учёбы не заполнено')] };
  const known = ctx.institutions.get(looseKey(t));
  if (known) return { canonical: known, issues: [] };
  const g = normalizeQuotes(capFirst(fixAbbreviations(t)).replace(/[.,;]+$/, ''), 'guillemets');
  if (!balanced(g)) return { issues: [err('quotes-unbalanced', 'format', 'Непарные кавычки — проверьте название')] };
  const canonical = ctx.rules.quoteStyle === 'guillemets' ? g : g.replace(/[«»]/g, '"');
  return {
    canonical,
    issues: [
      confirm('institution-unknown', 'dictionary', `Учебного заведения «${canonical}» нет в справочнике — проверьте официальное название и подтвердите`, {
        action: { kind: 'add-word', dict: DICT.institutions, value: canonical, label: `Учебное заведение: ${canonical}` },
      }),
    ],
  };
};

const specialty: Validator = (v, ctx) => {
  const t = clean(v);
  if (!t) return { issues: [err('empty', 'missing', 'Направление обучения не заполнено')] };
  const m = t.match(/^(\d{2})\s*[.,/ ]?\s*(\d{2})\s*[.,/ ]?\s*(\d{2})\s*[-–—:.]?\s*(.*)$/);
  if (!m) return { issues: [err('specialty-code', 'format', 'Нужно: код и название, например «09.02.07 Информационные системы и программирование»')] };
  const code = `${m[1]}.${m[2]}.${m[3]}`;
  const name = capFirst(m[4].replace(/[.;,]+$/, '').trim());
  const level = specialtyLevel(code);
  const meta = level?.title;
  const known = ctx.specialties.get(code);
  if (known) {
    const canonical = `${code} ${known}`;
    if (looseKey(name) !== looseKey(known)) {
      return { canonical, meta, issues: [err('specialty-name', 'dictionary', `Для кода ${code} название по справочнику: «${known}»`, { span: whole(v), fix: canonical })] };
    }
    return { canonical, meta, issues: [] };
  }
  if (!name) return { meta, issues: [err('specialty-name', 'missing', `После кода ${code} нужно название направления`)] };
  const canonical = `${code} ${name}`;
  return {
    canonical,
    meta,
    issues: [
      confirm('specialty-unknown', 'dictionary', `Направления ${code} нет в справочнике — проверьте код и название и подтвердите`, {
        action: { kind: 'add-word', dict: DICT.specialties, value: { code, name }, label: `Направление: ${canonical}` },
      }),
    ],
  };
};

const course: Validator = (v) => {
  if (!v.trim()) return { issues: [err('empty', 'missing', 'Курс не заполнен')] };
  const d = digits(v);
  if (d.length !== 1) return { issues: [err('course-format', 'format', 'Курс — одна цифра (1–6)')] };
  const issues = Number(d) >= 1 && Number(d) <= 6 ? [] : [err('course-range', 'format', 'Курс от 1 до 6')];
  return { canonical: d, issues };
};

const group: Validator = (v) => {
  const t = clean(v);
  if (!t) return { issues: [err('empty', 'missing', 'Группа не заполнена')] };
  const canonical = t.replace(/\s*-\s*/g, '-').toUpperCase();
  if (!/^[0-9A-ZА-ЯЁ]+([- ][0-9A-ZА-ЯЁ]+)*$/.test(canonical)) return { issues: [err('group-chars', 'format', 'Группа: только буквы, цифры и дефис (например ИС-21)')] };
  return { canonical, issues: [] };
};

const issuedBy: Validator = (v) => {
  const t = clean(v);
  if (!t) return { issues: [err('empty', 'missing', 'Не указано, кем выдан паспорт')] };
  let canonical = capFirst(fixAbbreviations(t))
    .replace(/[^А-Яа-яЁё0-9 .,\-№()«»"]/g, '')
    .replace(/\bроссии\b/gi, 'России')
    .replace(/\s{2,}/g, ' ')
    .replace(/[.,;\s]+$/, '')
    .trim();
  canonical = normalizeQuotes(canonical, 'guillemets');
  return { canonical, issues: [] };
};

// ---------- Таблица проверок ----------

const enumField =
  (dict: string): Validator =>
  (v, ctx) =>
    checkEnum(v, ctx.enums[dict]);

const date =
  (required: boolean, future: 'error' | 'confirm', withTime = false): Validator =>
  (v, ctx) =>
    checkDate(v, { required, withTime, future, now: ctx.now });

export const VALIDATORS: Record<string, Validator> = {
  'meta.timestamp': date(true, 'error', true),
  'person.region': regionField,
  'person.lastName': (v, ctx) => checkNamePart(v, 'last', ctx.names),
  'person.firstName': (v, ctx) => checkNamePart(v, 'first', ctx.names),
  'person.middleName': (v, ctx) => checkNamePart(v, 'middle', ctx.names),
  'rso.position': enumField('rso.position'),
  'rso.branch': enumField('rso.branch'),
  'person.gender': enumField('person.gender'),
  'person.birthDate': date(true, 'error'),
  'person.snils': snils,
  'person.inn': inn,
  'person.phone': phone,
  'person.email': email,
  'passport.series': passportSeries,
  'passport.number': passportNumber,
  'person.birthPlace': address('person.birthPlace'),
  'passport.issuedBy': issuedBy,
  'passport.issueDate': date(true, 'error'),
  'passport.divisionCode': divisionCode,
  'person.regAddress': address('person.regAddress'),
  'person.factAddress': address('person.factAddress'),
  'rso.joinDate': date(true, 'confirm'),
  'rso.leaveDate': (v, ctx) => checkDate(v, { required: false, placeholder: ctx.rules.emptyDate, future: 'confirm', now: ctx.now }),
  'rso.cardNumber': masked((ctx) => ctx.rules.cardMask, 'Номер членского билета'),
  'rso.direction': enumField('rso.direction'),
  'rso.squad': squad,
  'rso.experience': enumField('rso.experience'),
  'edu.institution': institution,
  'edu.specialty': specialty,
  'edu.course': course,
  'edu.group': group,
  'edu.form': enumField('edu.form'),
  'person.vk': vk,
};

/** Столбцы, которых нет в анкете РСО: только пробелы и невидимые символы. */
export const freeText: Validator = (v) => ({ canonical: v.replace(/[ \t\r\n]+/g, ' ').replace(/[​-‍﻿]/g, '').replace(/ {2,}/g, ' ').trim(), issues: [] });
