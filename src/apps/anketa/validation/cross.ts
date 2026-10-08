import { REGIONS, regionBySubject, regionsByOkato, type Region } from '@/shared/address/regions';
import type { FieldResult, Issue } from '../model/types';
import { blankYear } from './documents';
import { addDays, addYears, ageAt, compareDates, formatDate, parseValidDate, type SimpleDate } from './dates';
import { plural } from '@/core/util/format';

/*
 * Перекрёстные проверки: поля сверяются друг с другом.
 * Например: серия паспорта и код подразделения из одного региона; паспорт выдан не раньше 14 лет.
 */

type Lookup = (fieldId: string) => FieldResult | undefined;

const valueOf = (f?: FieldResult) => (f ? (f.suggestion ?? f.value).trim() : '');

function add(f: FieldResult | undefined, issue: Issue) {
  if (f) f.issues.push(issue);
}

export function genderFromPatronymic(p: string): 'Мужской' | 'Женский' | null {
  const s = p.toLowerCase().trim();
  if (!s) return null;
  if (/(вич|ич|оглы|улы|уулу)$/.test(s)) return 'Мужской';
  if (/(вна|чна|шна|кызы|гызы)$/.test(s)) return 'Женский';
  return null;
}

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

export function crossChecks(get: Lookup, now: SimpleDate, ageMin: number, ageMax: number): void {
  const birthF = get('person.birthDate');
  const birth = parseValidDate(valueOf(birthF));

  // Возраст.
  if (birth && birthF) {
    const age = ageAt(birth, now);
    birthF.meta = `${age} ${plural(age, ['год', 'года', 'лет'])}`;
    if (age < ageMin || age > ageMax) {
      add(birthF, { code: 'age-range', severity: 'warning', category: 'consistency', message: `Возраст ${age} — вне обычного диапазона ${ageMin}–${ageMax} лет. Проверьте год` });
    }
  }

  // Паспорт: дата выдачи и срок действия.
  const issueF = get('passport.issueDate');
  const issue = parseValidDate(valueOf(issueF));
  if (birth && issue) {
    const at14 = addYears(birth, 14);
    if (compareDates(issue, at14) < 0) {
      add(issueF, { code: 'issue-before-14', severity: 'error', category: 'consistency', message: `Паспорт выдан до 14 лет (14 лет исполнилось ${formatDate(at14)})` });
    }
    for (const limit of [20, 45]) {
      const turned = addYears(birth, limit);
      const deadline = addDays(turned, 90);
      if (compareDates(issue, turned) < 0 && compareDates(now, deadline) > 0) {
        add(issueF, {
          code: `passport-expired-${limit}`,
          severity: 'warning',
          category: 'consistency',
          message: `Паспорт выдан до ${limit} лет и должен был быть заменён (${limit} лет исполнилось ${formatDate(turned)}). Уточните новые данные паспорта`,
        });
        break;
      }
    }
  }

  // Серия паспорта: год бланка и регион.
  const seriesF = get('passport.series');
  const series = valueOf(seriesF).replace(/\D/g, '');
  const divF = get('passport.divisionCode');
  const div = valueOf(divF).replace(/\D/g, '');
  if (series.length === 4 && issue) {
    const year = blankYear(series);
    if (issue.y < year - 1) {
      add(seriesF, {
        code: 'series-year',
        severity: 'warning',
        category: 'consistency',
        message: `Бланк серии ${series} изготовлен примерно в ${year} г., а дата выдачи — ${issue.y} г. Проверьте серию и дату`,
      });
    }
  }
  const divRegion = div.length === 6 ? regionBySubject(div.slice(0, 2)) : undefined;
  if (series.length === 4 && divRegion) {
    const okatoRegions = regionsByOkato(series.slice(0, 2));
    if (okatoRegions.length && !okatoRegions.includes(divRegion)) {
      add(divF, {
        code: 'series-division-region',
        severity: 'warning',
        category: 'consistency',
        message: `Серия паспорта (${series.slice(0, 2)} — ${okatoRegions.map((r) => r.short).join('/')}) и код подразделения (${div.slice(0, 3)} — ${divRegion.short}) из разных регионов`,
      });
    }
  }
  const issuedF = get('passport.issuedBy');
  if (divRegion && issuedF) {
    const mentioned = mentionedRegions(valueOf(issuedF));
    if (mentioned.length && !mentioned.includes(divRegion)) {
      add(issuedF, {
        code: 'issued-by-region',
        severity: 'warning',
        category: 'consistency',
        message: `В «Кем выдан» упомянут регион ${mentioned.map((r) => r.short).join('/')}, а код подразделения — ${divRegion.short}`,
      });
    }
  }

  // Пол и отчество.
  const genderF = get('person.gender');
  const middle = valueOf(get('person.middleName'));
  const inferred = genderFromPatronymic(middle);
  if (genderF && inferred) {
    const g = valueOf(genderF);
    if (!g) {
      add(genderF, { code: 'gender-infer', severity: 'warning', category: 'missing', message: `Пол не указан. По отчеству — «${inferred}»`, fix: inferred });
    } else if (g !== inferred && (g === 'Мужской' || g === 'Женский')) {
      add(genderF, { code: 'gender-mismatch', severity: 'warning', category: 'consistency', message: `Отчество «${middle}» — ${inferred === 'Мужской' ? 'мужское' : 'женское'}, а пол «${g}»`, fix: inferred });
    }
  }

  // Даты в отряде.
  const joinF = get('rso.joinDate');
  const join = parseValidDate(valueOf(joinF));
  const leaveF = get('rso.leaveDate');
  const leave = parseValidDate(valueOf(leaveF));
  if (birth && join && ageAt(birth, join) < 14) {
    add(joinF, { code: 'join-age', severity: 'warning', category: 'consistency', message: `На дату вступления не было 14 лет (${ageAt(birth, join)})` });
  }
  if (join && leave && compareDates(leave, join) < 0) {
    add(leaveF, { code: 'leave-before-join', severity: 'error', category: 'consistency', message: 'Дата исключения раньше даты вступления' });
  }
  if (leaveF && !leave && !leaveF.issues.length) leaveF.meta = 'не исключён(а)';

  // Регион анкеты и всё, что с ним связано.
  const regionF = get('person.region');
  const regionText = valueOf(regionF);
  const region = REGIONS.find((r) => r.full === regionText || r.short === regionText) ?? null;
  if (region) {
    const branchF = get('rso.branch');
    const mentioned = mentionedRegions(valueOf(branchF));
    if (branchF && mentioned.length && !mentioned.includes(region)) {
      add(branchF, { code: 'branch-region', severity: 'warning', category: 'consistency', message: `Отделение относится к ${mentioned.map((r) => r.short).join('/')}, а регион анкеты — ${region.short}` });
    }
    const cardF = get('rso.cardNumber');
    const card = valueOf(cardF);
    if (cardF && /^\d{2}/.test(card) && region.subject && card.slice(0, 2) !== region.subject && card.slice(0, 2) !== '00') {
      const cardRegion = regionBySubject(card.slice(0, 2));
      add(cardF, {
        code: 'card-region',
        severity: 'warning',
        category: 'consistency',
        message: `Номер билета начинается с ${card.slice(0, 2)}${cardRegion ? ` (${cardRegion.short})` : ''}, а регион анкеты — ${region.short} (${region.subject})`,
      });
    }
    const regF = get('person.regAddress');
    const regNode = regF?.parts?.find((p) => p.level === 'region')?.node;
    if (regF && regNode?.region && regNode.region !== region) {
      add(regF, { code: 'reg-other-region', severity: 'info', category: 'consistency', message: `Регистрация в другом регионе (${regNode.region.short}), чем указан в анкете (${region.short}) — это допустимо, но проверьте` });
    }
  }
}
