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

### 前置依赖
- [Codex CLI](https://github.com/openai/codex)(已 `codex login`)
- [uv](https://github.com/astral-sh/uv)(用于隔离 Python 环境)
- Node + pnpm、Rust 工具链(开发用)

### 开发
```bash
pnpm install
pnpm tauri dev      # 启动桌面 app(dev)
```
首次启动会把 nature-skills 同步到 `~/.codex/skills/`,并后台自举 uv 隔离环境。

### 测试 / 构建
```bash
cd src-tauri && cargo test     # Rust 单测(解析/事件契约)
pnpm build                     # 前端 tsc + vite
pnpm tauri build               # 打包(各平台需在该平台构建)
```

---

## English

### What
A **local desktop app** (Tauri 2 + React) that wraps the user's **OpenAI Codex CLI** to run nature-skills. **One manifest-driven runner** powers all 11 skills — forms are generated from each skill's `manifest.yaml` (axes → controls, blocking gate → required). An **uv-managed isolated Python (3.13)** avoids system-Python/sandbox crashes. Heterogeneous **artifact previews**: Markdown results, inline images, citation lists (→ Zotero), Office via system apps; figure "re-iterate" + chart-atlas; polishing side-by-side; reviewer 3-column; reader bilingual.

### Prerequisites
[Codex CLI](https://github.com/openai/codex) (logged in), [uv](https://github.com/astral-sh/uv), Node + pnpm, Rust (for dev).

### Develop
```bash
pnpm install && pnpm tauri dev
```

---

## License & Attribution
- App code: MIT (see `LICENSE`).
- Bundled `skills-bundled/` is vendored from **Yuan1z0825/nature-skills** under **Apache-2.0** (pinned commit, unmodified). See `NOTICE` and `skills-bundled/LICENSE`.
