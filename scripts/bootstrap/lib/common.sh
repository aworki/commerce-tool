have() {
  command -v "$1" >/dev/null 2>&1
}

die() {
  printf '%s\n' "$*" >&2
  return 1
}
