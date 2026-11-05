#!/usr/bin/env bash
# cc-exporter installer for macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/saieeshb/cc-exporter/main/install.sh | bash
#
# Installs the `cc-exporter` command, and the Claude Code plugin when `claude` is on PATH.
# Environment overrides:
#   CC_EXPORTER_REF=v0.1.0     tag, branch or commit to install (default: latest release)
#   CC_EXPORTER_HOME=~/.cc-exporter    where the files go
#   CC_EXPORTER_BIN=~/.local/bin       where the command goes
#   CC_EXPORTER_NO_PLUGIN=1            skip the Claude Code plugin step
set -euo pipefail

REPO="saieeshb/cc-exporter"
HOME_DIR="${CC_EXPORTER_HOME:-$HOME/.cc-exporter}"
BIN_DIR="${CC_EXPORTER_BIN:-$HOME/.local/bin}"

say() { printf '\033[1;35m›\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Node.js 18 or newer is required: https://nodejs.org (or: brew install node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js 18 or newer is required (found $(node -v))."
command -v curl >/dev/null 2>&1 || die "curl is required."
command -v tar >/dev/null 2>&1 || die "tar is required."

REF="${CC_EXPORTER_REF:-}"
if [ -z "$REF" ]; then
  LATEST_URL="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" || true)"
  REF="${LATEST_URL##*/}"
  case "$REF" in ""|latest|releases) REF="main" ;; esac
fi

say "Installing cc-exporter ($REF) into $HOME_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "https://github.com/$REPO/archive/$REF.tar.gz" -o "$TMP/src.tar.gz" || die "Could not download $REF."
mkdir -p "$TMP/src"
tar -xzf "$TMP/src.tar.gz" -C "$TMP/src" --strip-components 1
[ -f "$TMP/src/bin/cc-exporter.mjs" ] || die "The download doesn't look like cc-exporter."

rm -rf "$HOME_DIR"
mkdir -p "$(dirname "$HOME_DIR")"
mv "$TMP/src" "$HOME_DIR"

mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/cc-exporter" <<EOF
#!/usr/bin/env bash
exec node "$HOME_DIR/bin/cc-exporter.mjs" "\$@"
EOF
chmod +x "$BIN_DIR/cc-exporter"
say "Command installed: $BIN_DIR/cc-exporter"

if [ -z "${CC_EXPORTER_NO_PLUGIN:-}" ] && command -v claude >/dev/null 2>&1; then
  say "Adding the Claude Code plugin (slash command, skill, MCP connector)"
  claude plugin marketplace add "$REPO" >/dev/null 2>&1 || claude plugin marketplace update cc-exporter >/dev/null 2>&1 || true
  if claude plugin install cc-exporter@cc-exporter >/dev/null 2>&1; then
    say "Plugin installed. In Claude Code, run /reload-plugins or start a new session, then /export-chat"
  else
    say "Couldn't install the plugin automatically. In Claude Code run: /plugin install cc-exporter@cc-exporter"
  fi
fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "Add $BIN_DIR to your PATH, e.g.:  echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.zshrc" ;;
esac
say "Done. Try:  cc-exporter --list"
