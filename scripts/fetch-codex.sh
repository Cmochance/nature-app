#!/usr/bin/env bash
# 拉取 codex CLI 二进制作为 Tauri sidecar(externalBin)。
#
# 把指定 target triple 的 codex 二进制从 openai/codex release 下载、解压,
# 放到 Tauri 约定的 sidecar 路径:src-tauri/binaries/codex-<triple>(Windows 加 .exe)。
# 二进制不入库(见 .gitignore);本地开发 / CI 打包前各跑一次。
#
# 用法:
#   scripts/fetch-codex.sh                 # 自动按宿主机 rustc host triple
#   scripts/fetch-codex.sh aarch64-apple-darwin
#   CODEX_VERSION=rust-v0.141.0 scripts/fetch-codex.sh x86_64-unknown-linux-musl
set -euo pipefail

CODEX_VERSION="${CODEX_VERSION:-rust-v0.141.0}"
REPO="openai/codex"

# 目标 triple:参数优先,否则取宿主机 rustc host
TRIPLE="${1:-}"
if [ -z "$TRIPLE" ]; then
  TRIPLE="$(rustc -vV 2>/dev/null | sed -n 's/^host: //p')"
fi
if [ -z "$TRIPLE" ]; then
  echo "无法确定 target triple(装 rustc 或显式传参,如 aarch64-apple-darwin)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/src-tauri/binaries"
mkdir -p "$OUT_DIR"

# Windows 资产/产物带 .exe
case "$TRIPLE" in
  *windows*) ASSET="codex-${TRIPLE}.exe.tar.gz"; OUT="$OUT_DIR/codex-${TRIPLE}.exe" ;;
  *)         ASSET="codex-${TRIPLE}.tar.gz";     OUT="$OUT_DIR/codex-${TRIPLE}" ;;
esac

# 幂等:已存在则跳过(配合 CI 缓存);FORCE=1 强制重拉
if [ -f "$OUT" ] && [ -z "${FORCE:-}" ]; then
  echo "[fetch-codex] 已存在 $OUT,跳过(FORCE=1 强制重拉)"
  exit 0
fi

URL="https://github.com/${REPO}/releases/download/${CODEX_VERSION}/${ASSET}"
echo "[fetch-codex] ${CODEX_VERSION} ${TRIPLE}"
echo "[fetch-codex] $URL"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fSL "$URL" -o "$TMP/codex.tar.gz"
tar -xzf "$TMP/codex.tar.gz" -C "$TMP"

# 解压后二进制名为 codex / codex.exe
BIN="$TMP/codex"; [ -f "$TMP/codex.exe" ] && BIN="$TMP/codex.exe"
if [ ! -f "$BIN" ]; then
  # 兜底:取解出的首个可执行文件
  BIN="$(find "$TMP" -maxdepth 2 -type f -name 'codex*' ! -name '*.tar.gz' | head -1)"
fi
[ -n "$BIN" ] && [ -f "$BIN" ] || { echo "解压后未找到 codex 二进制" >&2; exit 1; }

cp "$BIN" "$OUT"
chmod 0755 "$OUT" 2>/dev/null || true   # Windows Git Bash 上 chmod 可能 no-op
echo "[fetch-codex] -> $OUT"
"$OUT" --version 2>/dev/null || true
