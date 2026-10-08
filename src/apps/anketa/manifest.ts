import { lazy } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { AppManifest } from '@/core/registry/types';
import { APP_FOLDER } from './constants';
import { DICT, DICT_TITLES } from './check/dictIds';

const manifest: AppManifest = {
  id: 'anketa',
  title: 'Проверка анкет',
  summary: 'Строгая проверка таблицы анкет по шаблонам: любое отличие — ошибка, новые слова подтверждаются один раз. Исправления в один клик и новая таблица.',
  description:
    'Каждое поле должно в точности совпадать с шаблоном: адреса (по дереву регион → район → село → улица → индекс), ФИО (по справочнику имён), СНИЛС и ИНН (контрольные суммы), паспорт, даты, телефоны, почта. Поля сверяются между собой, ищутся дубли.',
  icon: ClipboardCheck,
  status: 'beta',
  version: '0.2.0',
  folder: APP_FOLDER,
  requiresWorkspace: true,
  badges: [{ kind: 'updated', label: 'Строгая проверка' }],
  dictionaries: [
    { id: DICT.firstNames, title: DICT_TITLES[DICT.firstNames], hint: 'Имена, которых нет во встроенном списке', addable: true },
    { id: DICT.patronymics, title: DICT_TITLES[DICT.patronymics], hint: 'Отчества, которых нет во встроенном списке', addable: true },
    { id: DICT.squads, title: DICT_TITLES[DICT.squads], hint: 'Пишутся в кавычках: «Название»', addable: true },
    { id: DICT.institutions, title: DICT_TITLES[DICT.institutions], hint: 'Официальные названия', addable: true },
    {
      id: DICT.specialties,
      title: DICT_TITLES[DICT.specialties],
      hint: 'Код и название; встроено ~45 популярных направлений',
      describe: (v) => {
        const e = v as { code: string; name: string };
        return `${e.code} ${e.name}`;
      },
    },
    {
      id: DICT.issuedBy,
      title: DICT_TITLES[DICT.issuedBy],
      hint: 'Код подразделения → как пишется «Кем выдан»',
      describe: (v) => {
        const e = v as { code: string; text: string };
        return `${e.code}: ${e.text}`;
      },
    },
    { id: DICT.emailDomains, title: DICT_TITLES[DICT.emailDomains], hint: 'Встроены gmail.com, mail.ru, yandex.ru и другие', addable: true },
  ],
  order: 10,
  component: lazy(() => import('./AnketaApp')),
};

export default manifest;
