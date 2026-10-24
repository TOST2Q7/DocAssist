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

is_version() { printf '%s\n' "$1" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; }

# По возрастанию номера (sort -V есть не во всех версиях macOS).
sort_versions() { sort -t. -k1,1n -k2,2n -k3,3n; }

# Новее ли версия $1, чем $2.
version_gt() {
  [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort_versions | tail -1)" = "$1" ]
}

# Последний выпущенный релиз — старший тег vX.Y.Z на GitHub. Пусто, если релизов ещё не было.
last_release_version() {
  git ls-remote --tags --refs origin 'refs/tags/v*' 2>/dev/null |
    sed -n 's|.*refs/tags/v\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$|\1|p' | sort_versions | tail -1
}

# С какой версии считается релиз: последний релиз, а если его нет — прошлое описание в docs/releases.
prev_version() {
  local v="$1" last="$2" f p list=""
  if [ -n "$last" ] && version_gt "$v" "$last"; then
    printf '%s' "$last"
    return
  fi
  for f in docs/releases/v*.md; do
    [ -e "$f" ] || continue
    p=${f#docs/releases/v}
    p=${p%.md}
    is_version "$p" && version_gt "$v" "$p" && list="$list$p
"
  done
  printf '%s' "$list" | sort_versions | tail -1
}

# Заголовок релиза: «v0.6.0 - v0.7.0» (с прошлой версии на новую) или «v0.7.0», если прошлой нет.
release_title() {
  if [ -n "$1" ]; then printf 'v%s - v%s' "$1" "$2"; else printf 'v%s' "$2"; fi
}

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

## Изменения

- 

**Скачать:** DocAssist-$v.html — открыть двойным кликом в Chrome, Edge или Яндекс Браузере. Для сервера — DocAssist-web-$v.zip.
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

# Выбор номера: pick_version "Заголовок" база [keep] — варианты считаются от базы, keep — предложить оставить её.
# Номер — в PICKED_VERSION (пусто — отмена); код 1 — номер введён неверно.
pick_version() {
  local head="$1" base="$2" keep="${3:-}" major minor patch
  PICKED_VERSION=""
  IFS=. read -r major minor patch <<EOF2
$base
EOF2
  patch=${patch%%[!0-9]*}
  local p1="$major.$minor.$((patch + 1))" p2="$major.$((minor + 1)).0" p3="$((major + 1)).0.0"
  local vs=() labels=()
  if [ -n "$keep" ]; then vs+=("$base"); labels+=("$base — как в package.json"); fi
  vs+=("$p1" "$p2" "$p3")
  labels+=("$p1 — мелкие исправления" "$p2 — заметные изменения" "$p3 — большой выпуск")
  choose "$head" "${labels[@]}" "Своя"
  [ "$CHOICE" = 0 ] && return 0
  local v
  if [ "$CHOICE" -le ${#vs[@]} ]; then v="${vs[$((CHOICE - 1))]}"; else v=$(ask "Версия (например, 1.2.3)"); fi
  is_version "$v" || { fail "Версия — три числа через точку: 1.2.3"; return 1; }
  PICKED_VERSION="$v"
}

# Записать новую версию: package.json, черновик описания, коммит и отправка.
apply_version() {
  local v="$1" f
  set_version "$v" || return 1
  [ -f "$(notes_path "$v")" ] || write_notes_template "$v"
  confirm "Написать описание сейчас?" y && edit_file "$(notes_path "$v")"
  if confirm "Сохранить (коммит «Версия $v») и отправить на GitHub?" y; then
    for f in package.json package-lock.json "$(notes_path "$v")"; do [ -e "$f" ] && run git add "$f"; done
    run git commit -m "Версия $v" && cmd_push
  fi
}

cmd_version() {
  local cur
  cur=$(pkg_version)
  pick_version "Новая версия (сейчас $cur)" "$cur" || return 1
  [ -n "$PICKED_VERSION" ] || return 0
  apply_version "$PICKED_VERSION"
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
  local v tag notes target cur last rtitle
  fetch || return 1
  cur=$(current_branch)
  v=$(pkg_version)
  last=$(last_release_version)
  title "Выпуск релиза"
  if [ -n "$last" ]; then say "  Последний релиз: v$last"; else say "  Релизов ещё не было"; fi
  say "  В package.json:  $v"

  # Версия релиза: как в package.json, если она новее последнего релиза, или новая.
  local base="$v" keep=y
  if [ -n "$last" ] && ! version_gt "$v" "$last"; then base="$last"; keep=""; fi
  pick_version "Какая версия будет?" "$base" "$keep" || return 1
  [ -n "$PICKED_VERSION" ] || return 0
  if [ -n "$last" ] && ! version_gt "$PICKED_VERSION" "$last"; then
    warn "Версия $PICKED_VERSION не новее последнего релиза v$last — приложения не предложат обновиться."
    confirm "Всё равно выпустить $PICKED_VERSION?" || return 0
  fi
  if [ "$PICKED_VERSION" != "$v" ]; then
    v="$PICKED_VERSION"
    apply_version "$v" || return 1
  fi
  tag="v$v"
  notes=$(notes_path "$v")
  rtitle=$(release_title "$(prev_version "$v" "$last")" "$v")
  title "Выпуск релиза $rtitle"

  if tag_exists_remote "$tag"; then
    fail "Релиз (тег) $tag уже есть. Выберите другую версию."
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
  say "  Релиз:     $tag"
  say "  Заголовок: $rtitle"
  say "  Ветка:     $target"
  say "  Файлы:     соберёт GitHub (DocAssist-$v.html, DocAssist-web-$v.zip)"
  confirm "Выпустить?" || { info "Отменено"; return 0; }

  if have gh && gh auth status >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    run gh release create "$tag" --target "$target" --title "$rtitle" --notes-file "$notes" $pre || { fail "GitHub не создал релиз"; return 1; }
    ok "Релиз $tag создан. Файлы появятся через 3–5 минут — когда закончится сборка."
    local url
    url=$(gh release view "$tag" --json url -q .url 2>/dev/null)
    [ -n "$url" ] && say "  $url"
    confirm "Следить за сборкой здесь?" y && release_watch
  else
    warn "GitHub CLI недоступен — выпускаю через тег: сборка на GitHub сама создаст релиз с описанием из $notes."
    # Заголовок релиза сборка возьмёт из описания тега.
    run git tag -a "$tag" "origin/$target" -m "$rtitle" && retry git push origin "$tag" && ok "Тег $tag отправлен — релиз появится через 3–5 минут (вкладка Actions → «Релиз»)."
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
