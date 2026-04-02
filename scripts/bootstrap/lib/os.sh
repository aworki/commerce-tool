validate_invocation() {
  [[ "${EUID:-$(id -u)}" -ne 0 ]] || die "Run setup.sh as a normal user."
}

resolve_login_shell() {
  local account_shell="$1"
  local env_shell="$2"
  local shell_path="${account_shell:-$env_shell}"
  basename "$shell_path"
}

detect_platform_name() {
  case "$1" in
    darwin*|macos) printf 'macos\n' ;;
    linux*) printf 'linux\n' ;;
    *) die "Unsupported platform: $1. Supported platforms: macOS and Ubuntu/Debian Linux." ;;
  esac
}

detect_os() {
  PLATFORM="$(detect_platform_name "${OSTYPE:-$(uname | tr '[:upper:]' '[:lower:]')}")"

  if [[ "$PLATFORM" == "linux" ]]; then
    [[ -f /etc/debian_version ]] || die "Only Ubuntu/Debian Linux is supported."
  fi
}

resolve_service_manager() {
  local has_systemctl="$1"
  local has_service="$2"
  [[ "$has_systemctl" == "1" ]] && { printf 'systemctl\n'; return 0; }
  [[ "$has_service" == "1" ]] && { printf 'service\n'; return 0; }
  die "No supported service manager found"
}
