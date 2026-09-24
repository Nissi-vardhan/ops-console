#!/usr/bin/env bash
# Install the `ops` CLI by symlinking scripts/ops into a bin dir on PATH
# (default ~/.local/bin, override with OPS_BIN_DIR). Re-running is safe: it
# refreshes the link. The token stays in ~/.config/ops/token; this script never
# reads or prints it.
set -euo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ops"
bin_dir="${OPS_BIN_DIR:-$HOME/.local/bin}"
dest="$bin_dir/ops"

[ -f "$src" ] || { echo "install: $src not found" >&2; exit 1; }
command -v node >/dev/null || { echo "install: node is not on PATH (needs Node 18+)" >&2; exit 1; }

chmod +x "$src"
mkdir -p "$bin_dir"
if [ -e "$dest" ] && [ ! -L "$dest" ]; then
   echo "install: $dest exists and is not a symlink — refusing to overwrite" >&2
   exit 1
fi
ln -sfn "$src" "$dest"
echo "linked $dest -> $src"

case ":$PATH:" in
   *":$bin_dir:"*) ;;
   *) echo "note: $bin_dir is not on PATH" ;;
esac
[ -f "$HOME/.config/ops/token" ] || echo "note: no token at ~/.config/ops/token (or set OPS_TOKEN)"
