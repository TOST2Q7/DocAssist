import type { Issue } from '../model/types';
import { diffWords } from './diff';

/**
 * Значение с подсвеченными огрехами: лишнее и неверное — выделено, а там, где чего-то не хватает, —
 * маркер «▾» с подсказкой.
 */
export function MarkedValue({ value, issues }: { value: string; issues: Issue[] }) {
  const spans = issues
    .filter((i) => i.span)
    .map((i) => ({ start: i.span![0], end: i.span![1], kind: i.category === 'glued' ? 'glued' : i.level, title: i.message }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (!spans.length) return null;
  const parts: React.ReactNode[] = [];
  let pos = 0;
  spans.forEach((s, k) => {
    if (s.start < pos) return;
    if (s.start > pos) parts.push(value.slice(pos, s.start));
    if (s.start === s.end) {
      parts.push(
        <mark key={k} className={`hl hl--gap hl--${s.kind}`} title={s.title} aria-label={s.title}>
          ▾
        </mark>,
      );
      return;
    }
    const text = value.slice(s.start, s.end);
    parts.push(
      <mark key={k} className={`hl hl--${s.kind}`} title={s.title}>
        {/\s/.test(text) ? text.replace(/ /g, '·').replace(/\u00a0/g, '⍽').replace(/\t/g, '→').replace(/\n/g, '↵') : text}
      </mark>,
    );
    pos = s.end;
  });
  if (pos < value.length) parts.push(value.slice(pos));
  return <div className="marked">{parts}</div>;
}

/** Пословная разница: удалённое зачёркнуто, добавленное выделено. Короткие значения — целиком «было → стало». */
export function Diff({ from, to }: { from: string; to: string }) {
  if (from.length <= 24 && to.length <= 32) {
    return (
      <span className="diff">
        {from && (
          <>
            <del>{from}</del>
            <span className="diff__arrow"> → </span>
          </>
        )}
        <ins>{to}</ins>
      </span>
    );
  }
  const parts = diffWords(from, to);
  // Если изменений много (например, переставлены части адреса), пословная разница нечитаема —
  // показываем две строки: «было» и «стало».
  const changed = parts.filter((p) => p.type !== 'same' && p.text.trim()).length;
  if (changed > 4) {
    return (
      <span className="diff diff--stacked">
        <del>{from}</del>
        <ins>{to}</ins>
      </span>
    );
  }
  return (
    <span className="diff">
      {parts.map((p, i) =>
        p.type === 'same' ? (
          <span key={i}>{p.text}</span>
        ) : p.type === 'del' ? (
          <del key={i}>{/^\s+$/.test(p.text) ? p.text.replace(/ /g, '·') : p.text}</del>
        ) : (
          <ins key={i}>{p.text}</ins>
        ),
      )}
    </span>
  );
}
