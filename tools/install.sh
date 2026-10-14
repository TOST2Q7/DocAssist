#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Установка: команда «da» в Терминале из любой папки. Запуск: ./tools/install.sh
DIR=$(cd -P "$(dirname "$0")" && pwd)
. "$DIR/lib/ui.sh"

chmod +x "$DIR/da" "$DIR/DocAssist.command" "$DIR/install.sh"
ok "Скрипты сделаны запускаемыми"

rc="$HOME/.zshrc"
case "${SHELL:-}" in */bash) rc="$HOME/.bash_profile" ;; esac
line="alias da='$DIR/da'"
if grep -qs "alias da=" "$rc"; then
  info "Команда da уже есть в $rc"
elif confirm "Добавить команду «da» в $rc (работает из любой папки)?" y; then
  printf '\n# DocAssist — помощник для работы с репозиторием\n%s\n' "$line" >> "$rc"
  ok "Готово. Откройте новое окно Терминала и наберите: da"
fi

if [ "$(uname)" = Darwin ]; then
  info "Ещё можно дважды щёлкнуть tools/DocAssist.command в Finder — откроется меню."
  command -v brew >/dev/null 2>&1 || warn "Для установки gh и node нужен Homebrew: https://brew.sh"
  command -v gh >/dev/null 2>&1 || info "Для релизов и Pull Request: brew install gh && gh auth login"
  command -v node >/dev/null 2>&1 || info "Для сборки и проверок: brew install node"
fi
