#!/bin/sh
# usual installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/dpatel7-dev/usual/main/install.sh | sh
#
# What it does - no sudo, nothing outside your home folder:
#   1. downloads usual into ~/.usual/app
#   2. uses your Node.js if it is v18 or newer; otherwise downloads a private
#      copy into ~/.usual/node (your system is left alone)
#   3. creates the `usual` command in ~/.local/bin and, if that folder is not
#      on your PATH yet, adds one line to your shell's startup file
#
# Uninstall:  rm -rf ~/.usual ~/.local/bin/usual   (this deletes your saved data too)

set -eu

REPO="${USUAL_REPO:-dpatel7-dev/usual}"
BRANCH="${USUAL_BRANCH:-main}"
ROOT="${USUAL_INSTALL_DIR:-$HOME/.usual}"
BIN_DIR="${USUAL_BIN_DIR:-$HOME/.local/bin}"
ARCHIVE_URL="${USUAL_ARCHIVE_URL:-https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz}"
NODE_DIST="${USUAL_NODE_DIST:-https://nodejs.org/dist/latest-v24.x}"
INSTALL_URL="https://raw.githubusercontent.com/$REPO/$BRANCH/install.sh"

if [ -t 1 ]; then
  B=$(printf '\033[1m'); D=$(printf '\033[2m'); G=$(printf '\033[32m'); R=$(printf '\033[31m'); C=$(printf '\033[36m'); N=$(printf '\033[0m')
else
  B=''; D=''; G=''; R=''; C=''; N=''
fi

say() { printf '%s\n' "  $*"; }
step() { printf '%s\n' "  ${C}>${N} $*"; }
fail() { printf '\n%s\n\n' "  ${R}Install failed:${N} $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "this installer needs \`$1\`, which isn't installed."; }

node_ok() {
  "$1" -e 'process.exit(parseInt(process.versions.node, 10) >= 18 ? 0 : 1)' >/dev/null 2>&1
}

install_node() {
  case "$ARCH" in
    x86_64 | amd64) narch=x64 ;;
    arm64 | aarch64) narch=arm64 ;;
    armv7l) narch=armv7l ;;
    *) fail "there's no ready-made Node.js for this processor ($ARCH). Install Node.js 18+ yourself, then run this again." ;;
  esac
  if [ "$OS" = linux ] && (ldd --version 2>&1 || true) | grep -qi musl; then
    fail "this looks like Alpine Linux. Install Node first (apk add nodejs), then run this again."
  fi

  step "Node.js 18+ not found - downloading a private copy ${D}(stays inside $ROOT/node)${N}"
  sums=$(curl -fsSL "$NODE_DIST/SHASUMS256.txt") || fail "couldn't reach nodejs.org. Check your internet connection."
  line=$(printf '%s\n' "$sums" | grep -E "  node-v[0-9.]+-$OS-$narch\.tar\.gz\$" | head -n 1) || true
  [ -n "$line" ] || fail "nodejs.org has no download for $OS-$narch. Install Node.js 18+ yourself, then run this again."
  want=${line%% *}
  file=${line##* }

  curl -fL --progress-bar "$NODE_DIST/$file" -o "$TMP/node.tar.gz" || fail "the Node.js download didn't finish. Please try again."
  got=''
  if command -v sha256sum >/dev/null 2>&1; then
    got=$(sha256sum "$TMP/node.tar.gz" | cut -d ' ' -f 1)
  elif command -v shasum >/dev/null 2>&1; then
    got=$(shasum -a 256 "$TMP/node.tar.gz" | cut -d ' ' -f 1)
  fi
  if [ -n "$got" ] && [ "$got" != "$want" ]; then
    fail "the Node.js download was damaged (checksum mismatch). Please try again."
  fi

  mkdir -p "$TMP/node"
  tar -xzf "$TMP/node.tar.gz" -C "$TMP/node" --strip-components=1 || fail "couldn't unpack Node.js."
  node_ok "$TMP/node/bin/node" || fail "the downloaded Node.js doesn't run on this machine."
  mkdir -p "$ROOT"
  rm -rf "$ROOT/node"
  mv "$TMP/node" "$ROOT/node"
}

add_to_path() {
  PATH_NOTE=''
  case ":$PATH:" in *":$BIN_DIR:"*) return 0 ;; esac
  if [ "${USUAL_NO_MODIFY_PATH:-}" = 1 ]; then
    PATH_NOTE=manual
    return 0
  fi
  case "$(basename "${SHELL:-sh}")" in
    zsh) rc="${ZDOTDIR:-$HOME}/.zshrc"; line="export PATH=\"$BIN_DIR:\$PATH\"" ;;
    bash)
      if [ "$OS" = darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi
      line="export PATH=\"$BIN_DIR:\$PATH\""
      ;;
    fish) rc="$HOME/.config/fish/config.fish"; line="fish_add_path \"$BIN_DIR\"" ;;
    *) rc="$HOME/.profile"; line="export PATH=\"$BIN_DIR:\$PATH\"" ;;
  esac
  mkdir -p "$(dirname "$rc")"
  if ! grep -Fq "$line" "$rc" 2>/dev/null; then
    printf '\n# Added by the usual installer\n%s\n' "$line" >>"$rc"
  fi
  PATH_NOTE="$rc"
}

main() {
  OS=$(uname -s)
  ARCH=$(uname -m)
  case "$OS" in
    Darwin) OS=darwin ;;
    Linux) OS=linux ;;
    MINGW* | MSYS* | CYGWIN*)
      fail "on Windows, run this in PowerShell instead:

    irm https://raw.githubusercontent.com/$REPO/$BRANCH/install.ps1 | iex"
      ;;
    *) fail "sorry, $OS isn't supported yet." ;;
  esac
  need curl
  need tar

  printf '\n%s\n\n' "  ${B}Installing usual${N} ${D}from github.com/$REPO${N}"

  TMP=$(mktemp -d 2>/dev/null || mktemp -d -t usual)
  trap 'rm -rf "$TMP"' EXIT
  trap 'exit 130' INT TERM

  step "Downloading usual"
  curl -fsSL "$ARCHIVE_URL" -o "$TMP/app.tar.gz" ||
    fail "couldn't download $ARCHIVE_URL
  Is the repository public, and is your internet working?"
  mkdir -p "$TMP/app"
  tar -xzf "$TMP/app.tar.gz" -C "$TMP/app" --strip-components=1 || fail "couldn't unpack the download."
  [ -f "$TMP/app/bin/usual.js" ] || fail "the download doesn't look like usual."

  if [ -x "$ROOT/node/bin/node" ] && node_ok "$ROOT/node/bin/node"; then
    step "Using usual's private Node.js"
  elif command -v node >/dev/null 2>&1 && node_ok node; then
    step "Using your Node.js ${D}($(node -v))${N}"
  else
    install_node
  fi

  mkdir -p "$ROOT"
  rm -rf "$ROOT/app.old"
  if [ -d "$ROOT/app" ]; then mv "$ROOT/app" "$ROOT/app.old"; fi
  mv "$TMP/app" "$ROOT/app"
  rm -rf "$ROOT/app.old"

  # Installed from the website? Remember it, so nobody has to type an address.
  case "${USUAL_HUB:-}" in
    http://* | https://* | ws://* | wss://*) printf '%s\n' "$USUAL_HUB" >"$ROOT/hub" ;;
  esac

  # Prefer a folder this terminal already looks in, so `usual` works right away
  # without opening a new window.
  if [ -z "${USUAL_BIN_DIR:-}" ]; then
    for d in "$HOME/.local/bin" "$HOME/bin" /opt/homebrew/bin /usr/local/bin; do
      case ":$PATH:" in
        *":$d:"*) if [ -d "$d" ] && [ -w "$d" ]; then BIN_DIR="$d"; break; fi ;;
      esac
    done
  fi

  mkdir -p "$BIN_DIR"
  printf '%s\n' "$BIN_DIR/usual" >"$ROOT/launcher"
  cat >"$BIN_DIR/usual" <<EOF
#!/bin/sh
# usual launcher - written by install.sh. Safe to delete; re-run the installer to get it back.
ROOT="$ROOT"
if [ -x "\$ROOT/node/bin/node" ]; then
  exec "\$ROOT/node/bin/node" "\$ROOT/app/bin/usual.js" "\$@"
fi
if command -v node >/dev/null 2>&1; then
  exec node "\$ROOT/app/bin/usual.js" "\$@"
fi
echo "usual can't find Node.js any more. Re-run the installer to fix it:" >&2
echo "  curl -fsSL $INSTALL_URL | sh" >&2
exit 127
EOF
  chmod +x "$BIN_DIR/usual"

  version=$("$BIN_DIR/usual" --version 2>/dev/null) || fail "usual was installed but won't start. Try running: $BIN_DIR/usual --version"
  add_to_path

  printf '\n%s\n' "  ${G}Done.${N} ${B}$version${N} is installed."
  if [ -z "$PATH_NOTE" ]; then
    printf '\n%s\n\n' "  Order the usual:  ${B}usual${N}"
  elif [ "$PATH_NOTE" = manual ]; then
    printf '\n%s\n%s\n\n' "  Add $BIN_DIR to your PATH, then run:  ${B}usual${N}" "  (or run it directly: $BIN_DIR/usual)"
  else
    printf '\n%s\n' "  ${B}One more step.${N} This window doesn't know the new ${B}usual${N} command yet. Do ONE of these:"
    printf '\n%s\n%s\n' "    ${C}a)${N} Close this window, open a new terminal window, and type:  ${B}usual${N}" "    ${C}b)${N} Or paste this line here and press Enter:"
    printf '\n%s\n' "         ${B}export PATH=\"$BIN_DIR:\$PATH\" && usual${N}"
    printf '\n%s\n\n' "  ${D}(new windows will find it by themselves: $BIN_DIR was added to your PATH in $PATH_NOTE)${N}"
  fi
}

main "$@"
