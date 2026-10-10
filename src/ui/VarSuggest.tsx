import { BookOpen, Variable as VariableIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FIELD_BY_ID } from '@/core/schema/fields';
import { rankSuggestions, useSuggestions, type SuggestItem } from '@/core/suggest/suggest';
import { useVariables } from '@/core/variables/variables';
import type { Variable } from '@/core/variables/types';

/*
 * Подсказки в полях ввода — на всё приложение.
 *
 * 1. Словарь: то, что вы вводили в поле, запоминается (при выходе из поля) и при наборе в таком же поле —
 *    в любом приложении — появляется список лучших совпадений. ↓ — выбрать, Enter или Tab — подставить, Esc — скрыть.
 *    Поле участвует, если у него есть data-field (id поля общего языка) или data-kind (тип значения).
 * 2. Переменные: в любом поле нажмите Ctrl+Пробел — список глобальных переменных (и словаря этого поля).
 *    Слово перед курсором (или «<ключ») фильтрует список.
 */

type Editable = HTMLInputElement | HTMLTextAreaElement;

const TEXT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', '']);

function isEditable(el: EventTarget | null): el is Editable {
  // data-novars — у поля свои подсказки (окно кода).
  if (el instanceof HTMLElement && el.dataset.novars !== undefined) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return false;
}

/** Поле, для которого ведётся словарь. */
function fieldKey(el: Editable): { key: string; kind?: string } | null {
  const field = el.dataset.field;
  const kind = el.dataset.kind;
  if (!field && !kind) return null;
  return { key: field || kind!, kind };
}

/** Записать значение так, чтобы React увидел изменение. */
function setNativeValue(el: Editable, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

type Option = { type: 'var'; v: Variable } | { type: 'dict'; s: SuggestItem };

interface OpenState {
  el: Editable;
  /** vars — по Ctrl+Пробел; auto — подсказки словаря при наборе. */
  mode: 'vars' | 'auto';
  /** Заменяемый фрагмент для переменных (слово перед курсором). */
  from: number;
  to: number;
  query: string;
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

function fragment(el: Editable): { from: number; to: number; query: string } {
  const caret = el.selectionStart ?? el.value.length;
  const m = /<?[\p{L}\p{N}_.-]*$/u.exec(el.value.slice(0, caret));
  const word = m?.[0] ?? '';
  return { from: caret - word.length, to: el.selectionEnd ?? caret, query: word.replace(/^</, '') };
}

/** Под полем; если снизу не помещается — над ним, вплотную (нижним краем к полю). */
function place(el: Editable, height: number) {
  const r = el.getBoundingClientRect();
  const width = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const fitsBelow = r.bottom + 4 + height <= window.innerHeight || r.top < height + 8;
  return fitsBelow ? { top: r.bottom + 4, left, width } : { bottom: window.innerHeight - r.top + 4, left, width };
}

/** Примерная высота списка подсказок словаря. */
const autoHeight = (n: number) => Math.min(260, 34 + n * 46);

const fieldLabel = (key: string) => FIELD_BY_ID.get(key)?.label;

export function VarSuggest() {
  const vars = useVariables();
  const dict = useSuggestions();
  const [open, setOpen] = useState<OpenState | null>(null);
  const [active, setActive] = useState(0);
  const popRef = useRef<HTMLDivElement>(null);
  /** Значение поля в момент входа — чтобы запомнить только изменённое. */
  const startValue = useRef(new WeakMap<Editable, string>());
  /** Esc скрывает подсказки словаря до следующего ввода. */
  const muted = useRef<Editable | null>(null);

  const options = useMemo((): Option[] => {
    if (!open) return [];
    const fk = fieldKey(open.el);
    if (open.mode === 'auto') {
      if (!fk) return [];
      return rankSuggestions(dict.items, { key: fk.key, kind: fk.kind, text: open.el.value, limit: 5 }).map((s) => ({ type: 'dict' as const, s }));
    }
    const q = open.query.toLowerCase();
    const hit = q ? vars.items.filter((v) => [v.key, v.label, v.value].some((s) => s.toLowerCase().includes(q))) : vars.items;
    const list: Option[] = (hit.length ? hit : vars.items).map((v) => ({ type: 'var' as const, v }));
    if (fk) for (const s of rankSuggestions(dict.items, { key: fk.key, kind: fk.kind, text: open.query, limit: 5 })) list.push({ type: 'dict', s });
    return list;
  }, [open, vars.items, dict.items]);

  const close = useCallback(() => setOpen(null), []);

  const insert = useCallback(
    (o: Option) => {
      if (!open) return;
      const { el, from, to } = open;
      let next: string;
      let caret: number;
      if (o.type === 'var') {
        next = el.value.slice(0, from) + o.v.value + el.value.slice(to);
        caret = from + o.v.value.length;
      } else {
        next = o.s.value;
        caret = next.length;
        const fk = fieldKey(el);
        if (fk) dict.learn(fk.key, fk.kind, next);
      }
      setNativeValue(el, next);
      startValue.current.set(el, next);
      el.focus();
      el.setSelectionRange?.(caret, caret);
      muted.current = el;
      setOpen(null);
    },
    [open, dict],
  );

  // Клавиатура: Ctrl+Пробел открывает переменные; в открытом списке — стрелки, Enter, Tab, Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open && e.target === open.el && options.length) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setActive((a) => {
            if (a < 0) return e.key === 'ArrowDown' ? 0 : options.length - 1;
            return (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          });
          return;
        }
        // В подсказках словаря Enter срабатывает, только если строку выбрали стрелкой; Tab — берёт первую.
        const pick = e.key === 'Tab' ? options[Math.max(0, active)] : e.key === 'Enter' && active >= 0 ? options[active] : undefined;
        if (pick) {
          e.preventDefault();
          e.stopPropagation();
          insert(pick);
          return;
        }
      }
      if (open && e.target === open.el && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        muted.current = open.el;
        close();
        return;
      }
      if (e.ctrlKey && !e.altKey && (e.code === 'Space' || e.key === ' ') && isEditable(e.target)) {
        e.preventDefault();
        const el = e.target;
        setOpen({ el, mode: 'vars', ...fragment(el), ...place(el, 260) });
        setActive(0);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, options, active, insert, close]);

  // Набор текста: в режиме переменных уточняет поиск; в полях со словарём — показывает подсказки.
  useEffect(() => {
    const onInput = (e: Event) => {
      const el = e.target;
      if (!isEditable(el)) return;
      if (open?.mode === 'vars' && open.el === el) {
        const f = fragment(el);
        setOpen((o) => (o ? { ...o, ...f } : o));
        setActive(0);
        return;
      }
      if (muted.current === el) {
        muted.current = null;
        if (!(e as InputEvent).inputType) return; // это наша же подстановка
      }
      const fk = fieldKey(el);
      if (!fk || !dict.enabled || !el.value.trim()) {
        if (open?.el === el) close();
        return;
      }
      const found = rankSuggestions(dict.items, { key: fk.key, kind: fk.kind, text: el.value, limit: 5 }).length;
      if (!found) {
        if (open?.el === el) close();
        return;
      }
      setOpen({ el, mode: 'auto', from: 0, to: el.value.length, query: el.value, ...place(el, autoHeight(found)) });
      setActive(-1);
    };
    // Запоминаем введённое при выходе из поля.
    const onFocusIn = (e: FocusEvent) => {
      if (isEditable(e.target) && fieldKey(e.target)) startValue.current.set(e.target, e.target.value);
    };
    const onFocusOut = (e: FocusEvent) => {
      const el = e.target;
      if (!isEditable(el)) return;
      const fk = fieldKey(el);
      if (!fk) return;
      const before = startValue.current.get(el);
      if (before !== undefined && el.value !== before && el.value.trim()) dict.learn(fk.key, fk.kind, el.value);
      startValue.current.delete(el);
    };
    document.addEventListener('input', onInput, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [open, dict, close]);

  // Клик мимо, прокрутка и уход из поля закрывают список.
  useEffect(() => {
    if (!open) return;
    const { el } = open;
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || e.target === el) return;
      close();
    };
    const onBlur = () => setTimeout(() => !popRef.current?.contains(document.activeElement) && document.activeElement !== el && close(), 0);
    el.addEventListener('blur', onBlur);
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      el.removeEventListener('blur', onBlur);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open?.el, close]);

  useEffect(() => {
    popRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open || (open.mode === 'auto' && !options.length)) return null;

  const optionView = (o: Option, i: number) => (
    <button
      key={o.type === 'var' ? `v:${o.v.id}` : `d:${o.s.key}:${o.s.value}`}
      type="button"
      role="option"
      aria-selected={i === active}
      className={`var-suggest__opt ${i === active ? 'is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => setActive(i)}
      onClick={() => insert(o)}
    >
      {o.type === 'var' ? (
        <>
          <span className="var-suggest__label">{o.v.label}</span>
          <span className="var-suggest__value">{o.v.value}</span>
          <span className="var-suggest__key mono small">&lt;{o.v.key}&gt;</span>
        </>
      ) : (
        <>
          <span className="var-suggest__label">{o.s.value}</span>
          <span className="var-suggest__value">{fieldLabel(o.s.key) ?? 'из словаря'}</span>
          <span className="var-suggest__key small">×{o.s.count}</span>
        </>
      )}
    </button>
  );

  if (open.mode === 'auto') {
    return (
      <div ref={popRef} className="var-suggest var-suggest--auto" style={{ top: open.top, bottom: open.bottom, left: open.left, width: open.width }} role="listbox" aria-label="Подсказки">
        <div className="var-suggest__list">{options.map(optionView)}</div>
        <div className="var-suggest__foot small faint">
          <BookOpen size={12} /> из словаря · ↓ — выбрать · Tab — подставить · Esc — скрыть
        </div>
      </div>
    );
  }

  const varCount = options.filter((o) => o.type === 'var').length;
  const filtered = !!open.query && varCount < vars.items.length;
  return (
    <div ref={popRef} className="var-suggest" style={{ top: open.top, bottom: open.bottom, left: open.left, width: open.width }} role="listbox" aria-label="Переменные">
      <div className="var-suggest__head small">
        <VariableIcon size={14} /> Переменные{filtered ? ` по «${open.query}»` : open.query && vars.items.length ? ` — по «${open.query}» ничего, показаны все` : ''}
      </div>
      {!vars.items.length && (
        <div className="var-suggest__empty small">
          {vars.ready ? (
            <>
              Переменных пока нет. Сохраните значение через меню «⋯» → «Сохранить в переменные» или на странице{' '}
              <Link to="/variables" onMouseDown={(e) => e.preventDefault()} onClick={close}>
                «Глобальные переменные»
              </Link>
              .
            </>
          ) : (
            'Откройте рабочую папку — переменные хранятся в ней.'
          )}
        </div>
      )}
      {options.length > 0 && (
        <div className="var-suggest__list">
          {options.map((o, i) => (
            <div key={o.type === 'var' ? `v:${o.v.id}` : `d:${o.s.key}:${o.s.value}`}>
              {o.type === 'dict' && (i === 0 || options[i - 1].type !== 'dict') && <div className="var-suggest__sep small faint">Из словаря этого поля</div>}
              {optionView(o, i)}
            </div>
          ))}
        </div>
      )}
      <div className="var-suggest__foot small faint">↑↓ — выбрать · Enter — вставить · Esc — закрыть</div>
    </div>
  );
}
