import type { ReactNode } from 'react';
import { CARD_FIELD_BY_ID, type CardValues } from '../member-card/fields';
import { cellsFor, labelFor, placeText, slotText, type CardLayout } from '../member-card/fill';

interface Props {
  values: CardValues;
  layout: CardLayout | null;
  /** Знак у «информ. рассылка». */
  mark: string;
  /** Нажали на место в карточке — перейти к полю формы. */
  onPick: (fieldId: string) => void;
}

/**
 * Предпросмотр верхней части бланка: что и в какую строку попадёт. Нижнюю часть заполняет штаб.
 * Ширины ячеек — как в бланке, кегль — в той же пропорции к ширине листа, поэтому видно, что не помещается.
 */
export function CardPreview({ values, layout, mark, onPick }: Props) {
  const full = layout ? Math.max(0, ...[...layout.cells.values()].flat().map((c) => c.width)) : 0;
  const width = (twips?: number) => (twips && full > 0 ? { flex: `0 0 ${(twips / full) * 100}%` } : undefined);

  /** Место для значения; line — строка многострочного значения (адреса). */
  const v = (f: string, { line = 0, grow = false }: { line?: number; grow?: boolean } = {}) => {
    const text = slotText(values, f);
    const cells = layout && cellsFor(layout, f);
    const placed = cells ? placeText(cells, text) : { lines: text ? [text] : [], overflow: false };
    const shown = placed.lines[line] ?? '';
    const over = placed.overflow && line === placed.lines.length - 1;
    const required = f === 'fio' || CARD_FIELD_BY_ID.get(f)?.required;
    const missing = !text && required && line === 0;
    const cls = ['dg-pv', grow ? 'dg-pv--grow' : '', missing ? 'dg-pv--missing' : '', over ? 'dg-pv--over' : ''].filter(Boolean).join(' ');
    return (
      <button
        type="button"
        className={cls}
        style={width(cells?.[line]?.width)}
        onClick={() => onPick(f === 'fio' ? 'person.lastName' : f)}
        title={shown || undefined}
        data-tip={over ? 'Не помещается — Word перенесёт текст, строка станет выше' : missing ? 'Не хватает — нажмите, чтобы вписать' : undefined}
      >
        {shown || ' '}
      </button>
    );
  };
  /** Подпись места; field — чьё место (для ширины ячейки). */
  const l = (children: ReactNode, field?: string, twips?: number) => (
    <span className="dg-pl" style={width(twips ?? (field && layout ? labelFor(layout, field)?.width : undefined))}>
      {children}
    </span>
  );

  return (
    <div className="dg-paper-wrap">
      <div className="dg-paper" aria-label="Предпросмотр карточки">
        <div className="dg-paper__body">
        <div className="dg-paper__org">
          Молодёжная общероссийская общественная организация
          <br />
          «РОССИЙСКИЕ СТУДЕНЧЕСКИЕ ОТРЯДЫ»
        </div>
        <div className="dg-paper__title">УЧЕТНАЯ КАРТОЧКА ЧЛЕНА ОРГАНИЗАЦИИ</div>
        <div className="dg-prow dg-prow--end">
          {l(<small>№ членского билета</small>, 'rso.cardNumber')}
          {v('rso.cardNumber')}
        </div>
        <div className="dg-prow">
          {l('ФИО', 'fio')}
          {v('fio', { grow: true })}
        </div>
        <div className="dg-prow">
          {l('Дата рождения', 'person.birthDate')}
          {v('person.birthDate')}
        </div>
        <div className="dg-prow">
          {l('Место учебы', 'edu.institution')}
          {v('edu.institution', { grow: true })}
          {l('группа', 'edu.group')}
          {v('edu.group')}
        </div>
        <div className="dg-prow">
          {l('Место работы', 'work.place')}
          {v('work.place', { grow: true })}
          {l('должность', 'work.position')}
          {v('work.position')}
        </div>
        <div className="dg-prow">{l('Паспортные данные:')}</div>
        <div className="dg-prow">
          {l('Выдан', 'passport.issuedBy')}
          {v('passport.issuedBy', { grow: true })}
        </div>
        <div className="dg-prow">
          {l('Дата выдачи', 'passport.issueDate')}
          {v('passport.issueDate')}
          {l('Серия', 'passport.series')}
          {v('passport.series')}
          {l('Номер', 'passport.number')}
          {v('passport.number')}
        </div>
        <div className="dg-prow">
          {l('Адрес (постоянная регистрация) с индексом', 'person.regAddress')}
          {v('person.regAddress', { grow: true })}
        </div>
        <div className="dg-prow">{v('person.regAddress', { line: 1, grow: true })}</div>
        <div className="dg-prow">
          {l('Адрес фактического места жительства', 'person.factAddress')}
          {v('person.factAddress', { grow: true })}
        </div>
        <div className="dg-prow">{v('person.factAddress', { line: 1, grow: true })}</div>
        <div className="dg-prow">
          {l('Конт. тел.', 'person.phone')}
          {v('person.phone')}
          {l('е-mail', 'person.email')}
          {v('person.email', { grow: true })}
          {l(
            <>
              <span className="dg-mark">{mark}</span> информ. рассылка
            </>,
            undefined,
            layout?.mailing?.width,
          )}
        </div>
        <div className="dg-paper__rest">Ниже — членский билет, учёт, взносы и поощрения: их заполняет штаб.</div>
        </div>
      </div>
    </div>
  );
}
