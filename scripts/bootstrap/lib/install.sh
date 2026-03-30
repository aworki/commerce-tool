ensure_homebrew() {
  have brew && return 0
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(brew shellenv)"
  have brew || die "brew shellenv did not make Homebrew available"
}

compute_bun_profile_exports() {
  case "$1" in
    "$HOME"/.bun/*)
      printf 'export BUN_INSTALL="$HOME/.bun"\nexport PATH="$BUN_INSTALL/bin:$PATH"\n'
      ;;
  esac
}

compute_postgres_bin_exports() {
  [[ -n "$1" ]] || return 0
  printf 'export PATH="%s:$PATH"\n' "$1"
}

require_linux_sudo_if_needed() {
  local needs_privileged_step="$1"
  [[ "$needs_privileged_step" == "1" ]] || return 0
  sudo -n true >/dev/null 2>&1 || die "A privileged Linux step is required and non-interactive sudo is unavailable."
}

ensure_prerequisites() {
  BOOTSTRAP_DB_NAME="${BOOTSTRAP_DB_NAME:-gstack_web2skill}"
  BOOTSTRAP_DB_USER="${BOOTSTRAP_DB_USER:-$(resolve_bootstrap_username)}"
  LOGIN_SHELL_NAME="${LOGIN_SHELL_NAME:-$(resolve_login_shell "$(dscl . -read /Users/$(id -un) UserShell 2>/dev/null | awk '{print $2}' || true)" "${SHELL:-}")}"
  export BOOTSTRAP_DB_NAME BOOTSTRAP_DB_USER LOGIN_SHELL_NAME
}

install_bun() {
  local bun_bin
  bun_bin="$(command -v bun 2>/dev/null || true)"

  if [[ -z "$bun_bin" ]]; then
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
    bun_bin="$(command -v bun 2>/dev/null || true)"
  fi

  [[ -n "$bun_bin" ]] || die "bun installation failed"
  BUN_PROFILE_EXPORTS="$(compute_bun_profile_exports "$bun_bin")"
  export BUN_PROFILE_EXPORTS
}

install_postgres() {
  if [[ "$PLATFORM" == "macos" ]]; then
    local postgres_bin_dir
    ensure_homebrew
    brew list --versions postgresql@16 >/dev/null 2>&1 || brew install postgresql@16
    postgres_bin_dir="$(brew --prefix postgresql@16)/bin"
    eval "$(compute_postgres_bin_exports "$postgres_bin_dir")"
    have psql || die "postgresql@16 bin directory did not make psql available"
    return 0
  fi

  local candidate
  candidate="$(apt-cache policy postgresql-16 2>/dev/null | awk '/Candidate:/ { print $2; exit }')"
  assert_postgres16_available "$candidate"

  if ! have psql || ! have pg_lsclusters || ! have pg_createcluster || ! have pg_ctlcluster; then
    require_linux_sudo_if_needed 1
    sudo -n apt-get update
    sudo -n apt-get install -y postgresql-16 postgresql-client-16 postgresql-common
  fi
}

start_postgres() {
  if [[ "$PLATFORM" == "macos" ]]; then
    local service_line
    service_line="$(brew services list | awk '$1 ~ /^postgresql(@[0-9]+)?$/ { print $1":"$2 }')"
    SELECTED_FORMULA="$(select_macos_postgres_formula "${service_line:-postgresql@16:stopped}")"
    export SELECTED_FORMULA
    brew services start postgresql@16 >/dev/null
    SELECTED_PGHOST="/tmp"
    SELECTED_PGPORT=5432
    export SELECTED_PGHOST SELECTED_PGPORT
    return 0
  fi

  local clusters selected version name port status
  clusters="$(pg_lsclusters --no-header 2>/dev/null || true)"
  if [[ -z "$clusters" ]]; then
    require_linux_sudo_if_needed 1
    sudo -n pg_createcluster 16 main --start >/dev/null
    clusters="$(pg_lsclusters --no-header 2>/dev/null || true)"
  fi

  selected="$(select_linux_cluster "$clusters")"
  read -r version name port status _ <<< "$selected"
  SELECTED_CLUSTER_VERSION="$version"
  SELECTED_CLUSTER_NAME="$name"
  SELECTED_PGHOST="/var/run/postgresql"
  SELECTED_PGPORT="$port"
  export SELECTED_CLUSTER_VERSION SELECTED_CLUSTER_NAME SELECTED_PGHOST SELECTED_PGPORT

  if [[ "$status" != "online" ]]; then
    require_linux_sudo_if_needed 1
    sudo -n pg_ctlcluster "$version" "$name" start
  fi
}
