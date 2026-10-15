import type { Step } from '@/core/base/tree';
import type { Institution } from '@/content/help/institutions';
import type { AnketaChecker } from '../lua/checker';
import { fieldLabel } from './checks';

/*
 * Учебные заведения из справки (приложения 1–5 пособия) → база проверки анкет.
 * Куда класть, решает код проверки столбцов: base.check() — отдельным списком,
 * base.check({ inside = "Место учебы" }) — направления внутри своего учебного заведения.
 */

const INSTITUTION = 'edu.institution';
const SPECIALTY = 'edu.specialty';

export interface SkippedValue {
  field: string;
  value: string;
  why: string;
}

export interface HelpImportPlan {
  /** Древо → пути, которые нужно добавить. */
  trees: Map<string, Step[][]>;
  /** Значения, которые не проходят проверку своего столбца, — в базу не идут. */
  skipped: SkippedValue[];
  /** Столбцы, код которых не берёт значения из базы. */
  unused: string[];
  institutions: number;
  specialties: number;
}

/** Ошибка проверки столбца (кроме «нет в базе»), или null — значение подходит. */
function whyNot(checker: AnketaChecker, fieldId: string, value: string, others: Record<string, string> = {}): string | null {
  const { result } = checker.test(fieldId, value, { trees: new Map() }, others);
  return result.issues.find((i) => i.level === 'error' && !i.base)?.text ?? null;
}

export function planHelpImport(checker: AnketaChecker, list: Institution[]): HelpImportPlan {
  const instUses = checker.usage(INSTITUTION).bases.filter((b) => b.key === INSTITUTION && !b.inside);
  const specUses = checker.usage(SPECIALTY).bases.filter((b) => b.key === SPECIALTY && (!b.inside || b.inside.key === INSTITUTION));
  const plan: HelpImportPlan = { trees: new Map(), skipped: [], unused: [], institutions: 0, specialties: 0 };
  if (!instUses.length) plan.unused.push(fieldLabel(INSTITUTION));
  if (!specUses.length) plan.unused.push(fieldLabel(SPECIALTY));
  const add = (tree: string, path: Step[]) => plan.trees.set(tree, [...(plan.trees.get(tree) ?? []), path]);
  const skip = (fieldId: string, value: string, why: string) => {
    const field = fieldLabel(fieldId);
    if (!plan.skipped.some((s) => s.field === field && s.value === value)) plan.skipped.push({ field, value, why });
  };

  for (const inst of list) {
    const instWhy = whyNot(checker, INSTITUTION, inst.short);
    if (instWhy) {
      skip(INSTITUTION, inst.short, instWhy);
      continue;
    }
    const instStep: Step = { k: INSTITUTION, v: inst.short };
    plan.institutions++;
    for (const b of instUses) add(b.tree, [instStep]);
    for (const spec of inst.specialties) {
      const why = whyNot(checker, SPECIALTY, spec, { [INSTITUTION]: inst.short });
      if (why) {
        skip(SPECIALTY, spec, why);
        continue;
      }
      plan.specialties++;
      for (const b of specUses) add(b.tree, b.inside ? [instStep, { k: SPECIALTY, v: spec }] : [{ k: SPECIALTY, v: spec }]);
    }
  }
  return plan;
}
