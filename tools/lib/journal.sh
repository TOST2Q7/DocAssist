# shellcheck shell=bash
# Журнал грамоток — для разработчика: пара ключей, чтение журнала, распечатка запечатанной копии.
# Работа с шифрованием — в tools/journal.mjs (Node.js), здесь только меню.

JOURNAL_KEY_FILE="${DOCASSIST_JOURNAL_KEY:-$HOME/.docassist/journal-key.json}"

journal_node() {
  if ! have node; then
    fail "Нужен Node.js. Установите: brew install node"
    return 1
  fi
  node "$ROOT/tools/journal.mjs" "$@"
}

# Путь к файлу или папке: можно перетащить в окно Терминала (тогда он в кавычках или с «\ » вместо пробелов).
ask_path() {
  local p
  p=$(ask "$1")
  p=${p%\"}; p=${p#\"}; p=${p%\'}; p=${p#\'}
  p=$(printf '%s' "$p" | sed 's/\\ / /g; s/[[:space:]]*$//')
  printf '%s' "$p"
}

# Замок в приложении — ещё заготовка (ключа к нему нет ни у кого)?
journal_placeholder() {
  grep -q 'DEVELOPER_LOCK_IS_PLACEHOLDER = true' "$ROOT/src/core/vault/devkey.ts" 2>/dev/null
}

journal_keys() {
  title "Пара ключей журнала"
  say "Замок (открытая половина) впишется в код приложения: им приложение закрывает журнал и запечатанные копии."
  say "Ключ (закрытая половина) — только у вас: $JOURNAL_KEY_FILE"
  if [ -f "$JOURNAL_KEY_FILE" ]; then
    warn "Ключ уже есть. Новая пара не отменит старую: старый ключ останется в файле для уже записанных журналов."
    confirm "Создать новую пару?" || return 0
  fi
  journal_node keys || return 1
  if confirm "Сохранить изменение (замок в коде) и отправить на GitHub?" y; then
    run git add src/core/vault/devkey.ts && run git commit -m "Журнал грамоток: свой замок разработчика" && cmd_push
  fi
}

journal_read() {
  local p
  p=$(ask_path "Файл .gramotka или папка «Грамотка XXXX» (можно перетащить сюда)")
  [ -n "$p" ] || return 0
  journal_node read "$p"
}

journal_unseal() {
  local p out
  p=$(ask_path "Запечатанная копия: файл .gramotka или папка «Грамотка XXXX» (можно перетащить сюда)")
  [ -n "$p" ] || return 0
  out=$(ask "Куда распечатать" "$HOME/Desktop/Распечатанная грамотка")
  journal_node unseal "$p" "$out" && open_url "$out"
}

cmd_journal() {
  if journal_placeholder; then warn "В приложении ещё заготовка замка — журналы новых грамоток не прочитает никто. Создайте пару ключей (пункт 1)."; fi
  choose "Журнал грамоток" "Создать пару ключей (замок — в приложение, ключ — только вам)" "Прочитать журнал грамотки: кто, кому и когда передавал" "Распечатать запечатанную копию (после перевода) в папку"
  case $CHOICE in
    1) journal_keys ;;
    2) journal_read ;;
    3) journal_unseal ;;
  esac
}
