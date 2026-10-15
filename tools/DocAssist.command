#!/usr/bin/env bash
# Двойной щелчок в Finder — откроется Терминал с меню помощника DocAssist.
cd "$(dirname "$0")" || exit 1
./da
printf '\nОкно можно закрыть.\n'
