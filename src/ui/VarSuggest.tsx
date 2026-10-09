import { Variable as VariableIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVariables } from '@/core/variables/variables';
import type { Variable } from '@/core/variables/types';

/*
 * Подсказки глобальных переменных — как в редакторе кода: в любом поле ввода нажмите Ctrl+Пробел,
 * появится список переменных. Сами по себе подсказки не всплывают — только по нажатию.
 * Слово перед курсором (или «<ключ») фильтрует список; ↑↓ — выбор, Enter или Tab — вставить, Esc — закрыть.
 */

type Editable = HTMLInputElement | HTMLTextAreaElement;

const TEXT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', '']);

function isEditable(el: EventTarget | null): el is Editable {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return false;
}

/** Записать значение так, чтобы React увидел изменение. */
function setNativeValue(el: Editable, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

interface OpenState {
  el: Editable;
  /** Начало и конец заменяемого фрагмента (слово перед курсором). */
  from: number;
  to: number;
  query: string;
  top: number;
  left: number;
  width: number;
}

function fragment(el: Editable): { from: number; to: number; query: string } {
  const caret = el.selectionStart ?? el.value.length;
  const m = /<?[\p{L}\p{N}_.-]*$/u.exec(el.value.slice(0, caret));
  const word = m?.[0] ?? '';
  return { from: caret - word.length, to: el.selectionEnd ?? caret, query: word.replace(/^</, '') };
}

function place(el: Editable) {
  const r = el.getBoundingClientRect();
  const width = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
  const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
  const below = r.bottom + 4;
  const top = below + 260 > window.innerHeight && r.top > 280 ? r.top - 4 - 260 : below;
  return { top, left, width };
}

export function VarSuggest() {
  const vars = useVariables();
  const [open, setOpen] = useState<OpenState | null>(null);
  const [active, setActive] = useState(0);
  const popRef = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    if (!open) return [] as Variable[];
    const q = open.query.toLowerCase();
    if (!q) return vars.items;
    const hit = vars.items.filter((v) => [v.key, v.label, v.value].some((s) => s.toLowerCase().includes(q)));
    return hit.length ? hit : vars.items;
  }, [open, vars.items]);
  const filtered = !!open?.query && list !== vars.items;

  const close = useCallback(() => setOpen(null), []);

  const insert = useCallback(
    (v: Variable) => {
      if (!open) return;
      const { el, from, to } = open;
      const next = el.value.slice(0, from) + v.value + el.value.slice(to);
      setNativeValue(el, next);
      el.focus();
      const caret = from + v.value.length;
      el.setSelectionRange?.(caret, caret);
      setOpen(null);
    },
    [open],
  );

  // Открытие по Ctrl+Пробел и управление списком с клавиатуры.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open && e.target === open.el) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          setActive((a) => (list.length ? (a + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length : 0));
          return;
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && list[active]) {
          e.preventDefault();
          e.stopPropagation();
          insert(list[active]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
          return;
        }
      }
      if (e.ctrlKey && !e.altKey && (e.code === 'Space' || e.key === ' ') && isEditable(e.target)) {
        e.preventDefault();
        const el = e.target;
        setOpen({ el, ...fragment(el), ...place(el) });
        setActive(0);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, list, active, insert, close]);

  // Пока список открыт, ввод в поле уточняет поиск; клик мимо, прокрутка и уход из поля — закрывают.
  useEffect(() => {
    if (!open) return;
    const { el } = open;
    const onInput = () => {
      const f = fragment(el);
      setOpen((o) => (o ? { ...o, ...f } : o));
      setActive(0);
    };
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node) || e.target === el) return;
      close();
    };
    const onBlur = () => setTimeout(() => !popRef.current?.contains(document.activeElement) && document.activeElement !== el && close(), 0);
    el.addEventListener('input', onInput);
    el.addEventListener('blur', onBlur);
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('blur', onBlur);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open?.el, close]);

  useEffect(() => {
    popRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;
  return (
    <div ref={popRef} className="var-suggest" style={{ top: open.top, left: open.left, width: open.width }} role="listbox" aria-label="Переменные">
      <div className="var-suggest__head small">
        <VariableIcon size={14} /> Переменные{filtered ? ` по «${open.query}»` : open.query ? ` — по «${open.query}» ничего, показаны все` : ''}
      </div>
      {!vars.items.length ? (
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
      ) : (
        <div className="var-suggest__list">
          {list.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`var-suggest__opt ${i === active ? 'is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => insert(v)}
            >
              <span className="var-suggest__label">{v.label}</span>
              <span className="var-suggest__value">{v.value}</span>
              <span className="var-suggest__key mono small">&lt;{v.key}&gt;</span>
            </button>
          ))}
        </div>
      )}
      <div className="var-suggest__foot small faint">↑↓ — выбрать · Enter — вставить · Esc — закрыть</div>
    </div>
  );
}
