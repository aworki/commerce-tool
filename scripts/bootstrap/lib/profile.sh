BOOTSTRAP_PROFILE_START='# >>> gstack-web2skill bootstrap >>>'
BOOTSTRAP_PROFILE_END='# <<< gstack-web2skill bootstrap <<<'
BOOTSTRAP_BASH_SOURCE_LINE='source "$HOME/.bashrc"'

render_profile_block() {
  local database_url="$1"
  local bun_exports="$2"
  cat <<EOF
$BOOTSTRAP_PROFILE_START
export DATABASE_URL="$database_url"
${bun_exports}$BOOTSTRAP_PROFILE_END
EOF
}

resolve_profile_target() {
  case "$1" in
    zsh) printf '%s\n' "$HOME/.zshrc" ;;
    bash) printf '%s\n' "$HOME/.bashrc" ;;
    *) die "Unsupported login shell: $1" ;;
  esac
}

ensure_shell_profile() {
  PROFILE_TARGET="$(resolve_profile_target "$LOGIN_SHELL_NAME")"
  export PROFILE_TARGET

  if [[ ! -f "$PROFILE_TARGET" ]]; then
    : > "$PROFILE_TARGET"
    PROFILE_CREATED_BY_BOOTSTRAP=1
    export PROFILE_CREATED_BY_BOOTSTRAP
  fi

  if [[ "$LOGIN_SHELL_NAME" == "bash" ]]; then
    ensure_bash_login_sourcing
  fi

  remove_managed_block "$PROFILE_TARGET"
  render_profile_block "$DATABASE_URL" "${BUN_PROFILE_EXPORTS:-}" >> "$PROFILE_TARGET"
}

ensure_bash_login_sourcing() {
  local bash_profile="$HOME/.bash_profile"
  local profile="$HOME/.profile"
  local target="$bash_profile"

  if [[ -f "$bash_profile" ]]; then
    target="$bash_profile"
  elif [[ -f "$profile" ]]; then
    target="$profile"
  fi

  touch "$target"

  if ! grep -Fq "$BOOTSTRAP_BASH_SOURCE_LINE" "$target"; then
    printf '%s\n' '# bootstrap-added' "$BOOTSTRAP_BASH_SOURCE_LINE" >> "$target"
    BOOTSTRAP_ADDED_BASH_SOURCE_TARGET="$target"
    export BOOTSTRAP_ADDED_BASH_SOURCE_TARGET
  fi
}

remove_bootstrap_bash_source() {
  local target="$1"
  python3 - <<'PY' "$target"
from pathlib import Path
import sys
path = Path(sys.argv[1])
if not path.exists():
    raise SystemExit(0)
lines = path.read_text().splitlines()
out = []
skip_next = False
for line in lines:
    if skip_next and line == 'source "$HOME/.bashrc"':
        skip_next = False
        continue
    skip_next = False
    if line == '# bootstrap-added':
        skip_next = True
        continue
    if line == 'source "$HOME/.bashrc"':
        continue
    out.append(line)
text = '\n'.join(out)
if out:
    text += '\n'
path.write_text(text)
PY
}

remove_managed_block() {
  local target="$1"
  [[ -n "$target" && -f "$target" ]] || return 0
  python3 - <<'PY' "$target" "$BOOTSTRAP_PROFILE_START" "$BOOTSTRAP_PROFILE_END"
from pathlib import Path
import sys
path = Path(sys.argv[1])
start = sys.argv[2]
end = sys.argv[3]
lines = path.read_text().splitlines()
out = []
in_block = False
for line in lines:
    if line == start:
        in_block = True
        continue
    if in_block and line == end:
        in_block = False
        continue
    if not in_block:
        out.append(line)
text = '\n'.join(out)
if out:
    text += '\n'
path.write_text(text)
PY
}

rollback_profile_changes() {
  [[ -n "${PROFILE_TARGET:-}" ]] && remove_managed_block "$PROFILE_TARGET"
  [[ "${PROFILE_CREATED_BY_BOOTSTRAP:-0}" == "1" ]] && [[ -n "${PROFILE_TARGET:-}" ]] && rm -f "$PROFILE_TARGET"
  [[ -n "${BOOTSTRAP_ADDED_BASH_SOURCE_TARGET:-}" ]] && remove_bootstrap_bash_source "$BOOTSTRAP_ADDED_BASH_SOURCE_TARGET"
  return 0
}
