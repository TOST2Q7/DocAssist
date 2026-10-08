import { REGIONS, regionBySubject, regionsByOkato, type Region } from '@/shared/address/regions';
import type { AddressCheck } from '@/shared/address/check';
import { addDays, addYears, ageAt, compareDates, formatDate, parseValidDate } from '@/shared/check/dates';
import { confirm, err } from '@/shared/check/finalize';
import type { FieldCheck, Issue } from '@/shared/check/types';
import { builtinFirstName, genderByPatronymicEnding, surnameGenderForm } from '@/shared/people/names';
import { plural } from '@/core/util/format';
import type { CheckContext } from './context';
import { DICT, looseKey, specialtyLevel } from './dicts';
import { blankYear } from './fields';

/*
 * Перекрёстные проверки: поля сверяются друг с другом.
 * Запускаются до итогового вердикта, поэтому могут уточнить правильную форму поля
 * (например, «Кем выдан» по справочнику подразделений).
 */

export interface Slot {
  value: string;
  check: FieldCheck;
}

type Get = (fieldId: string) => Slot | undefined;

/** Значение для сверки: правильная форма, если её удалось построить, иначе как написано. */
const val = (s?: Slot) => (s ? (s.check.canonical ?? s.value).trim() : '');
const add = (s: Slot | undefined, issue: Issue) => s?.check.issues.push(issue);

/** Какие регионы упоминаются в тексте («МВД по Республике Хакасия» → Хакасия). */
export function mentionedRegions(text: string): Region[] {
  const words = text.toLowerCase().replace(/ё/g, 'е').split(/[^а-я-]+/).filter(Boolean);
  const found: Region[] = [];
  for (const r of REGIONS) {
    const first = r.name.toLowerCase().replace(/ё/g, 'е').split(/[\s-]/)[0];
    const stem = first.length > 5 ? first.slice(0, -2) : first;
    if (stem.length >= 4 && words.some((w) => w.startsWith(stem))) found.push(r);
  }
  return found;
}

export function crossChecks(get: Get, ctx: CheckContext): void {
  const now = ctx.now;
  const stampF = get('meta.timestamp');
  const stamp = parseValidDate(val(stampF).split(' ')[0]);

  // --- Возраст.
  const birthF = get('person.birthDate');
  const birth = parseValidDate(val(birthF));
  if (birth && birthF) {
    const age = ageAt(birth, now);
    birthF.check.meta = `${age} ${plural(age, ['год', 'года', 'лет'])}`;
    if (age < 14 || age > 100) add(birthF, err('age-invalid', 'consistency', `Возраст ${age} — так не может быть. Проверьте год рождения`));
    else if (age < ctx.rules.ageMin || age > ctx.rules.ageMax) add(birthF, confirm('age-range', 'consistency', `Возраст ${age} — вне обычного диапазона ${ctx.rules.ageMin}–${ctx.rules.ageMax} лет. Проверьте`));
    if (stamp && compareDates(birth, stamp) > 0) add(birthF, err('birth-after-form', 'consistency', 'Дата рождения позже даты заполнения анкеты'));
  }

  // --- Паспорт.
  const issueF = get('passport.issueDate');
  const issue = parseValidDate(val(issueF));
  if (birth && issue) {
    const at14 = addYears(birth, 14);
    if (compareDates(issue, at14) < 0) add(issueF, err('issue-before-14', 'consistency', `Паспорт выдан до 14 лет (14 лет исполнилось ${formatDate(at14)})`));
    for (const limit of [20, 45]) {
      const turned = addYears(birth, limit);
      if (compareDates(issue, turned) < 0 && compareDates(now, addDays(turned, 90)) > 0) {
        add(issueF, err('passport-expired', 'consistency', `Паспорт недействителен: выдан до ${limit} лет, а ${limit} лет исполнилось ${formatDate(turned)}. Нужны данные нового паспорта`));
        break;
      }
    }
  }
  if (issue && stamp && compareDates(issue, stamp) > 0) add(issueF, err('issue-after-form', 'consistency', 'Паспорт выдан позже даты заполнения анкеты'));

  const seriesF = get('passport.series');
  const series = val(seriesF).replace(/\D/g, '');
  const divF = get('passport.divisionCode');
  const div = val(divF).replace(/\D/g, '');
  const divRegion = div.length === 6 ? regionBySubject(div.slice(0, 2)) : undefined;
  if (series.length === 4 && issue && issue.y < blankYear(series) - 1) {
    add(seriesF, confirm('series-year', 'consistency', `Бланк серии ${series} изготовлен примерно в ${blankYear(series)} г., а паспорт выдан в ${issue.y} г. Проверьте серию и дату`));
  }
  if (series.length === 4 && divRegion) {
    const okato = regionsByOkato(series.slice(0, 2));
    if (okato.length && !okato.includes(divRegion)) {
      add(divF, confirm('series-division-region', 'consistency', `Серия паспорта (${okato.map((r) => r.short).join('/')}) и код подразделения (${divRegion.short}) из разных регионов. Проверьте`));
    }
  }

  // «Кем выдан»: регион в тексте и запись в справочнике подразделений.
  const issuedF = get('passport.issuedBy');
  if (issuedF && divRegion && val(issuedF)) {
    const mentioned = mentionedRegions(val(issuedF));
    if (mentioned.length && !mentioned.includes(divRegion)) {
      add(issuedF, err('issued-by-region', 'consistency', `В тексте упомянут регион ${mentioned.map((r) => r.short).join('/')}, а код подразделения ${div.slice(0, 3)}-${div.slice(3)} — ${divRegion.short}`));
    }
    const code = `${div.slice(0, 3)}-${div.slice(3)}`;
    const known = ctx.issuedBy.get(code);
    if (known) {
      if (looseKey(known) !== looseKey(val(issuedF))) {
        add(issuedF, err('issued-by-dictionary', 'dictionary', `Для подразделения ${code} в справочнике: «${known}»`, { span: [0, issuedF.value.length], fix: known }));
      }
      issuedF.check.canonical = known;
    } else if (issuedF.check.canonical) {
      add(
        issuedF,
        confirm('issued-by-unknown', 'dictionary', `Подразделения ${code} ещё нет в справочнике — сверьте текст с паспортом и подтвердите`, {
          action: { kind: 'add-word', dict: DICT.issuedBy, value: { code, text: issuedF.check.canonical }, label: `${code}: ${issuedF.check.canonical}` },
        }),
      );
    }
  }

  // --- Пол, имя, отчество, фамилия.
  const genderF = get('person.gender');
  const gender = val(genderF);
  const middle = val(get('person.middleName'));
  const byPatronymic = genderByPatronymicEnding(middle);
  const byName = builtinFirstName(val(get('person.firstName')));
  const inferred = byPatronymic ?? byName ?? null;
  if (genderF) {
    if (!gender && inferred) {
      for (const i of genderF.check.issues) if (i.code === 'empty') i.fix = inferred;
    } else if (gender === 'Мужской' || gender === 'Женский') {
      if (byPatronymic && byPatronymic !== gender) {
        add(genderF, err('gender-patronymic', 'consistency', `Отчество «${middle}» — ${byPatronymic === 'Мужской' ? 'мужское' : 'женское'}, а пол «${gender}»`, { fix: byPatronymic }));
      } else if (byName && byName !== gender) {
        add(genderF, err('gender-name', 'consistency', `Имя «${val(get('person.firstName'))}» — ${byName === 'Мужской' ? 'мужское' : 'женское'}, а пол «${gender}»`, { fix: byName }));
      }
    }
  }
  const surnameF = get('person.lastName');
  const form = surnameGenderForm(val(surnameF));
  const g = gender === 'Мужской' || gender === 'Женский' ? gender : inferred;
  if (form && g && form !== g) {
    add(surnameF, confirm('surname-gender', 'consistency', `Фамилия в ${form === 'Мужской' ? 'мужской' : 'женской'} форме, а пол — ${g === 'Мужской' ? 'мужской' : 'женский'}. Проверьте`));
  }

  // --- Отряд.
  const joinF = get('rso.joinDate');
  const join = parseValidDate(val(joinF));
  const leaveF = get('rso.leaveDate');
  const leave = parseValidDate(val(leaveF));
  if (birth && join && ageAt(birth, join) < 14) add(joinF, err('join-age', 'consistency', `На дату вступления не было 14 лет (${ageAt(birth, join)})`));
  if (join && leave && compareDates(leave, join) < 0) add(leaveF, err('leave-before-join', 'consistency', 'Дата исключения раньше даты вступления'));
  if (leaveF && !leave && !leaveF.check.issues.length) leaveF.check.meta = 'не исключён(а)';

  const regionText = val(get('person.region'));
  const region = REGIONS.find((r) => r.full === regionText || r.short === regionText) ?? null;
  if (region) {
    const branchF = get('rso.branch');
    const mentioned = mentionedRegions(val(branchF));
    if (branchF && mentioned.length && !mentioned.includes(region)) {
      add(branchF, err('branch-region', 'consistency', `Отделение относится к ${mentioned.map((r) => r.short).join('/')}, а регион анкеты — ${region.short}`));
    }
    const cardF = get('rso.cardNumber');
    const card = val(cardF);
    if (cardF && /^\d{2}/.test(card) && region.subject && card.slice(0, 2) !== region.subject && card.slice(0, 2) !== '00') {
      const cardRegion = regionBySubject(card.slice(0, 2));
      add(cardF, err('card-region', 'consistency', `Номер билета начинается с ${card.slice(0, 2)}${cardRegion ? ` (${cardRegion.short})` : ''}, а регион анкеты — ${region.short} (${region.subject})`));
    }
    const regF = get('person.regAddress');
    const regRegion = (regF?.check as AddressCheck | undefined)?.regionNode?.region;
    if (regF && regRegion && regRegion !== region) {
      add(regF, confirm('reg-other-region', 'consistency', `Регистрация в другом регионе (${regRegion.short}), чем в анкете (${region.short}) — проверьте`));
    }
  }

  // --- Учёба.
  const specF = get('edu.specialty');
  const code = val(specF).slice(0, 8);
  const level = /^\d{2}\.\d{2}\.\d{2}$/.test(code) ? specialtyLevel(code) : null;
  const courseF = get('edu.course');
  const courseN = Number(val(courseF));
  if (level && courseN > level.maxCourse) {
    add(courseF, err('course-level', 'consistency', `${courseN} курс не бывает для уровня «${level.title}» (направление ${code})`));
  }
  const inst = val(get('edu.institution')).toLowerCase();
  if (level && level.title !== 'СПО' && /колледж|техникум|училищ/.test(inst)) {
    add(specF, confirm('institution-level', 'consistency', `Колледж или техникум, а направление ${code} — ${level.title}. Проверьте код`));
  }
}
