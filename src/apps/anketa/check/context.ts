import { ENUM_BY_ID } from '@/core/schema/enums';
import type { Gazetteer } from '@/shared/address/gazetteer';
import type { SimpleDate } from '@/shared/check/dates';
import type { EnumSource } from '@/shared/check/enum';
import type { NameDictionaries } from '@/shared/people/check';
import type { AnketaRules } from '../model/rules';
import { EMAIL_DOMAINS, INSTITUTIONS, looseKey, SPECIALTIES, type IssuedByEntry, type SpecialtyEntry } from './dicts';

export interface EnumUserData {
  values: string[];
  hidden: string[];
}

/** Всё, что нужно проверке: шаблоны, справочники (встроенные + подтверждённые), сегодняшняя дата. */
export interface CheckContext {
  gaz: Gazetteer;
  rules: AnketaRules;
  now: SimpleDate;
  enums: Record<string, EnumSource>;
  names: NameDictionaries;
  emailDomains: Set<string>;
  /** Код подразделения → как пишется «Кем выдан». */
  issuedBy: Map<string, string>;
  /** Код направления → название. */
  specialties: Map<string, string>;
  /** Ключ названия → правильное написание. */
  institutions: Map<string, string>;
  squads: Map<string, string>;
}

export interface UserDictionaries {
  enums: Record<string, EnumUserData>;
  firstNames: string[];
  patronymics: string[];
  emailDomains: string[];
  issuedBy: IssuedByEntry[];
  specialties: SpecialtyEntry[];
  institutions: string[];
  squads: string[];
}

export const EMPTY_USER_DICTIONARIES: UserDictionaries = {
  enums: {},
  firstNames: [],
  patronymics: [],
  emailDomains: [],
  issuedBy: [],
  specialties: [],
  institutions: [],
  squads: [],
};

const lc = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

export function buildContext(gaz: Gazetteer, rules: AnketaRules, user: UserDictionaries, now: SimpleDate): CheckContext {
  const enums: Record<string, EnumSource> = {};
  for (const [id, def] of ENUM_BY_ID) {
    const u = user.enums[id] ?? { values: [], hidden: [] };
    enums[id] = {
      id,
      title: def.title,
      values: [...new Set([...def.values.filter((v) => !u.hidden.includes(v)), ...u.values])],
      aliases: def.aliases,
      closed: def.closed,
    };
  }
  return {
    gaz,
    rules,
    now,
    enums,
    names: { firstNames: new Set(user.firstNames.map(lc)), patronymics: new Set(user.patronymics.map(lc)) },
    emailDomains: new Set([...EMAIL_DOMAINS, ...user.emailDomains.map(lc)]),
    issuedBy: new Map(user.issuedBy.map((e) => [e.code, e.text])),
    specialties: new Map([...SPECIALTIES, ...user.specialties].map((e) => [e.code, e.name])),
    institutions: new Map([...INSTITUTIONS, ...user.institutions].map((n) => [looseKey(n), n])),
    squads: new Map(user.squads.map((n) => [looseKey(n), n])),
  };
}
