# Памятка разработчика

Самое нужное на одной странице. Подробности — по ссылкам.

## 1. Запуск

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # типы
npm test             # тесты
npm run build:html   # собрать DocAssist.html (коммитить вместе с кодом)
```

## 2. Помощник `da` (Mac)

**Установка один раз:**

```bash
brew install gh node
gh auth login                # GitHub.com → HTTPS → браузер
./tools/install.sh           # команда da из любой папки
da doctor                    # всё ли на месте
```

**Каждый день:**

| Команда | Что делает |
|---|---|
| `da` | меню со всеми действиями |
| `da pull` | забрать свежее из `testing` (чужие коммиты сливает, историю не переписывает) |
| `da build` | собрать `DocAssist.html` / проверки / запуск для разработки |
| `da commit "текст"` | сохранить все изменения |
| `da push` | отправить (если на GitHub новое — предложит сначала `pull`) |
| `da sync` | `pull` + `push` разом |
| `da pr` | Pull Request `testing → main` |

Конфликт только в `DocAssist.html` — `da` пересоберёт его сам. Руками этот файл не правят.

**Релиз** — `da release` → **Выпустить релиз**:

1. `da` покажет прошлый релиз и спросит версию (как в `package.json` или новую — запишет сам).
2. Откроет черновик `docs/releases/vX.Y.Z.md` — коротко, простыми словами: строка «что нового», `## Изменения`
   (только главное), строка «Скачать».
3. Проверит тег, описание, версию на GitHub, тесты и выпустит релиз «vПрошлая - vНовая». Файлы
   (`DocAssist-X.Y.Z.html`, `DocAssist-web-X.Y.Z.zip`) GitHub соберёт за 3–5 минут.

Выпустили не то — там же **Удалить релиз** (вместе с тегом).

**Журнал грамоток** — `da journal`: создать пару ключей, прочитать журнал грамотки, распечатать запечатанную копию.
Ключ лежит только у вас в `~/.docassist/journal-key.json` — **сделайте резервную копию**, без него журналы не прочитать.
В репозиторий ключ не попадает (в код вписывается только замок, `src/core/vault/devkey.ts`).

Всё о `da` — [tools/README.md](../tools/README.md), релиз без Mac — [RELEASE-GUIDE.md](RELEASE-GUIDE.md).

## 3. Правила (кратко из [CLAUDE.md](../CLAUDE.md))

**Устройство**
- Каждое приложение — своя папка `src/apps/<id>/` и своя версия в `manifest.ts`. Новое приложение = новая папка с
  `manifest.ts`, реестр подхватит его сам.
- Приложение не импортирует код другого приложения и не читает его файлы. Общее — выносить в ядро
  (`src/core/`, `src/shared/`, `src/ui/`).
- Меняешь ядро — `grep` по `src/apps`, проверить всех, кто им пользуется.
- Общие данные — только через ядро: база людей (`core/people`), древа (`core/base`), переменные, словарь подсказок,
  поля анкеты (`core/schema/fields.ts`).
- Данные людей — только в грамотках (`core/gramotka`); свои данные приложения о человеке — в его разделе грамотки
  (`section`/`setSection`), не отдельным файлом. Значения полей людей — не в подсказки, журналы и имена файлов.

**Ветки и совместимость**
- Работаем в `testing`. Перед пушем — `da pull`, чужое сливать (merge), не перезаписывать.
- Внутри `testing` миграций не пишем: старый тестовый формат читается как пустой.
- Совместимость — только с `main`: изменил выпущенный там формат (`$type`/`$version`, пути, id полей, ключи
  настроек) — миграция `N → N+1` в `defineDocType` и предупреждение в описании изменения.

**Тексты и данные**
- Для работников — простые слова, без «Lua», «regex», «код». Техническое — только «для настройщика» и в «Справке».
- Примеры — только нейтральные: «Фамилия», «01.01.2000», «000-000-000 00», «Респ. Регион».

**Google и безопасность**
- К Google ходит только `src/core/google` (`@/core/google`), шифрование — только `src/core/vault` (способ наружу
  не выносить; фразу и пароль не хранить, восстановления нет).
- Повтор с паузой на `429`/`403 rateLimitExceeded`; `401` — новый токен; `404` — «пропал», ничего не создавать молча.
- Таблицы: читать одним запросом, писать одним пакетом, строку искать по ФИО, писать `RAW`.
- Файлы Диска — по ID, не по имени. Токен — только в памяти, никогда в файлы и копии настроек.
- Новый внешний адрес — точечно в CSP (`vite.config.ts`) и `TRUSTED` (`security.ts`). Никаких `*.google.com`.
- Расхождения «устройство ↔ Google» не решать молча — показать обе версии (`ui/ConflictDialog.tsx`).

## 4. Подключить сайт к Google

Один раз, бесплатно, ~20 минут. Пошагово с разбором ошибок — [GOOGLE-SETUP.md](GOOGLE-SETUP.md).

1. <https://console.cloud.google.com/> → **New project** `DocAssist` (без организации, карту не вводить).
2. **APIs & Services → Library** → включить **Drive API**, **Sheets API**, **Picker API**.
3. **Google Auth Platform**: тип **External**, без логотипа; пропуски — только `openid`, `userinfo.email`,
   `drive.file`. Сначала себя в **Test users**, после проверки — **Publish app**.
4. **Clients → Create client → Web application** → *Authorized JavaScript origins*: `https://tost2q7.github.io`
   (для разработки `http://localhost:5173` — лучше отдельным Client ID). Скопировать **Client ID**.
5. **Credentials → API key** → ограничить: *Websites* `https://tost2q7.github.io/*`, *API* — только Picker.
6. **IAM & Admin → Settings → Project number** (только цифры, не Project ID).
7. Вписать в `src/core/google/config.ts`:
   ```ts
   export const GOOGLE_CLIENT_ID = '…apps.googleusercontent.com';
   export const GOOGLE_API_KEY = 'AIzaSy…';
   export const GOOGLE_APP_ID = '1234567890';
   ```
   `npm run build:html` → коммит → пуш в `testing`.
8. GitHub: **Settings → Pages → Source: GitHub Actions**; **Settings → Environments → github-pages** — разрешить
   `testing`. Дождаться зелёного «Тесты и публикация» в **Actions**.
9. Проверка: <https://tost2q7.github.io/DocAssist/> → меню → **«Google и безопасность»** → **«Войти в Google»**.

Помнить:
- Ключи не секретные, их можно коммитить. **Client secret не нужен** — нигде не хранить.
- В `DocAssist.html` (открытие с `file://`) Google не работает — так задумано.
- Не включать Pages в других репозиториях аккаунта: адрес `tost2q7.github.io` у них общий с DocAssist.

| Ошибка | Что сделать |
|---|---|
| `origin_mismatch` | Адрес сайта в шаге 4 — точно, без пути и `/` в конце; ждать 5–30 минут |
| `access_denied` | Почту в Test users или Publish app |
| «API developer key is invalid» | Проверить шаги 2 и 5 |
| Файл выбран, но «не показан приложению» | Неверный `GOOGLE_APP_ID` (шаг 6) |

## 5. Где что лежит

| Путь | Что |
|---|---|
| `src/apps/<id>/` | приложения: `anketa`, `lichnye-dela`, `doc-generator` |
| `src/core/` | ядро: рабочая папка, грамотки, базы, схема полей, Google, сейф, безопасность |
| `src/core/registry/menu.ts` | служебные пункты меню |
| `src/content/` | частые вопросы, справка |
| `docs/releases/` | описания релизов |
| `.github/workflows/` | `deploy.yml` — сайт из `testing`, `release.yml` — файлы релиза |
| `tools/` | помощник `da` (bash 3.2, проверка: `shellcheck -x -s bash tools/da tools/lib/*.sh`) |
