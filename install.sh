#!/usr/bin/env bash
# unabridged installer for macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/saieeshb/unabridged/main/install.sh | bash
#
# Installs the `unabridged` command, then offers to add it to the coding agents it finds
# (Claude Code, Codex, Cursor, Gemini CLI, VS Code, …) — it shows what it will change and asks.
# Environment overrides:
#   UNABRIDGED_REF=v0.2.0          tag, branch or commit to install (default: latest release)
#   UNABRIDGED_HOME=~/.unabridged  where the files go
#   UNABRIDGED_BIN=~/.local/bin    where the command goes
#   UNABRIDGED_NO_SETUP=1          don't offer to set up agents
set -euo pipefail

REPO="saieeshb/unabridged"
HOME_DIR="${UNABRIDGED_HOME:-${CC_EXPORTER_HOME:-$HOME/.unabridged}}"
BIN_DIR="${UNABRIDGED_BIN:-${CC_EXPORTER_BIN:-$HOME/.local/bin}}"
NO_SETUP="${UNABRIDGED_NO_SETUP:-${CC_EXPORTER_NO_PLUGIN:-}}"

say() { printf '\033[1;35m›\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Node.js 18 or newer is required: https://nodejs.org (or: brew install node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18 or newer is required (found $(node -v))."
command -v curl >/dev/null 2>&1 || die "curl is required."
command -v tar >/dev/null 2>&1 || die "tar is required."

REF="${UNABRIDGED_REF:-${CC_EXPORTER_REF:-}}"
if [ -z "$REF" ]; then
  LATEST_URL="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" || true)"
  REF="${LATEST_URL##*/}"
  case "$REF" in ""|latest|releases) REF="main" ;; esac
fi

say "Installing unabridged ($REF) into $HOME_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/$REPO/archive/$REF.tar.gz" -o "$TMP/src.tar.gz" || die "Could not download $REF."
mkdir -p "$TMP/src"
tar -xzf "$TMP/src.tar.gz" -C "$TMP/src" --strip-components 1
[ -f "$TMP/src/bin/unabridged.mjs" ] || die "The download doesn't look like unabridged."

rm -rf "$HOME_DIR"
mkdir -p "$(dirname "$HOME_DIR")"
mv "$TMP/src" "$HOME_DIR"

mkdir -p "$BIN_DIR"
for name in unabridged cc-exporter; do
  cat > "$BIN_DIR/$name" <<EOF
#!/usr/bin/env bash
exec node "$HOME_DIR/bin/unabridged.mjs" "\$@"
EOF
  chmod +x "$BIN_DIR/$name"
done
say "Command installed: $BIN_DIR/unabridged"

if [ -z "$NO_SETUP" ]; then
  if [ -r /dev/tty ] && [ -w /dev/tty ] && (: < /dev/tty) 2>/dev/null; then
    say "Adding unabridged to your coding agents (you'll see the changes first)"
    "$BIN_DIR/unabridged" setup < /dev/tty || true
  else
    say "To add it to Claude Code, Codex, Cursor, Gemini CLI and other agents, run: unabridged setup"
  fi
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "Add $BIN_DIR to your PATH, e.g.:  echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.zshrc" ;;
esac
say "Done. Try:  unabridged --list"
