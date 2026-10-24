import { Check, Minus } from 'lucide-react';
import { Fragment } from 'react';
import { SectionHead } from '@/ui/Blueprint';
import { InstallButton } from '@/ui/InstallButton';

/*
 * Что где доступно: версия-файл, сайт (или установленное приложение) и сайт с Google-аккаунтом.
 * Показывается на главной только в версии-файле — чтобы было видно, что даст переход на сайт и вход в Google.
 */

/** true — есть, false — нет, текст — есть, но с оговоркой. */
type Mark = boolean | string;

interface Row {
  what: string;
  /** Версия-файл, сайт, сайт + Google. */
  marks: [Mark, Mark, Mark];
}

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Работа с документами',
    rows: [
      { what: 'Проверка анкет из Excel и CSV', marks: [true, true, true] },
      { what: 'Личные дела бойцов, учётная карточка', marks: [true, true, true] },
      { what: 'База людей, переменные и подсказки', marks: [true, true, true] },
      { what: 'Всё хранится у вас — в рабочей папке; данные людей — в грамотках под вашей фразой', marks: [true, true, true] },
      { what: 'Без интернета', marks: ['всегда', 'после первого открытия', 'Google — только с интернетом'] },
    ],
  },
  {
    title: 'Установка и обновления',
    rows: [
      { what: 'Обновления', marks: ['вручную: скачать новый файл', 'сами', 'сами'] },
      { what: 'Установить как программу: свой значок и своё окно', marks: [false, true, true] },
      { what: 'Телефон и планшет', marks: [false, true, true] },
    ],
  },
  {
    title: 'С Google-аккаунтом',
    rows: [
      { what: 'Личные дела ↔ папка на Google Диске: папки по правилам, отправка сканов, изменения с Диска', marks: [false, false, true] },
      { what: 'Проверка анкет ↔ Google Таблицы: открыть таблицу и записать исправления обратно', marks: [false, false, true] },
      { what: 'Настройки на другом устройстве', marks: ['вручную', 'вручную', 'сами — через ваш Google Диск, под паролем'] },
      { what: 'Грамотки (данные людей) на другом устройстве', marks: ['вручную', 'вручную', 'сами — через ваш Google Диск, под фразой грамоток'] },
    ],
  },
];

const COLUMNS = ['Версия-файл', 'Сайт и приложение', 'Сайт + Google'];

function Cell({ mark }: { mark: Mark }) {
  if (mark === true)
    return (
      <span className="edition-yes" aria-label="есть">
        <Check size={18} />
      </span>
    );
  if (mark === false)
    return (
      <span className="edition-no" aria-label="нет">
        <Minus size={18} />
      </span>
    );
  return <span className="edition-note">{mark}</span>;
}

export function Editions({ no }: { no: string }) {
  return (
    <section className="section reveal">
      <SectionHead no={no} title="Версии DocAssist" aside="что станет доступно на сайте и с Google" />
      <div className="table-wrap editions">
        <table className="table">
          <thead>
            <tr>
              <th>Возможность</th>
              {COLUMNS.map((c, i) => (
                <th key={c} className={i === 0 ? 'editions__here' : i === 2 ? 'editions__google' : undefined}>
                  {c}
                  {i === 0 && <span className="editions__tag">у вас</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <Fragment key={g.title}>
                <tr className="editions__group">
                  <th colSpan={4} scope="colgroup">
                    {g.title}
                  </th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.what}>
                    <td>{r.what}</td>
                    {r.marks.map((m, i) => (
                      <td key={COLUMNS[i]} className={i === 0 ? 'editions__here' : i === 2 ? 'editions__google' : undefined}>
                        <Cell mark={m} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small editions__foot">
        Google работает только на сайте и в установленном приложении: у файла, открытого с диска, нет адреса, и Google его не
        пускает. Приложение видит на Диске только свои файлы и те, что вы сами выбрали, а данные идут из браузера прямо в
        Google. Если рабочая папка лежит на диске, на сайте выберите её же — и всё будет на месте.
      </p>
      <div className="row">
        <InstallButton />
      </div>
    </section>
  );
}
