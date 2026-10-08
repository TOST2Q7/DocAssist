import { PHONE_STYLES, type PhoneStyle } from '../model/rules';
import type { Issue } from '../model/types';
import type { SimpleCheck } from './documents';

export function formatPhone(national10: string, style: PhoneStyle): string {
  const [a, b, c, d] = [national10.slice(0, 3), national10.slice(3, 6), national10.slice(6, 8), national10.slice(8, 10)];
  switch (style) {
    case 'eight-compact':
      return `8(${a})${b}-${c}-${d}`;
    case 'eight':
      return `8 (${a}) ${b}-${c}-${d}`;
    case 'plus7':
      return `+7 (${a}) ${b}-${c}-${d}`;
    case 'plus7-compact':
      return `+7(${a})${b}-${c}-${d}`;
    case 'digits':
      return `8${national10}`;
  }
}

export function checkPhone(value: string, style: PhoneStyle): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'error', category: 'missing', message: 'Телефон не заполнен' }] };
  if (/[^\d\s()+\-.]/.test(v)) {
    return { issues: [{ code: 'phone-chars', severity: 'error', category: 'format', message: 'В номере есть лишние символы (буквы?). Укажите один номер телефона' }] };
  }
  const d = v.replace(/\D/g, '');
  let national: string | null = null;
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) national = d.slice(1);
  else if (d.length === 10) national = d;
  if (!national) {
    return { issues: [{ code: 'phone-length', severity: 'error', category: 'format', message: `Номер должен состоять из 11 цифр (8 или +7 и ещё 10), а здесь ${d.length}` }] };
  }
  const issues: Issue[] = [];
  if (national[0] !== '9') {
    issues.push({ code: 'phone-not-mobile', severity: 'info', category: 'consistency', message: `Номер не мобильный (код ${national.slice(0, 3)}). Если это ошибка — проверьте` });
  }
  const formatted = formatPhone(national, style);
  if (formatted !== v) {
    issues.push({ code: 'phone-format', severity: 'warning', category: 'format', message: `Формат номера: «${formatted}» (шаблон ${PHONE_STYLES[style]})`, fix: formatted });
  }
  return { issues, suggestion: formatted !== v ? formatted : undefined };
}

const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.ru': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmall.com': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'mail.ry': 'mail.ru',
  'mail.ri': 'mail.ru',
  'mal.ru': 'mail.ru',
  'maill.ru': 'mail.ru',
  'mail.tu': 'mail.ru',
  'mail.com.ru': 'mail.ru',
  'yandex.ry': 'yandex.ru',
  'yandeх.ru': 'yandex.ru',
  'yadex.ru': 'yandex.ru',
  'yandex.com.ru': 'yandex.ru',
  'yndex.ru': 'yandex.ru',
  'ya.ry': 'ya.ru',
  'bk.ry': 'bk.ru',
  'inbox.ry': 'inbox.ru',
  'list.ry': 'list.ru',
  'rambler.ry': 'rambler.ru',
  'ramler.ru': 'rambler.ru',
  'icloud.co': 'icloud.com',
  'iclod.com': 'icloud.com',
  'outlook.co': 'outlook.com',
};

const CYR_LOOKALIKE: Record<string, string> = { а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', к: 'k', м: 'm', т: 't', н: 'h', в: 'b' };

export function checkEmail(value: string, lowercase: boolean): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'error', category: 'missing', message: 'Почта не заполнена' }] };
  const issues: Issue[] = [];
  let fixed = v.replace(/\s+/g, '').replace(/,/g, '.').replace(/@{2,}/g, '@');
  if (/[а-яё]/i.test(fixed)) {
    const replaced = fixed.replace(/[а-яё]/gi, (ch) => CYR_LOOKALIKE[ch.toLowerCase()] ?? ch);
    issues.push({
      code: 'email-cyrillic',
      severity: 'error',
      category: 'typo',
      message: /[а-яё]/i.test(replaced) ? 'В адресе почты русские буквы — так не бывает' : 'В адресе почты русские буквы, похожие на латинские',
      fix: /[а-яё]/i.test(replaced) ? undefined : replaced,
    });
    fixed = replaced;
  }
  const at = fixed.lastIndexOf('@');
  if (at > 0) {
    const domain = fixed.slice(at + 1).toLowerCase();
    if (DOMAIN_TYPOS[domain]) {
      const corr = fixed.slice(0, at + 1) + DOMAIN_TYPOS[domain];
      issues.push({ code: 'email-domain-typo', severity: 'warning', category: 'typo', message: `Опечатка в домене: «${domain}» → «${DOMAIN_TYPOS[domain]}»`, fix: corr });
      fixed = corr;
    }
  }
  if (lowercase && fixed !== fixed.toLowerCase()) {
    issues.push({ code: 'email-case', severity: 'info', category: 'format', message: 'Почту лучше писать строчными буквами', fix: fixed.toLowerCase() });
    fixed = fixed.toLowerCase();
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(fixed)) {
    issues.push({ code: 'email-invalid', severity: 'error', category: 'format', message: 'Не похоже на адрес почты (нужно имя@домен.ru)' });
  } else if (fixed !== v && !issues.some((i) => i.fix)) {
    issues.push({ code: 'email-format', severity: 'warning', category: 'format', message: 'Лишние пробелы или знаки в адресе почты', fix: fixed });
  }
  return { issues, suggestion: fixed !== v ? fixed : undefined };
}

export function checkVk(value: string): SimpleCheck {
  const v = value.trim();
  if (!v) return { issues: [{ code: 'empty', severity: 'info', category: 'missing', message: 'Ссылка ВКонтакте не указана' }] };
  let id: string | null = null;
  const m = v.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:vk\.com|vk\.ru|vkontakte\.ru)\/([A-Za-z0-9_.]+)\/?(?:[?#].*)?$/i);
  if (m) id = m[1];
  else if (/^@?(id\d+|[A-Za-z][A-Za-z0-9_.]{2,})$/.test(v)) id = v.replace(/^@/, '');
  if (!id) return { issues: [{ code: 'vk-invalid', severity: 'warning', category: 'format', message: 'Не похоже на ссылку на страницу ВКонтакте (https://vk.com/…)' }] };
  const fixed = `https://vk.com/${id}`;
  if (fixed !== v) {
    return { issues: [{ code: 'vk-format', severity: 'warning', category: 'format', message: `Ссылка в полном виде: «${fixed}»`, fix: fixed }], suggestion: fixed };
  }
  return { issues: [] };
}
