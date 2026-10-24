# shellcheck shell=bash
# Ветки, обновление (pull), коммиты, отправка (push), слияния, Pull Request.

current_branch() { git symbolic-ref --short -q HEAD; }

has_upstream() { git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; }

# Сколько коммитов впереди и позади origin: «впереди позади».
ahead_behind() {
  local b="${1:-$(current_branch)}"
  git rev-parse --verify -q "origin/$b" >/dev/null || { printf '0 0'; return; }
  git rev-list --left-right --count "$b...origin/$b" 2>/dev/null | awk '{print $1, $2}'
}

dirty_count() { git status --porcelain | wc -l | tr -d ' '; }

fetch() {
  printf '%s$ git fetch --prune origin%s\n' "$DIM" "$N"
  retry git fetch --prune --quiet origin || { fail "Нет связи с GitHub (git fetch). Проверьте интернет."; return 1; }
}

# Короткая строка для заголовка меню.
branch_line() {
  local b ab ahead behind d
  b=$(current_branch)
  [ -z "$b" ] && { printf 'ветка: — (не на ветке)'; return; }
  ab=$(ahead_behind "$b"); ahead=${ab% *}; behind=${ab#* }
  d=$(dirty_count)
  printf 'ветка: %s%s%s' "$B" "$b" "$N"
  [ "$ahead" != 0 ] && printf ' · не отправлено: %s' "$ahead"
  [ "$behind" != 0 ] && printf ' · на GitHub новее: %s' "$behind"
  [ "$d" != 0 ] && printf ' · несохранённых изменений: %s' "$d"
  [ "$ahead" = 0 ] && [ "$behind" = 0 ] && [ "$d" = 0 ] && printf ' · всё сохранено и отправлено'
}

cmd_status() {
  fetch
  title "Состояние"
  say "$(branch_line)"
  local d
  d=$(dirty_count)
  if [ "$d" != 0 ]; then
    title "Изменённые файлы"
    git status --short
  fi
  title "Последние коммиты"
  git --no-pager log --oneline --decorate -8
}

# Есть ли конфликты слияния — и помощь с ними.
handle_conflicts() {
  local files
  files=$(git diff --name-only --diff-filter=U)
  [ -z "$files" ] && return 0
  warn "Конфликт: одни и те же места изменены и здесь, и на GitHub. Файлы:"
  printf '%s\n' "$files" | sed 's/^/     /'
  if [ "$files" = "DocAssist.html" ]; then
    if confirm "Конфликт только в DocAssist.html (готовая сборка) — пересобрать его и завершить слияние?" y; then
      build_html && run git add DocAssist.html && run git commit --no-edit && ok "Слияние завершено" && return 0
      return 1
    fi
  fi
  case "$files" in *DocAssist.html*) info "DocAssist.html руками не правят: после остальных файлов пересоберите его (меню «Собрать DocAssist.html»)." ;; esac
  choose "Что делать с конфликтом?" "Открыть файлы и поправить (найти метки <<<<<<< ======= >>>>>>>)" "Отменить слияние — вернуть как было" "Ничего, разберусь сам"
  case $CHOICE in
    1)
      for f in $files; do [ "$f" != DocAssist.html ] && edit_file "$f"; done
      if ! git diff --name-only --diff-filter=U | grep -qv '^DocAssist.html$' || confirm "Все конфликты поправлены?"; then
        printf '%s\n' "$files" | grep -q '^DocAssist.html$' && build_html && git add DocAssist.html
        run git add -A && run git commit --no-edit && ok "Слияние завершено"
      fi
      ;;
    2) run git merge --abort && ok "Слияние отменено — всё как было" ;;
    *) info "Когда поправите: «Сохранить изменения» (коммит). Отменить: git merge --abort" ;;
  esac
}

# Влить ветку origin/<имя> в текущую (слиянием, история не переписывается).
merge_from() {
  local from="$1"
  if ! run git merge --no-edit -m "Слияние: ${from#origin/}" "$from"; then
    handle_conflicts
    return 1
  fi
  return 0
}

# Несохранённые изменения мешают обновиться — спрятать (stash) на время.
STASHED=0
stash_if_dirty() {
  STASHED=0
  [ "$(dirty_count)" = 0 ] && return 0
  warn "Есть несохранённые изменения."
  choose "Как быть?" "Спрятать их на время, обновиться и вернуть (git stash)" "Сначала сохранить их коммитом"
  case $CHOICE in
    1) run git stash push -u -m "da: перед обновлением" && STASHED=1 ;;
    2) cmd_commit ;;
    *) return 1 ;;
  esac
}

unstash() {
  [ "$STASHED" = 1 ] || return 0
  if run git stash pop; then ok "Несохранённые изменения возвращены"; else warn "Изменения не вернулись сами (конфликт). Они лежат в git stash: git stash list"; fi
  STASHED=0
}

cmd_pull() {
  local b ab ahead behind
  b=$(current_branch)
  [ -z "$b" ] && { fail "Вы не на ветке — выберите ветку в меню «Ветки»"; return 1; }
  fetch || return 1
  if ! git rev-parse --verify -q "origin/$b" >/dev/null; then
    info "Ветки «$b» ещё нет на GitHub — обновлять нечего. Отправить её: «Отправить на GitHub»."
    return 0
  fi
  ab=$(ahead_behind "$b"); ahead=${ab% *}; behind=${ab#* }
  if [ "$behind" = 0 ]; then ok "Ветка «$b» уже свежая"; return 0; fi
  stash_if_dirty || return 1
  if [ "$ahead" = 0 ]; then
    run git merge --ff-only "origin/$b" && ok "Обновлено: новых коммитов $behind"
  else
    info "И у вас, и на GitHub есть новые коммиты (у вас $ahead, на GitHub $behind) — сливаю их вместе."
    merge_from "origin/$b" && ok "Слито с GitHub"
  fi
  unstash
}

cmd_commit() {
  local msg="${1:-}" d
  d=$(dirty_count)
  if [ "$d" = 0 ]; then ok "Нечего сохранять — изменений нет"; return 0; fi
  title "Изменения"
  git status --short
  if [ -z "$msg" ]; then
    choose "Что сохранить?" "Всё" "Выбрать файлы"
    case $CHOICE in
      1) run git add -A ;;
      2)
        local files=() f i=1 pick
        while IFS= read -r f; do files+=("$f"); done < <(git status --porcelain | sed 's/^...//; s/.* -> //')
        for f in "${files[@]}"; do printf '  %2d) %s\n' "$i" "$f"; i=$((i + 1)); done
        pick=$(ask "Номера через пробел")
        for i in $pick; do
          case "$i" in ''|*[!0-9]*) continue ;; esac
          [ "$i" -ge 1 ] && [ "$i" -le ${#files[@]} ] && run git add -A -- "${files[$((i - 1))]}"
        done
        ;;
      *) return 1 ;;
    esac
    if git diff --cached --quiet; then warn "Ничего не выбрано"; return 1; fi
    msg=$(ask "Коротко: что изменено")
    [ -z "$msg" ] && { warn "Нужно описание"; git reset -q; return 1; }
  else
    run git add -A
  fi
  run git commit -m "$msg" && ok "Сохранено"
  if confirm "Отправить на GitHub сейчас?" y; then cmd_push; fi
}

cmd_push() {
  local b out
  b=$(current_branch)
  [ -z "$b" ] && { fail "Вы не на ветке"; return 1; }
  if [ "$(dirty_count)" != 0 ]; then
    warn "Есть несохранённые изменения — на GitHub уйдёт только то, что сохранено коммитом."
    confirm "Сначала сохранить их?" y && { cmd_commit; return $?; }
  fi
  local n=1 delay=2
  while :; do
    printf '%s$ git push -u origin %s%s\n' "$DIM" "$b" "$N"
    if out=$(git push -u origin "$b" 2>&1); then
      printf '%s\n' "$out" | grep -v '^[[:space:]]*$' | sed 's/^/  /' | tail -3
      ok "Отправлено на GitHub: «$b»"
      return 0
    fi
    printf '%s\n' "$out" | sed 's/^/  /' | tail -6
    case "$out" in
      *rejected*|*non-fast-forward*|*"fetch first"*)
        warn "На GitHub есть коммиты, которых у вас нет (например, из другой сессии)."
        if confirm "Обновиться (слить их со своими) и отправить снова?" y; then
          cmd_pull || return 1
          continue
        fi
        return 1
        ;;
    esac
    [ $n -ge 4 ] && { fail "Не удалось отправить. Проверьте интернет и доступ к репозиторию (меню «Проверить окружение»)."; return 1; }
    warn "Не получилось — повтор через ${delay} с…"
    sleep "$delay"; n=$((n + 1)); delay=$((delay * 2))
  done
}

cmd_sync() {
  cmd_pull && cmd_push
}

cmd_branch() {
  fetch || return 1
  choose "Ветки (сейчас: $(current_branch))" "Переключиться на другую ветку" "Создать новую ветку" "Удалить ветку на компьютере"
  case $CHOICE in
    1)
      local list=() b
      while IFS= read -r b; do list+=("$b"); done < <( { git for-each-ref --format='%(refname:short)' refs/heads; git for-each-ref --format='%(refname:short)' refs/remotes/origin | sed 's#^origin/##' | grep -v '^HEAD$'; } | sort -u)
      choose "На какую ветку?" "${list[@]}"
      [ "$CHOICE" = 0 ] && return 0
      b="${list[$((CHOICE - 1))]}"
      stash_if_dirty || return 1
      if git rev-parse --verify -q "refs/heads/$b" >/dev/null; then
        run git checkout "$b"
      else
        run git checkout -b "$b" --track "origin/$b"
      fi
      ok "Теперь вы на ветке «$b»"
      [ "$STASHED" = 1 ] && confirm "Вернуть спрятанные изменения на эту ветку?" y && unstash
      cmd_pull
      ;;
    2)
      local name base
      name=$(ask "Название новой ветки (латиницей, без пробелов)")
      case "$name" in ''|*' '*) fail "Название без пробелов"; return 1 ;; esac
      choose "От чего отвести?" "От текущей ветки ($(current_branch))" "От main на GitHub" "От testing на GitHub"
      case $CHOICE in
        1) base=HEAD ;;
        2) base=origin/main ;;
        3) base=origin/testing ;;
        *) return 0 ;;
      esac
      run git checkout -b "$name" "$base" && ok "Создана ветка «$name»"
      confirm "Сразу отправить её на GitHub?" y && cmd_push
      ;;
    3)
      local list=() b cur
      cur=$(current_branch)
      while IFS= read -r b; do [ "$b" != "$cur" ] && list+=("$b"); done < <(git for-each-ref --format='%(refname:short)' refs/heads)
      [ ${#list[@]} = 0 ] && { info "Других веток на компьютере нет"; return 0; }
      choose "Какую удалить (только на компьютере, на GitHub она останется)?" "${list[@]}"
      [ "$CHOICE" = 0 ] && return 0
      b="${list[$((CHOICE - 1))]}"
      if ! git branch -d "$b" 2>/dev/null; then
        warn "В ветке «$b» есть коммиты, которых нет ни в одной другой."
        confirm "Удалить всё равно? Эти коммиты пропадут с компьютера" && run git branch -D "$b"
      else
        ok "Ветка «$b» удалена с компьютера"
      fi
      ;;
  esac
}

cmd_merge() {
  local b list=() x
  b=$(current_branch)
  fetch || return 1
  while IFS= read -r x; do [ "$x" != "$b" ] && [ "$x" != HEAD ] && list+=("$x"); done < <(git for-each-ref --format='%(refname:short)' refs/remotes/origin | sed 's#^origin/##')
  [ ${#list[@]} = 0 ] && { info "На GitHub нет других веток"; return 0; }
  choose "Какую ветку влить в «$b»? (берётся версия с GitHub)" "${list[@]}"
  [ "$CHOICE" = 0 ] && return 0
  x="${list[$((CHOICE - 1))]}"
  stash_if_dirty || return 1
  merge_from "origin/$x" && ok "«$x» влита в «$b»" && confirm "Отправить «$b» на GitHub?" y && cmd_push
  unstash
}

need_gh() {
  if ! have gh; then
    fail "Нужна программа GitHub CLI (gh). Установите: brew install gh — и войдите: gh auth login"
    return 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    fail "GitHub CLI не вошёл в аккаунт. Выполните: gh auth login"
    return 1
  fi
}

cmd_pr() {
  need_gh || return 1
  local b
  b=$(current_branch)
  choose "Pull Request" "Создать: «$b» → main" "Создать: «$b» → другая ветка" "Список открытых" "Открыть Pull Request этой ветки в браузере"
  case $CHOICE in
    1|2)
      local base=main
      [ "$CHOICE" = 2 ] && base=$(ask "В какую ветку" "main")
      [ "$(ahead_behind "$b" | cut -d' ' -f1)" != 0 ] && { info "Сначала отправлю ветку на GitHub"; cmd_push || return 1; }
      local t
      t=$(ask "Заголовок" "$b → $base")
      run gh pr create --base "$base" --head "$b" --title "$t" --body "Слияние «$b» в «$base»." && ok "Pull Request создан"
      confirm "Открыть его в браузере?" y && gh pr view "$b" --web
      ;;
    3) run gh pr list ;;
    4) run gh pr view "$b" --web ;;
  esac
}

cmd_log() {
  git --no-pager log --oneline --graph --decorate -25
}
