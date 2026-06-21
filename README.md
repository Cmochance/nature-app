# Nature App

> 把科研 skill 套件 [nature-skills](https://github.com/Yuan1z0825/nature-skills) 产品化为一个本地桌面应用 —— 科研人员无需碰命令行,即可用上检索 / 阅读 / 写作 / 润色 / 绘图 / 引用 / 数据 / 审稿 / 回复 / PPT / 专利 的整条流水线。
>
> A desktop app that turns the [nature-skills](https://github.com/Yuan1z0825/nature-skills) research-skill suite into a no-CLI GUI: a manifest-driven runner over a local Codex CLI, with isolated Python and rich artifact previews.

---

## 中文

### 这是什么
- **本地桌面 app**(Tauri 2 + React),包装用户本机的 **OpenAI Codex CLI** 来执行 nature-skills。
- **1 个 manifest 驱动的通用 runner** 点亮全部 11 个 skill:从每个 skill 的 `manifest.yaml` 自动生成表单(轴→控件、blocking gate→必填),无需为每个 skill 手写 UI。
- **uv 托管的隔离 Python(3.13)** 根治"系统 Python 太新 / 沙箱缺缓存"导致的崩溃。
- **产物预览路由**:文本→Markdown 渲染、图片→内联、引用→条目列表+导 Zotero、Office→系统软件打开;figure 支持"再改一版"与 chart-atlas 选图;polishing 原稿/润色对照;reviewer 三栏;reader 双语对照。

### 架构
```
React 前端(目录/动态表单/流式控制台/产物预览/设置体检)
        ▲ invoke / Channel<DomainEvent>
Tauri (Rust):
  skills.rs   解析 manifest+SKILL.md → SkillDescriptor;安装到 ~/.codex/skills/
  engine.rs   spawn `codex exec --json`,JSONL→DomainEvent 流式,产物快照兜底
  pyenv.rs    uv 隔离 venv 自举(pinned Python + skill 依赖)
  acsearch.rs academic-search MCP 注册(codex mcp add)
```
详见 `docs/`:`00-feasibility-and-direction.md`(方向)、`01-roadmap.md`(完整推进方案)、`01-codex-spikes-results.md`(Codex 实测结论)。

### 平台支持
**当前仅在 macOS 上开发并实测**(Apple Silicon)。代码含若干 macOS 假设(如探测 `/Applications/Codex.app`、PATH 以 `:` 分隔)。Windows 支持已在 CI 打包矩阵预留,但**尚未实测**;Linux 暂未适配。

### 前置依赖
- [uv](https://github.com/astral-sh/uv)(用于隔离 Python 环境)
- Node + pnpm、Rust 工具链(开发用)
- **codex 随 app 打包(Tauri sidecar)**,无需用户本机安装 Codex CLI;但**构建/开发前需先拉二进制**:`scripts/fetch-codex.sh`(否则 Tauri build.rs 因缺 `src-tauri/binaries/codex-<triple>` 而失败)

### 开发
```bash
scripts/fetch-codex.sh   # 拉 codex sidecar 二进制(按本机平台,首次必跑;二进制不入库)
pnpm install
pnpm tauri dev           # 启动桌面 app(dev)
```
codex 使用**隔离的 CODEX_HOME**(`~/.nature-app/codex-home`,可 `NATURE_APP_CODEX_HOME` 覆盖),与本地 `~/.codex` 的登录 / skills / MCP / 配置**互不交叉**。首次启动把 nature-skills 同步到该隔离目录、后台自举 uv 环境;codex 的登录在**设置页「登录」入口**单独完成(与本地 codex 登录互不影响)。

### 测试 / 构建
```bash
scripts/fetch-codex.sh         # codex sidecar(cargo / 打包前必须先拉到位)
cd src-tauri && cargo test     # Rust 单测(解析/事件契约)
pnpm build                     # 前端 tsc + vite
pnpm tauri build               # 打包(各平台需在该平台构建)
```

---

## English

### What
A **local desktop app** (Tauri 2 + React) that wraps the user's **OpenAI Codex CLI** to run nature-skills. **One manifest-driven runner** powers all 11 skills — forms are generated from each skill's `manifest.yaml` (axes → controls, blocking gate → required). An **uv-managed isolated Python (3.13)** avoids system-Python/sandbox crashes. Heterogeneous **artifact previews**: Markdown results, inline images, citation lists (→ Zotero), Office via system apps; figure "re-iterate" + chart-atlas; polishing side-by-side; reviewer 3-column; reader bilingual.

### Prerequisites
[uv](https://github.com/astral-sh/uv), Node + pnpm, Rust (for dev). codex ships **bundled as a Tauri sidecar** (no system install needed), but you must fetch the binary before building: `scripts/fetch-codex.sh` (otherwise Tauri's build.rs fails on the missing `src-tauri/binaries/codex-<triple>`).

### Develop
```bash
scripts/fetch-codex.sh   # fetch codex sidecar (per host platform; required once)
pnpm install && pnpm tauri dev
```
codex uses an **isolated CODEX_HOME** (`~/.nature-app/codex-home`), separate from your local `~/.codex` (login / skills / MCP / config never cross). Sign in from Settings → "Sign in" (independent of your local codex login).

---

## License & Attribution
- App code: MIT (see `LICENSE`).
- Bundled `skills-bundled/` is vendored from **Yuan1z0825/nature-skills** under **Apache-2.0** (pinned commit, unmodified). See `NOTICE` and `skills-bundled/LICENSE`.
