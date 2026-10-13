import { Copy, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';
import { markSeen } from '@/core/registry/badges';
import { useToast } from '@/ui/Toast';

/*
 * «Материалы РСО» — фирменный стиль и официальные документы в одном месте (подробно — docs/RSO-BRAND.md).
 * Ссылки ведут на трудкрут.рф и официальные статьи ВКонтакте — открываются, когда есть интернет.
 */

const SITE = 'https://xn--d1amqcgedd.xn--p1ai';

const COLORS = [
  { name: 'Синий РСО', hex: '#0054A6', specs: 'CMYK 100 · 75 · 0 · 0', note: 'основной: логотип, шапки, акценты', dark: true },
  { name: 'Белый', hex: '#FFFFFF', specs: 'CMYK 0 · 0 · 0 · 0', note: 'основной: фон, логотип на синем', dark: false },
];

const FONTS = [
  {
    name: 'Akrobat',
    role: 'Основной шрифт',
    use: 'Regular — текст; SemiBold, Bold и ExtraBold — заголовки и выделения.',
    license: 'Fontfabric, бесплатный (в том числе для коммерческого использования).',
    sample: 'Студенческий отряд «Пример» — 2026',
    family: "'Akrobat', 'Exo 2 Variable', sans-serif",
    upper: false,
  },
  {
    name: 'LIBRARY 3 AM',
    role: 'Дополнительный шрифт',
    use: 'Только Regular и только для заголовков.',
    license: 'Игорь Косинский, freeware.',
    sample: 'Трудовой семестр',
    family: "'LIBRARY 3 AM', 'Library 3 am', 'Oswald Variable', sans-serif",
    upper: true,
  },
];

const LOGO_RULES = [
  'Основные варианты — синий логотип на светлом фоне и белый на тёмном или синем. Цветные версии основными не бывают.',
  'Чёрный логотип запрещён (исключение — чёрно-белая печать).',
  'Только из оригинального векторного файла: не менять пропорции, не удалять и не добавлять элементы, без резких теней.',
  'Охранное поле — от ширины круга знака X: сверху 0,25X, по бокам 0,5X.',
  'Логотип всегда контрастен фону; цвета не из руководства не применяются.',
];

const LINKS: { title: string; href: string; text: string }[] = [
  { title: 'Фирменный стиль РСО', href: `${SITE}/mediakit.html`, text: 'Руководство по фирменному стилю и логотип для скачивания.' },
  {
    title: 'Логотип РСО, версия 1.1 (март 2025)',
    href: `${SITE}/theme/img_content/Logotip_Rossiiskikh_studencheskikh_otriadov.pdf`,
    text: 'PDF: версии логотипа, охранное поле, цвет, примеры недопустимого использования, «скачать все версии».',
  },
  {
    title: 'Руководство по фирменному стилю «РСО» — ВКонтакте',
    href: 'https://vk.com/@infosoko-guidebook-rso',
    text: 'Цвета и охранная зона логотипа, файлы логотипа в PDF, CDR и AI (старая редакция).',
  },
  {
    title: 'Фирменный стиль МООО «РСО». Основные элементы — ВКонтакте',
    href: 'https://vk.com/@mediabumaga-firmennyi-stil-osnovnye-elementy',
    text: 'Шрифты Akrobat и LIBRARY 3 AM, цвета, правила логотипа.',
  },
  { title: '«РСО всегда 20»: обновлённый стиль', href: `${SITE}/4171.html`, text: 'Юбилейный стиль 2024 года: звезда и её путь, пять вершин — пять ценностей отрядов.' },
  {
    title: 'Положение о символике и атрибутике',
    href: `${SITE}/theme/documents/polozhenie-o-simvolike-i-atributike.pdf`,
    text: 'Бойцовка, нашивки должностей (командир, комиссар, мастер…), лычки.',
  },
  { title: 'Положения РСО', href: `${SITE}/polozheniya.html`, text: 'Положение о линейном студенческом отряде, о штабах и другие.' },
  { title: 'Словарь бойца', href: `${SITE}/slovar_boytsa.html`, text: 'Термины студотрядов: бойцовка, командир, комиссар…' },
];

export function RsoPage() {
  const toast = useToast();
  useEffect(() => markSeen('menu:rso'), []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`Скопировано: ${text}`);
    } catch {
      toast('Браузер не дал доступ к буферу обмена');
    }
  };

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <div className="kicker">Фирменный стиль и документы</div>
        <h1>Материалы РСО</h1>
        <p>
          Официальные материалы Российских студенческих отрядов в одном месте — пригодятся для отрядных документов, объявлений
          и презентаций. По ним оформлен и DocAssist. Ссылки открываются, когда есть интернет.
        </p>
      </div>

      <div className="stack stack--l">
        <section className="stack">
          <h2>Цвета</h2>
          <p className="muted" style={{ margin: 0 }}>
            Основные цвета РСО — синий и белый, остальные оттенки — дополнительные. HEX синего получен переводом CMYK из
            руководства; для печати используйте CMYK.
          </p>
          <div className="swatches">
            {COLORS.map((c) => (
              <div key={c.hex} className="swatch">
                <div className={`swatch__color ${c.dark ? 'swatch__color--dark' : ''}`} style={{ background: c.hex }}>
                  {c.name}
                </div>
                <div className="swatch__body">
                  <div className="row row--nowrap">
                    <strong className="spacer mono">{c.hex}</strong>
                    <button className="icon-btn icon-btn--sm" onClick={() => copy(c.hex)} data-tip="Скопировать HEX" aria-label={`Скопировать ${c.hex}`}>
                      <Copy size={16} />
                    </button>
                  </div>
                  <div className="small mono">{c.specs}</div>
                  <div className="small muted">{c.note}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="stack">
          <h2>Шрифты</h2>
          {FONTS.map((f) => (
            <div key={f.name} className="card stack stack--s">
              <div className="row">
                <strong className="spacer">{f.name}</strong>
                <span className="badge">{f.role}</span>
              </div>
              <div className="font-sample" style={{ fontFamily: f.family, textTransform: f.upper ? 'uppercase' : undefined, fontWeight: f.upper ? 500 : undefined }}>
                {f.sample}
              </div>
              <div className="small">{f.use}</div>
              <div className="small muted">{f.license}</div>
            </div>
          ))}
          <p className="small muted" style={{ margin: 0 }}>
            Если шрифты установлены на компьютере, DocAssist показывает их. Если нет — близкие свободные шрифты, встроенные в
            приложение: Exo 2 вместо Akrobat и Oswald вместо LIBRARY 3 AM.
          </p>
        </section>

        <section className="stack">
          <h2>Логотип — коротко из руководства</h2>
          <ul className="rules-short">
            {LOGO_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="small muted" style={{ margin: 0 }}>
            В руководстве знак РСО описан как раскрытая книга, мастерок и солнце. Скачивайте логотип только с официальной страницы: перерисованный
            или сжатый из картинки логотип руководство не допускает.
          </p>
        </section>

        <section className="stack">
          <h2>Официальные ссылки</h2>
          <div className="list">
            {LINKS.map((l) => (
              <a key={l.href} className="list__item" href={l.href} target="_blank" rel="noreferrer">
                <div className="list__main">
                  <div className="list__title">{l.title}</div>
                  <div className="list__sub">{l.text}</div>
                </div>
                <ExternalLink size={16} className="faint" />
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
