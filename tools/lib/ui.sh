# shellcheck shell=bash
# shellcheck disable=SC2034  # CHOICE и цвета читаются в остальных файлах
# Оформление и вопросы в терминале. Совместимо с bash 3.2 (стоит на macOS по умолчанию).

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLU=$'\033[34m'; N=$'\033[0m'
else
  B=''; DIM=''; RED=''; GRN=''; YEL=''; BLU=''; N=''
fi

say()  { printf '%s\n' "$*"; }
info() { printf '%s›%s %s\n' "$BLU" "$N" "$*"; }
ok()   { printf '%s✓%s %s\n' "$GRN" "$N" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL" "$N" "$*" >&2; }
fail() { printf '%s✗%s %s\n' "$RED" "$N" "$*" >&2; }
title() { printf '\n%s%s%s\n' "$B" "$*" "$N"; }

# Показать команду и выполнить её — видно, что именно делается.
run() {
  printf '%s$ %s%s\n' "$DIM" "$*" "$N"
  "$@"
}

# Вопрос с ответом по умолчанию. Результат — в stdout: x=$(ask "Вопрос" "по умолчанию")
ask() {
  local answer
  read -r -p "$1${2:+ [$2]}: " answer
  printf '%s' "${answer:-$2}"
}

# Да/нет. Сравниваем целыми словами — так надёжно в любой кодировке терминала.
confirm() {
  local answer def="${2:-n}" hint='[д/Н]'
  [ "$def" = "y" ] && hint='[Д/н]'
  read -r -p "$1 $hint: " answer
  [ -z "$answer" ] && answer="$def"
  case "$answer" in
    y|Y|yes|Yes|YES|д|Д|да|Да|ДА) return 0 ;;
    *) return 1 ;;
  esac
}

pause() {
  read -r -p "${1:-Enter — продолжить…}" _
}

# Меню из вариантов: choose "Заголовок" "вариант 1" "вариант 2" … → номер (с 1) в переменной CHOICE, 0 — отмена.
# Подпись пункта 0 — CHOICE_ZERO (по умолчанию «Назад»).
CHOICE=0
choose() {
  local head="$1" i=1 answer
  shift
  title "$head"
  for opt in "$@"; do
    printf '  %s%2d)%s %s\n' "$B" "$i" "$N" "$opt"
    i=$((i + 1))
  done
  printf '  %s 0)%s %s\n' "$B" "$N" "${CHOICE_ZERO:-Назад}"
  while :; do
    read -r -p "Номер: " answer
    case "$answer" in
      ''|*[!0-9]*) warn "Введите номер из списка" ;;
      *)
        if [ "$answer" -ge 0 ] && [ "$answer" -le $# ]; then
          CHOICE=$answer
          return 0
        fi
        warn "Нет такого номера"
        ;;
    esac
  done
}

# Повторить команду при сетевой ошибке: 2, 4, 8 секунд.
retry() {
  local n=1 delay=2
  while :; do
    "$@" && return 0
    [ $n -ge 4 ] && return 1
    warn "Не получилось — повтор через ${delay} с…"
    sleep "$delay"
    n=$((n + 1))
    delay=$((delay * 2))
  done
}

have() { command -v "$1" >/dev/null 2>&1; }

is_mac() { [ "$(uname)" = "Darwin" ]; }

# Открыть файл для правки: $EDITOR → VS Code → TextEdit (Mac) → nano.
edit_file() {
  local f="$1"
  if [ -n "${EDITOR:-}" ]; then
    $EDITOR "$f"
  elif have code; then
    code -w "$f"
  elif is_mac; then
    open -t "$f"
    pause "Отредактируйте файл, сохраните (⌘S), закройте окно и нажмите Enter… "
  else
    nano "$f"
  fi
}

# Открыть ссылку или файл в браузере.
open_url() {
  if is_mac; then open "$1"; elif have xdg-open; then xdg-open "$1" >/dev/null 2>&1; else say "$1"; fi
}
