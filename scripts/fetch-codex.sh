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

# 项目根目录(用于读取 .codex-version)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# codex 版本:单一来源 = 根目录 .codex-version;env 变量可覆盖
CODEX_VERSION="${CODEX_VERSION:-$(cat "$ROOT/.codex-version" 2>/dev/null | tr -d '[:space:]')}"
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

# 解压后二进制名为 codex / codex.exe;严格判定标准名,缺失则明确报错(T5)
BIN="$TMP/codex"; [ -f "$TMP/codex.exe" ] && BIN="$TMP/codex.exe"
if [ ! -f "$BIN" ]; then
  echo "解压后未找到标准命名的 codex 二进制(预期 codex 或 codex.exe)" >&2
  echo "解压内容:" >&2
  find "$TMP" -maxdepth 2 -type f -print -quit >&2 || true
  exit 1
fi

cp "$BIN" "$OUT"
chmod 0755 "$OUT" 2>/dev/null || true   # Windows Git Bash 上 chmod 可能 no-op
echo "[fetch-codex] -> $OUT"
"$OUT" --version 2>/dev/null || true
