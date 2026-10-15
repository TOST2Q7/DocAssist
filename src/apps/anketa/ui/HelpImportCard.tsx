import { BookOpen, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addPaths } from '@/core/base/base';
import { useWorkspace } from '@/core/workspace/WorkspaceContext';
import { ALL_INSTITUTIONS, INSTITUTIONS } from '@/content/help/institutions';
import { Alert } from '@/ui/Alert';
import { useToast } from '@/ui/Toast';
import type { AnketaChecker } from '../lua/checker';
import { planHelpImport, type SkippedValue } from '../model/helpImport';

/*
 * «Учебные заведения из справки»: приложения 1–5 пособия одной кнопкой попадают в базу,
 * и «Место учебы» / «Направление обучения» из этих списков проходят проверку без подтверждения.
 */

interface Outcome {
  added: number;
  total: number;
  skipped: SkippedValue[];
  error?: string;
}

export function HelpImportCard({ checker }: { checker: AnketaChecker }) {
  const { workspace } = useWorkspace();
  const toast = useToast();
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const list = useMemo(() => (city ? (INSTITUTIONS.find((c) => c.city === city)?.institutions ?? []) : ALL_INSTITUTIONS), [city]);
  const plan = useMemo(() => planHelpImport(checker, list), [checker, list]);
  const trees = [...plan.trees.keys()];
  const total = [...plan.trees.values()].reduce((n, p) => n + p.length, 0);

  const run = async () => {
    if (!workspace) return;
    setBusy(true);
    try {
      let added = 0;
      for (const [tree, paths] of plan.trees) added += await addPaths(workspace, tree, paths, { source: 'help', share: false });
      setOutcome({ added, total, skipped: plan.skipped });
      toast(added ? `Добавлено в базу: ${added}` : 'Всё уже есть в базе');
    } catch (e) {
      setOutcome({ added: 0, total, skipped: [], error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <div className="section-title">
        <h3 style={{ margin: 0 }}>
          <BookOpen size={18} className="brand-icon" /> Учебные заведения из справки
        </h3>
        <span className="muted small">
          заведений: {plan.institutions} · направлений: {plan.specialties}
        </span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Приложения 1–5 методического пособия: учебные заведения с кодами специальностей (
        <Link to="/help#appendix">посмотреть в справке</Link>). Добавьте их в базу — и «Место учебы» и «Направление обучения» из этих
        списков пройдут проверку без подтверждения. Добавлять можно повторно: то, что уже есть, пропускается. В «Предложения в базу» эти
        значения не уходят.
      </p>
      {plan.unused.length > 0 && (
        <Alert kind="warning">
          {plan.unused.length > 1 ? 'Столбцы' : 'Столбец'} «{plan.unused.join('», «')}» сейчас не {plan.unused.length > 1 ? 'сверяются' : 'сверяется'} с
          базой (так настроена проверка) — эти значения не будут добавлены.
        </Alert>
      )}
      <div className="row">
        <select className="select" style={{ width: 'auto' }} value={city} onChange={(e) => setCity(e.target.value)} aria-label="Город">
          <option value="">Все города ({ALL_INSTITUTIONS.length})</option>
          {INSTITUTIONS.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} — приложение {c.appendix} ({c.institutions.length})
            </option>
          ))}
        </select>
        <button className="btn btn--primary" onClick={() => void run()} disabled={busy || !total || !workspace}>
          <Plus size={16} /> Добавить в базу
        </button>
        {trees.length > 0 && (
          <span className="muted small">
            {trees.length > 1 ? 'в древа' : 'в древо'} «{trees.join('», «')}»
            {plan.trees.get(trees[0])?.some((p) => p.length > 1) ? ' — направления внутри своего учебного заведения' : ''}
          </span>
        )}
      </div>
      {outcome?.error && <Alert kind="error">Не удалось добавить: {outcome.error}</Alert>}
      {outcome && !outcome.error && (
        <Alert kind="success">
          Добавлено: {outcome.added}. Уже было в базе: {outcome.total - outcome.added}.
        </Alert>
      )}
      {plan.skipped.length > 0 && (
        <details className="small">
          <summary>Не подходят под проверку столбца — не добавляются ({plan.skipped.length})</summary>
          <ul style={{ margin: '8px 0 0' }}>
            {plan.skipped.map((s) => (
              <li key={s.field + s.value}>
                {s.field}: <span className="mono">{s.value}</span> <span className="muted">— {s.why}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
