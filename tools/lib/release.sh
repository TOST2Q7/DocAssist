# shellcheck shell=bash
# Релизы: версия в package.json, описание из docs/releases/vX.Y.Z.md, выпуск на GitHub.
# Файлы релиза (DocAssist-X.Y.Z.html и веб-архив) собирает GitHub Actions — .github/workflows/release.yml.

pkg_version() {
  local file="${1:-package.json}"
  sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$file" | head -1
}

# Версия в package.json ветки на GitHub.
remote_version() {
  git show "origin/$1:package.json" 2>/dev/null | sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
}

notes_path() { printf 'docs/releases/v%s.md' "$1"; }

# owner/repo из адреса origin — чтобы gh работал с нужным репозиторием.
detect_repo() {
  local url
  url=$(git remote get-url origin 2>/dev/null) || return 0
  url=${url%.git}
  url=${url%/}
  local repo=${url##*/}
  local rest=${url%/*}
  local owner=${rest##*[/:]}
  case "$url" in
    *github.com*) [ -n "$owner" ] && [ -n "$repo" ] && export GH_REPO="$owner/$repo" ;;
  esac
}

tag_exists_remote() {
  [ -n "$(git ls-remote --tags origin "refs/tags/$1" 2>/dev/null)" ]
}

write_notes_template() {
  local v="$1" f
  f=$(notes_path "$v")
  mkdir -p docs/releases
  cat > "$f" <<NOTES
**Коротко, что нового — одной строкой.**

## Что нового

- 

## Данные

Таблицы, правки, база и настройки сохраняются.

## Файлы

| Файл | Для чего |
|---|---|
| **DocAssist-$v.html** | Для компьютера: скачать и открыть двойным кликом в Chrome, Edge или Яндекс Браузере. |
| **DocAssist-web-$v.zip** | Веб-версия для размещения на сервере (офлайн, установка как приложение). |
| SHA256SUMS.txt | Контрольные суммы. |
NOTES
  ok "Создан черновик описания: $f"
}

show_notes() {
  local f="$1"
  title "Описание релиза ($f)"
  sed 's/^/  │ /' "$f" | head -40
  [ "$(wc -l < "$f" | tr -d ' ')" -gt 40 ] && say "  │ …"
}

set_version() {
  local v="$1"
  if have npm; then
    run npm version "$v" --no-git-tag-version --allow-same-version >/dev/null || return 1
  else
    local tmp
    tmp=$(mktemp)
    sed "s/^\([[:space:]]*\"version\":[[:space:]]*\"\)[^\"]*\"/\1$v\"/" package.json > "$tmp" && cat "$tmp" > package.json
    rm -f "$tmp"
    warn "npm не найден — версия изменена только в package.json (package-lock.json обновится при следующей установке)"
  fi
  ok "Версия: $v"
}

cmd_version() {
  local cur major minor patch v
  cur=$(pkg_version)
  IFS=. read -r major minor patch <<EOF2
$cur
EOF2
  patch=${patch%%[!0-9]*}
  choose "Новая версия (сейчас $cur)" \
    "$major.$minor.$((patch + 1)) — мелкие исправления" \
    "$major.$((minor + 1)).0 — заметные изменения" \
    "$((major + 1)).0.0 — большой выпуск" \
    "Своя"
  case $CHOICE in
    1) v="$major.$minor.$((patch + 1))" ;;
    2) v="$major.$((minor + 1)).0" ;;
    3) v="$((major + 1)).0.0" ;;
    4) v=$(ask "Версия (например, 1.2.3)") ;;
    *) return 0 ;;
  esac
  case "$v" in [0-9]*.[0-9]*.[0-9]*) ;; *) fail "Версия — три числа через точку: 1.2.3"; return 1 ;; esac
  set_version "$v" || return 1
  [ -f "$(notes_path "$v")" ] || write_notes_template "$v"
  confirm "Написать описание сейчас?" y && edit_file "$(notes_path "$v")"
  if confirm "Сохранить (коммит «Версия $v») и отправить на GitHub?" y; then
    local f
    for f in package.json package-lock.json "$(notes_path "$v")"; do [ -e "$f" ] && run git add "$f"; done
    run git commit -m "Версия $v" && cmd_push
  fi
}

cmd_notes() {
  local v f
  v=$(pkg_version)
  f=$(notes_path "$v")
  [ -f "$f" ] || { write_notes_template "$v"; }
  edit_file "$f"
  show_notes "$f"
  if [ -n "$(git status --porcelain -- "$f")" ] && confirm "Сохранить описание (коммит) и отправить?" y; then
    run git add "$f" && run git commit -m "Описание версии $v" && cmd_push
  fi
}

cmd_release() {
  detect_repo
  choose "Релизы (версия в package.json: $(pkg_version))" \
    "Выпустить релиз" \
    "Новая версия (поднять номер)" \
    "Написать или поправить описание (docs/releases)" \
    "Обновить описание уже выпущенного релиза" \
    "Посмотреть сборку релиза на GitHub" \
    "Список релизов" \
    "Удалить релиз (если выпустили по ошибке)"
  case $CHOICE in
    1) release_create ;;
    2) cmd_version ;;
    3) cmd_notes ;;
    4) release_edit_notes ;;
    5) release_watch ;;
    6) need_gh && run gh release list --limit 15 ;;
    7) release_delete ;;
  esac
}

release_create() {
  local v tag notes target cur
  fetch || return 1
  cur=$(current_branch)
  v=$(pkg_version)
  tag="v$v"
  notes=$(notes_path "$v")
  title "Выпуск релиза $tag"

  if tag_exists_remote "$tag"; then
    fail "Релиз (тег) $tag уже есть. Поднимите версию: «Новая версия»."
    return 1
  fi
  if [ ! -f "$notes" ]; then
    warn "Нет описания $notes."
    confirm "Создать и написать сейчас?" y || return 1
    write_notes_template "$v"
    edit_file "$notes"
  fi
  if grep -q 'Коротко, что нового — одной строкой' "$notes"; then
    warn "В описании остался текст из черновика."
    confirm "Поправить описание?" y && edit_file "$notes"
  fi

  local branches=("$cur") b
  for b in main testing; do [ "$b" != "$cur" ] && git rev-parse --verify -q "origin/$b" >/dev/null && branches+=("$b"); done
  local labels=("$cur (текущая)")
  for b in "${branches[@]:1}"; do labels+=("$b"); done
  choose "Из какой ветки собрать релиз?" "${labels[@]}"
  [ "$CHOICE" = 0 ] && return 0
  target="${branches[$((CHOICE - 1))]}"

  # Всё нужное должно быть на GitHub: релиз собирается из ветки там, а не с компьютера.
  if [ "$target" = "$cur" ]; then
    if [ "$(dirty_count)" != 0 ] || [ "$(ahead_behind "$cur" | cut -d' ' -f1)" != 0 ] || ! git rev-parse --verify -q "origin/$cur" >/dev/null; then
      warn "Не всё сохранено и отправлено на GitHub — в релиз попадёт только то, что уже там."
      if confirm "Сохранить и отправить сейчас?" y; then
        [ "$(dirty_count)" != 0 ] && { cmd_commit "Подготовка релиза $tag" || return 1; }
        cmd_push || return 1
      fi
    fi
  fi
  git fetch --quiet origin "$target" 2>/dev/null
  local rv
  rv=$(remote_version "$target")
  if [ "$rv" != "$v" ]; then
    fail "В ветке «$target» на GitHub версия ${rv:-неизвестна}, а релиз — $v. Сборка проверяет, что они совпадают."
    info "Переключитесь на «$target», поднимите версию или отправьте изменения — и повторите."
    return 1
  fi
  if ! git cat-file -e "origin/$target:$notes" 2>/dev/null; then
    warn "Описания $notes нет в ветке «$target» на GitHub — для релиза оно возьмётся с компьютера."
  fi

  if have npm && [ -d node_modules ] && confirm "Прогнать проверки перед выпуском (типы и тесты, ~1 мин)?" y; then
    run_checks || { confirm "Проверки не прошли. Всё равно выпустить?" || return 1; }
  fi

  show_notes "$notes"
  local pre=""
  confirm "Пометить как предварительный выпуск (pre-release)?" && pre="--prerelease"
  title "Итог"
  say "  Релиз:   $tag — «DocAssist $tag»"
  say "  Ветка:   $target"
  say "  Файлы:   соберёт GitHub (DocAssist-$v.html, DocAssist-web-$v.zip)"
  confirm "Выпустить?" || { info "Отменено"; return 0; }

  if have gh && gh auth status >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    run gh release create "$tag" --target "$target" --title "DocAssist $tag" --notes-file "$notes" $pre || { fail "GitHub не создал релиз"; return 1; }
    ok "Релиз $tag создан. Файлы появятся через 3–5 минут — когда закончится сборка."
    local url
    url=$(gh release view "$tag" --json url -q .url 2>/dev/null)
    [ -n "$url" ] && say "  $url"
    confirm "Следить за сборкой здесь?" y && release_watch
  else
    warn "GitHub CLI недоступен — выпускаю через тег: сборка на GitHub сама создаст релиз с описанием из $notes."
    run git tag -a "$tag" "origin/$target" -m "DocAssist $tag" && retry git push origin "$tag" && ok "Тег $tag отправлен — релиз появится через 3–5 минут (вкладка Actions → «Релиз»)."
  fi
}

release_watch() {
  need_gh || return 1
  local id
  info "Ищу сборку релиза…"
  sleep 3
  id=$(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null)
  [ -z "$id" ] && { warn "Сборка не найдена — посмотрите вкладку Actions на GitHub"; return 1; }
  if run gh run watch "$id" --exit-status; then
    ok "Сборка закончилась — файлы прикреплены к релизу"
  else
    fail "Сборка с ошибкой. Подробности: gh run view $id --log-failed"
  fi
}

pick_release() {
  local list=() t
  while IFS= read -r t; do [ -n "$t" ] && list+=("$t"); done < <(gh release list --limit 15 --json tagName -q '.[].tagName' 2>/dev/null)
  [ ${#list[@]} = 0 ] && { info "Релизов нет"; return 1; }
  choose "Какой релиз?" "${list[@]}"
  [ "$CHOICE" = 0 ] && return 1
  PICKED="${list[$((CHOICE - 1))]}"
}

release_edit_notes() {
  need_gh || return 1
  PICKED=""
  pick_release || return 0
  local f="docs/releases/$PICKED.md"
  [ -f "$f" ] || { fail "Нет файла $f"; return 1; }
  confirm "Поправить $f перед обновлением?" && edit_file "$f"
  run gh release edit "$PICKED" --notes-file "$f" && ok "Описание релиза $PICKED обновлено"
}

release_delete() {
  need_gh || return 1
  PICKED=""
  pick_release || return 0
  warn "Релиз $PICKED и его тег будут удалены с GitHub. Скачанные файлы у людей останутся."
  confirm "Удалить $PICKED?" || return 0
  run gh release delete "$PICKED" --yes --cleanup-tag && git tag -d "$PICKED" >/dev/null 2>&1
  ok "Релиз $PICKED удалён"
}
