import { useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { API, LUA_WORDS, type ApiEntry } from '../lua/docs';

/*
 * Окно кода на Lua — без тяжёлых редакторов: textarea с номерами строк и подсказками.
 *   Tab — отступ, Enter — новая строка с тем же отступом, Ctrl+Пробел — подсказки.
 *   Подсказки: функции среды (problem, cell, lib.…), названия столбцов внутри cell("…"),
 *   свои функции из «Моей библиотеки», слова Lua.
 */

export interface CodeEditorHandle {
  /** Вставить текст в позицию курсора. «|» — где окажется курсор. */
  insert(text: string): void;
  focus(): void;
}

interface Suggestion {
  label: string;
  insert: string;
  detail?: string;
  about?: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Строка с ошибкой — подсвечивается. */
  errorLine?: number;
  /** Названия столбцов — для cell("…"). */
  columns: string[];
  /** Свои функции из «Моей библиотеки». */
  functions?: string[];
  /** Названия древ — для base.*("…"). */
  trees?: string[];
  readOnly?: boolean;
  label: string;
  ref?: Ref<CodeEditorHandle>;
}

const INDENT = '  ';
const OPENERS = /(\bthen|\bdo|\belse|\bfunction\b[^)]*\)|\brepeat|[{(])\s*$/;

/** Положение курсора в textarea (относительно неё) — через невидимую копию текста. */
function caretPoint(ta: HTMLTextAreaElement, pos: number): { top: number; left: number; line: number } {
  const div = document.createElement('div');
  const cs = getComputedStyle(ta);
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderLeftWidth', 'tabSize'] as const) {
    div.style[p] = cs[p];
  }
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre';
  div.style.top = '0';
  div.style.left = '-9999px';
  div.textContent = ta.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = '​';
  div.appendChild(mark);
  document.body.appendChild(div);
  const top = mark.offsetTop - ta.scrollTop;
  const left = mark.offsetLeft - ta.scrollLeft;
  const line = parseFloat(cs.lineHeight) || 20;
  document.body.removeChild(div);
  return { top, left, line };
}

function suggestions(before: string, columns: string[], functions: string[], trees: string[], force = false): { from: number; items: Suggestion[] } | null {
  // Внутри строки после cell(" / inside = " / with = { " — названия столбцов.
  const str = /(cell\(\s*|inside\s*=\s*|with\s*=\s*\{[^}]*?)"([^"\n]*)$/.exec(before);
  if (str) {
    const q = str[2].toLowerCase();
    const items = columns.filter((c) => c.toLowerCase().includes(q)).map((c) => ({ label: c, insert: c, detail: 'столбец' }));
    return { from: before.length - str[2].length, items };
  }
  const treeStr = /(base\.\w+\(\s*|tree\s*=\s*)"([^"\n]*)$/.exec(before);
  if (treeStr) {
    const q = treeStr[2].toLowerCase();
    return { from: before.length - treeStr[2].length, items: trees.filter((t) => t.toLowerCase().includes(q)).map((t) => ({ label: t, insert: t, detail: 'древо' })) };
  }
  // В строке или комментарии — без подсказок.
  const line = before.slice(before.lastIndexOf('\n') + 1);
  if (/--/.test(line.replace(/"[^"]*"/g, '')) || (line.split('"').length - 1) % 2 === 1) return null;
  const word = /[A-Za-z_][A-Za-z0-9_.]*$/.exec(before);
  if (!word && !force) return null;
  const q = word?.[0] ?? '';
  // Набрано слово Lua целиком (end, then, local…) — подсказки мешали бы Enter.
  if (!force && (LUA_WORDS.includes(q) || (q.length < 2 && !q.includes('.')))) return null;
  const fromApi = (e: ApiEntry): Suggestion => ({ label: e.name, insert: e.insert, detail: e.signature, about: e.about });
  const api = API.filter((e) => /^[A-Za-z_.]+$/.test(e.name) && e.name !== q);
  const starts = api.filter((e) => e.name.startsWith(q)).map(fromApi);
  const inside = q.length >= 3 ? api.filter((e) => !e.name.startsWith(q) && e.name.includes(q)).map(fromApi) : [];
  const own = functions.filter((f) => f.startsWith(q) && f !== q).map((f) => ({ label: f, insert: `${f}(|)`, detail: 'моя библиотека' }));
  const words = LUA_WORDS.filter((w) => w.startsWith(q) && w !== q && !api.some((e) => e.name === w)).map((w) => ({ label: w, insert: w, detail: 'Lua' }));
  return { from: before.length - q.length, items: [...starts, ...own, ...inside, ...words].slice(0, 40) };
}

export function CodeEditor({ value, onChange, errorLine, columns, functions = [], trees = [], readOnly, label, ref }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<{ from: number; items: Suggestion[]; top: number; left: number } | null>(null);
  const [active, setActive] = useState(0);
  const lines = useMemo(() => value.split('\n').length, [value]);

  /** Заменить [from, to) на текст сразу в поле (курсор не прыгает, работает Ctrl+Z). «|» — где окажется курсор. */
  const replace = (from: number, to: number, text: string) => {
    const el = ta.current!;
    const caret = text.indexOf('|');
    const clean = text.replace('|', '');
    el.focus();
    el.setSelectionRange(from, to);
    // insertText сохраняет историю отмены и сам сообщает React об изменении.
    const done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, clean);
    if (!done || el.value.slice(from, from + clean.length) !== clean) {
      el.setRangeText(clean, from, to, 'end');
      onChange(el.value);
    }
    if (caret >= 0) el.setSelectionRange(from + caret, from + caret);
  };

  useImperativeHandle(ref, () => ({
    insert(text: string) {
      const el = ta.current;
      if (!el) return;
      replace(el.selectionStart, el.selectionEnd, text);
    },
    focus: () => ta.current?.focus(),
  }));

  const refresh = (force = false) => {
    const el = ta.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const s = suggestions(before, columns, functions, trees, force);
    if (!s || (!force && pos - s.from < 1 && !/"$/.test(before)) || !s.items.length) {
      setPop(null);
      return;
    }
    const p = caretPoint(el, s.from);
    setPop({ ...s, top: p.top + p.line + 4, left: Math.max(0, p.left) });
    setActive(0);
  };

  useEffect(() => {
    const sync = () => {
      if (gutter.current && ta.current) gutter.current.scrollTop = ta.current.scrollTop;
    };
    const el = ta.current;
    el?.addEventListener('scroll', sync);
    return () => el?.removeEventListener('scroll', sync);
  }, []);

  const accept = (s: Suggestion) => {
    const el = ta.current!;
    replace(pop!.from, el.selectionStart, s.insert);
    setPop(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (pop) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % pop.items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + pop.items.length) % pop.items.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        accept(pop.items[active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPop(null);
        return;
      }
    }
    if (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) {
      e.preventDefault();
      refresh(true);
      return;
    }
    const { selectionStart: a, selectionEnd: b, value: v } = el;
    if (e.key === 'Tab') {
      e.preventDefault();
      const lineStart = v.lastIndexOf('\n', a - 1) + 1;
      if (e.shiftKey) {
        if (v.startsWith(INDENT, lineStart)) {
          replace(lineStart, lineStart + INDENT.length, '');
          el.setSelectionRange(Math.max(lineStart, a - INDENT.length), Math.max(lineStart, b - INDENT.length));
        }
      } else replace(a, b, INDENT);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      const lineStart = v.lastIndexOf('\n', a - 1) + 1;
      const line = v.slice(lineStart, a);
      const indent = /^\s*/.exec(line)![0];
      replace(a, b, `\n${indent}${OPENERS.test(line.replace(/--.*$/, '')) ? INDENT : ''}`);
    }
  };

  return (
    <div className="code">
      <div className="code__gutter" ref={gutter} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={errorLine === i + 1 ? 'code__ln code__ln--error' : 'code__ln'}>
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={ta}
        className="code__text"
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        wrap="off"
        data-novars
        aria-label={label}
        rows={Math.min(24, Math.max(8, lines + 1))}
        onChange={(e) => {
          onChange(e.target.value);
          refresh();
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setPop(null), 150)}
        onClick={() => setPop(null)}
      />
      {pop && (
        <div className="code__pop" style={{ top: pop.top, left: `max(0px, min(${pop.left + 44}px, calc(100% - 320px)))` }} role="listbox" aria-label="Подсказки">
          <div className="code__items">
            {pop.items.map((s, i) => (
              <button
                type="button"
                key={s.label + i}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'code__item is-active' : 'code__item'}
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(s);
                }}
              >
                <span className="mono">{s.label}</span>
                {s.detail && <span className="code__detail">{s.detail}</span>}
              </button>
            ))}
          </div>
          {pop.items[active]?.about && <div className="code__about small">{pop.items[active].about}</div>}
          <div className="code__keys faint">↑↓ — выбрать · Enter или Tab — вставить · Esc — скрыть</div>
        </div>
      )}
    </div>
  );
}
