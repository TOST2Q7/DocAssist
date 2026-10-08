import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="page page--narrow">
      <div className="card stack">
        <h1>Страница не найдена</h1>
        <p className="muted">Возможно, ссылка устарела или приложение было переименовано.</p>
        <Link to="/" className="btn btn--primary" style={{ alignSelf: 'flex-start' }}>
          На главную
        </Link>
      </div>
    </div>
  );
}
