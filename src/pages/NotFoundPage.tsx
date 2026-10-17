import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Dimension } from '@/ui/Blueprint';

export function NotFoundPage() {
  return (
    <div className="page page--narrow">
      <div className="lost">
        <div className="kicker">Ошибка 404</div>
        <div className="measured">
          <h1>Лист не найден</h1>
          <Dimension>0 страниц по этому адресу</Dimension>
        </div>
        <p className="muted">Возможно, ссылка устарела или приложение было переименовано.</p>
        <Link to="/" className="btn btn--primary">
          На главную <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
