import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FAQ } from '@/content/faq';

export function FaqPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.setAttribute('open', '');
  }, [hash]);

  return (
    <div className="page page--narrow">
      <div className="page-head">
        <h1>Частые вопросы</h1>
        <p>Короткие ответы на то, о чём спрашивают чаще всего. Список будет пополняться.</p>
      </div>
      {FAQ.map((item) => (
        <details key={item.id} id={item.id} className="faq" open={FAQ.length === 1}>
          <summary>
            <span className="spacer">{item.question}</span>
            {item.temporary && <span className="badge badge--warning">временно</span>}
          </summary>
          <div className="faq__answer">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
