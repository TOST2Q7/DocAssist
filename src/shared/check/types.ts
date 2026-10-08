/*
 * Строгая проверка: общие типы.
 *
 * Уровни:
 *  - error   — значение не соответствует шаблону или правилу. Нужно исправить (или явно принять как есть);
 *  - confirm — автоматически проверить нельзя (нет в справочнике, подозрительное значение).
 *              Нужно подтвердить человеку — тогда значение попадёт в справочник.
 * «Предупреждений» нет: всё, что не подтверждено, не считается проверенным.
 */
import type { AddressPart } from '../address/types';

export type Level = 'error' | 'confirm';

export type Category =
  | 'format' // не совпадает с шаблоном
  | 'glued' // слипшиеся слова
  | 'chars' // недопустимые символы, пробелы
  | 'dictionary' // нет в справочнике / расходится со справочником
  | 'checksum' // контрольная сумма
  | 'consistency' // противоречие с другими полями
  | 'missing' // не заполнено или нет обязательной части
  | 'duplicate'; // совпадает с другой строкой

export type IssueAction =
  /** Добавить населённый пункт / улицу / район в дерево адресов. */
  | { kind: 'add-place'; name: string; type: string | null; parentPath: string[] | null; parentLabel: string | null }
  /** Запомнить индекс для населённого пункта. */
  | { kind: 'add-postal'; index: string; path: string[]; label: string }
  /** Добавить значение в справочник (список, имена, отряды, подразделения…). */
  | { kind: 'add-word'; dict: string; value: unknown; label: string };

export interface Issue {
  code: string;
  level: Level;
  category: Category;
  message: string;
  /** Участок значения для подсветки [start, end); пустой участок — место, где чего-то не хватает. */
  span?: [number, number];
  /** Полностью исправленное значение поля. */
  fix?: string;
  action?: IssueAction;
}

export interface FieldCheck {
  /** Единственно правильная форма значения по шаблону (если её удалось построить). */
  canonical?: string;
  /**
   * Форма «как написано, но без огрехов» — с ней сравнивается исходное значение, чтобы объяснить
   * мелкие отличия (регистр, точки, пробелы). Структурные отличия (порядок, недостающие части)
   * объясняются отдельными замечаниями. По умолчанию совпадает с canonical.
   */
  explainAgainst?: string;
  issues: Issue[];
  /**
   * Для полей фиксированного вида (телефон, СНИЛС, даты): если мелких отличий больше maxHunks,
   * вместо россыпи «не хватает «-»» показываем одно сообщение «Не по шаблону …».
   */
  collapse?: { maxHunks: number; message: string };
  parts?: AddressPart[];
  /** Короткая справка: «19 лет», «Респ. Хакасия». */
  meta?: string;
}

export const LEVEL_ORDER: Record<Level, number> = { error: 0, confirm: 1 };
