import { closest, normalizeForCompare } from '../text/text';
import { confirm, err } from './finalize';
import type { FieldCheck } from './types';

/*
 * Списки значений. Правильно — только точное значение из списка (с учётом регистра).
 *  - другое написание того же значения (регистр, сокращение, опечатка) → ошибка с исправлением;
 *  - значения нет в списке: закрытый список (пол, форма обучения) → ошибка,
 *    открытый (должности, отряды…) → «подтвердить», после чего значение добавляется в справочник.
 */

export interface EnumSource {
  id: string;
  title: string;
  values: string[];
  aliases?: Record<string, string>;
  closed: boolean;
}

export function checkEnum(value: string, src: EnumSource): FieldCheck {
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v) return { issues: [err('empty', 'missing', `Не заполнено. Варианты: ${src.values.slice(0, 5).join(', ')}${src.values.length > 5 ? '…' : ''}`)] };
  if (src.values.includes(v)) return { canonical: v, issues: [] };
  const nv = normalizeForCompare(v);
  const same = src.values.find((x) => normalizeForCompare(x) === nv);
  if (same) return { canonical: same, issues: [] };
  const whole: [number, number] = [0, value.length];
  const alias = src.aliases?.[nv];
  if (alias) return { canonical: alias, issues: [err('enum-alias', 'dictionary', `По справочнику пишется «${alias}»`, { fix: alias, span: whole })] };
  const near = closest(v, src.values);
  if (near) return { canonical: near, issues: [err('enum-typo', 'dictionary', `Опечатка? В справочнике: «${near}»`, { fix: near, span: whole })] };
  const list = `${src.values.slice(0, 6).join(', ')}${src.values.length > 6 ? '…' : ''}`;
  if (src.closed) return { issues: [err('enum-unknown', 'dictionary', `Недопустимое значение. Варианты: ${list}`)] };
  return {
    canonical: v,
    issues: [
      confirm('enum-unknown', 'dictionary', `«${v}» нет в справочнике «${src.title}». Если значение верное — подтвердите`, {
        action: { kind: 'add-word', dict: src.id, value: v, label: `${src.title}: ${v}` },
      }),
    ],
  };
}
