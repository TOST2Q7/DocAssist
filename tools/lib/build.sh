# shellcheck shell=bash
# Сборка и проверка приложения: тесты, готовый файл DocAssist.html, запуск для разработки.

need_node() {
  if ! have npm; then
    fail "Нужен Node.js. Установите: brew install node"
    return 1
  fi
  if [ ! -d node_modules ]; then
    info "Первый запуск — устанавливаю зависимости (npm ci)…"
    run npm ci || { fail "Не удалось установить зависимости"; return 1; }
  fi
}

run_checks() {
  need_node || return 1
  run npm run typecheck && run npm test && ok "Проверки пройдены"
}

build_html() {
  need_node || return 1
  run npm run build:html && ok "Готово: DocAssist.html"
}

cmd_build() {
  choose "Сборка и проверка" "Собрать DocAssist.html и открыть" "Проверки (типы и тесты)" "Запустить для разработки (http://localhost:5173)"
  case $CHOICE in
    1) build_html && open_url "DocAssist.html" ;;
    2) run_checks ;;
    3)
      need_node || return 1
      info "Остановить — Ctrl+C"
      (sleep 3 && open_url "http://localhost:5173") &
      run npm run dev
      ;;
  esac
}

cmd_doctor() {
  title "Проверка окружения"
  if have git; then ok "git: $(git --version | sed 's/git version //')"; else fail "git не найден — установите: xcode-select --install"; fi
  local name email
  name=$(git config user.name); email=$(git config user.email)
  if [ -n "$name" ] && [ -n "$email" ]; then ok "Автор коммитов: $name <$email>"; else
    warn "Не указан автор коммитов."
    if confirm "Указать сейчас?" y; then
      git config --global user.name "$(ask "Имя")"
      git config --global user.email "$(ask "Почта (как на GitHub)")"
    fi
  fi
  ok "Репозиторий: $(git remote get-url origin 2>/dev/null || echo 'нет origin')"
  if have gh; then
    if gh auth status >/dev/null 2>&1; then ok "GitHub CLI: вход выполнен"; else warn "GitHub CLI установлен, но не вошёл: gh auth login"; fi
  else
    warn "GitHub CLI (gh) не установлен — без него не будет релизов и Pull Request. Установка: brew install gh"
  fi
  if have node; then ok "Node.js: $(node --version)"; else warn "Node.js не установлен — нужен для сборки и проверок: brew install node"; fi
  if is_mac && ! have brew; then warn "Нет Homebrew — установщик программ: https://brew.sh"; fi
}
