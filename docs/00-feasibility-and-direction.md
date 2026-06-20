# nature-app · 可行性评估与整体方向

> 状态:方向已确认（Direction Locked）
> 日期:2026-06-20
> 适用范围:本文是 nature-app 项目的**整体方向基准**。后续所有详细推进方案（plan）必须与本文一致;若需偏离，需显式更新本文并记录原因。

---

## 0. 项目缘起

基于 GitHub 上的科研工作流 skill 套件 **[Yuan1z0825/nature-skills](https://github.com/Yuan1z0825/nature-skills)**（21.4k★）做一套**完整的桌面应用**，把这套原本面向命令行 / Codex agent 的科研 skill，包装成一个面向科研人员、无需碰命令行的图形化工具。

### 已确认的三个决定性选择

| 决策项 | 选择 | 含义 |
|---|---|---|
| **产品形态** | 本地桌面 app | Tauri/Electron 包装用户**本机**的 Codex CLI + 本机 Python/R 环境，复用用户自己的 API key |
| **执行引擎** | 包装 Codex CLI | 直接复用 nature-skills 的原生运行环境（它本就为 Codex 设计），前端负责拼 prompt、传文件、收产物 |
| **首发范围** | 全套 11 个 skill | 完整复刻整条科研流水线 |

这三个选择共同构成**可行性最高、最快出活**的路径：本地化 + 复用本机环境，意味着 Web SaaS 的三大成本中心——**代码执行沙箱、多租户隔离、LLM key 托管与计费**——全部不存在。

---

## 1. 关键判断（定调）

> nature-skills 本质是一套 **"上下文工程"产物**——一堆 Markdown 规则 + Python/R 脚本 + 图片资产。它**自己没有后端、没有 API、没有运行时**，必须靠一个 **agent runtime（Codex / Claude Code）** 去"解释执行"。

因此"基于它做一个前端 app"这句话低估了约 80% 的工作量：真正要补齐的不是 UI，而是它缺失的那整层 **执行引擎 + 沙箱 + 产物管理 + 用户态**。前端只是冰山尖。

在"本地桌面 + 包装 Codex"的选择下，这层工作被简化为：

> **一个带 GUI 壳的 Codex 编排器。**

---

## 2. 可行性速判

| 维度 | 结论 |
|---|---|
| 技术可行性 | ✅ 完全可行，且是好方向 |
| 真正的难点 | ❌ 不在前端 UI，在 **Codex 桥接（解析其输出，脆）** + **异构产物预览** + **本机环境体检** |
| 成本中心 | LLM 算力（用户自带）+ 本机算力，不是前端工时 |
| 结构红利 | nature-skills 的 `manifest.yaml` 是**声明式半结构化**的，几乎可以直接驱动一个动态向导 UI（见 §3） |

结论：可行，且原框架的结构对前端化异常友好;工程重心从"画 UI"挪到"建桥接 + 管产物 + 管环境"。

---

## 3. 关键策略反转：让"全套 11 个"变得可行

直觉上"全套 11 skill 起步"是最重的 MVP。但有个架构杠杆能让它反而不重：

> **不要为 11 个 skill 各写一套 UI。写 1 个 `manifest.yaml` 驱动的通用 runner，11 个 skill 自动获得 baseline 可用界面。**

成立依据——nature-skills 每个 skill 的 manifest 字段天然能映射成 UI：

| manifest 字段 | 映射成的 UI 元件 |
|---|---|
| `axes.<x>.values: {a, b}` | 一组单选（下拉 / radio） |
| `axes.<x>.detect: "BLOCKING GATE"` | **必填项**，未填禁止"运行" |
| `nature-polishing` 的 `journal/language/paper_type/section` 轴 | 四个下拉表单 |
| `always_load` | 启动即注入的系统上下文 |
| `references.on_demand[].condition` | 运行时的**进度阶段 / 步骤时间线** |
| SKILL.md frontmatter `description` | 卡片标题 + 触发说明 |

做一个"读 manifest → 渲染动态表单 → 拼 prompt → 喂给 Codex → 收产物"的通用管线，**11 个 skill 当天就都能跑（baseline）**;之后再针对绘图、润色等高价值场景叠加定制产物视图。这是把"全套"做成 MVP 的钥匙——**先做引擎，不做 11 套页面**。

---

## 4. 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│  ⑥ 桌面外壳   Tauri(推荐) / Electron                          │
│     窗口、菜单、本地文件对话框、系统集成                          │
├─────────────────────────────────────────────────────────────┤
│  ⑤ 前端 UI 层  React/Svelte + 组件库                          │
│   · Skill 目录(读 manifest 生成卡片)                          │
│   · ★ Manifest 驱动的动态向导表单(轴→表单, gate→必填)         │
│   · 流式控制台(渲染 Codex 的思考/工具调用/文件写入)            │
│   · 产物预览区(图 PNG/PDF/SVG、docx/pptx、bib)                │
│   · 工作区/项目管理、环境体检面板                                │
├─────────────────────────────────────────────────────────────┤
│  ④ 编排/会话层  (Rust/Node 后端进程)                          │
│   · 把表单值 + 用户文件 → 拼成 Codex prompt                     │
│   · 管理一次"任务"的生命周期、迭代("再改一版")                  │
├─────────────────────────────────────────────────────────────┤
│  ③ Codex 桥接层  spawn `codex exec`                           │
│   · 子进程管理、cwd=项目目录、流式解析 stdout、审批/sandbox 模式  │
│   · MCP server 生命周期(academic-search 专用)                 │
├─────────────────────────────────────────────────────────────┤
│  ② Skill 管理层                                               │
│   · 安装/更新:同步 nature-skills repo → ~/.codex/skills/      │
│     (复用仓库自带 update-codex-skills.sh, 保留 _shared)       │
│   · 解析 manifest.yaml + SKILL.md frontmatter 建目录          │
├─────────────────────────────────────────────────────────────┤
│  ① 环境/依赖层  (复用用户本机)                                 │
│   · Codex CLI(已登录)、Python+matplotlib/seaborn、           │
│     R+ggplot2(可选)、LaTeX/pandoc/libreoffice、API keys      │
└─────────────────────────────────────────────────────────────┘
```

③④⑤是真正要写的代码;①②是"管理 + 复用"已有的东西。

---

## 5. 各层关键实现点 & 难点

### ③ Codex 桥接层（整个项目最脆弱、最该先打通）
- 核心：spawn `codex exec "<prompt>"`，`cwd` 设为用户研究项目目录，Codex 自动从 `~/.codex/skills/` 按 description 触发对应 skill。
- 要真跑 matplotlib/R 出图，得给 Codex **写文件 + 执行命令的权限**（full-auto / workspace 信任模式）。安全 UX 重点：做成"每个项目首次授权一次"。
- **难点：解析 stdout 很脆**。Codex 输出格式随版本变。缓解：优先用 Codex 的结构化 / JSON 输出模式，pin 版本，桥接层做成可替换的 thin adapter（将来换 Claude Agent SDK 只动这一层）。

### ⑤ Manifest 驱动 UI（产品差异化所在）
- 写一个 manifest → JSON Schema → 表单的渲染器。
- **坑：11 个 skill 的 manifest 并不统一**——绘图有清晰的 `backend` 轴，但有些 prose skill（reader/response）manifest 很薄甚至没有 axes。渲染器必须有 **graceful fallback**：无结构化轴时退化成"通用聊天 + 文件输入"界面。

### 产物层（异构是最大复杂度）

| 产物类型 | 涉及 skill | 预览方案 |
|---|---|---|
| 图像 PNG/PDF/SVG | figure | webview 渲染，plot_*.py 与图并排，支持"再改一版"回灌 |
| Markdown/LaTeX 文本 | polishing/writing/reader | Markdown 渲染 + diff 视图 |
| 文献 bib/ris/enw | citation/academic-search | 列表视图 + 一键导 Zotero |
| docx | paper-to-patent | 缩略图 / 调 libreoffice 转 PDF 预览，或仅下载 |
| pptx | paper2ppt | 同上，MVP 可先只给下载 |
| 多份报告 | reviewer(3 位审稿人) | tab 分栏 |

### ② Skill 管理
- 复用仓库 `scripts/update-codex-skills.sh` 思路把 `skills/_shared` + `skills/nature-*` 同步进 `~/.codex/skills/`。
- 持续跟上游（repo 仍在频繁更新）——**做薄包装**，别 fork 后魔改 skill 内容，否则同步成本爆炸。

---

## 6. 一定会踩的坑（按严重度）

1. **环境地狱（头号支持成本）**：用户机器 Python/R/LaTeX/pandoc 版本千奇百怪。绘图依赖 matplotlib/seaborn，部分产物要 LaTeX/libreoffice。建议内置"环境体检"面板（可借鉴仓库 `nature-academic-search/scripts/preflight.py`），并用 `uv` 托管隔离 Python 环境，别用系统 Python。
2. **academic-search 是全套里最复杂的异类**：它不是纯 prompt，而是自带一个 **MCP server**（`academic_search_server.py`）需常驻运行 + 注册进 Codex `config.toml` + 配 Scopus/Elsevier 等 **API key**。需单独做 MCP 进程生命周期管理 + 凭证设置面板。建议靠后做。
3. **多数 skill 还是 Draft/Beta**：仓库自标状态，只有 `nature-figure`/`nature-polishing` 到 Stable。全套上线 UI 要**显式标注成熟度徽章**，管理用户预期。
4. **Codex 是外部不可控依赖**：接口 / 输出格式变了就被动。桥接层抽象 + 版本 pin + 留好换引擎的口子。
5. **"真跑代码"的安全叙事**：桌面 app 自动执行 LLM 生成的 Python，要给用户清晰的授权边界（限定项目目录、可审阅再执行的模式开关）。

---

## 7. 分阶段路线图（目标是全套，内部仍分期）

| 阶段 | 目标 | 关键交付 |
|---|---|---|
| **M0 打通管线** | 证明可行性 | Tauri 壳 + spawn `codex exec` + 流式渲染 + 跑通**一个** skill（nature-figure）端到端出一张图 |
| **M1 通用 runner** | **全 11 skill baseline** | manifest→动态表单渲染器 + skill 目录 + 工作区/文件管理 + 环境体检。11 个 skill 都能以"表单 + 聊天 + 产物下载"形态跑起来 |
| **M2 绘图深度** | 打透最高价值场景 | figure 产物视图：代码 / 图并排、版本迭代、Python/R 切换、chart-atlas 选图 |
| **M3 高价值定制 + 异类** | 体验拉满 | polishing 的 diff 视图、reader 双语对照、reviewer 三栏;接入 academic-search 的 MCP + 凭证管理 |
| **M4 打磨** | 产品化 | 成熟度徽章、skill 上游自动同步、docx/pptx 预览、错误恢复 |

M0+M1 即一个可用内测版，且因走通用 runner，M1 一次性点亮全部 11 个。

---

## 8. 技术选型建议（待 plan 阶段最终确认）

- **外壳:Tauri**（优于 Electron）：更轻、二进制小、Rust 侧 spawn 子进程 / 管文件天然顺手、安全模型更适合"执行外部命令"。团队若纯 JS 栈且要快，Electron 亦可。
- **前端:** React + 一个表单 schema 渲染库（react-jsonschema-form 思路）做 manifest 驱动表单;图像 / PDF 直接 webview。
- **桥接:** Tauri 的 Rust 后端 `Command` spawn codex，用 event/stream 推到前端;或 Node sidecar。
- **YAML 解析:** 在桥接层统一解析成内部 JSON 模型。

---

## 9. 总评

可行性高，是个清晰的好产品。真正的工程量集中在 **③Codex 桥接（脆）** 和 **异构产物预览**，以及 **①环境体检** 这个隐形支持成本;UI 因有 manifest 驱动反而相对省力。本组选择基本是"最小阻力路径"。

> 本文为方向基准。下一步：进入 plan 模式，对 Codex CLI 实际接口、Tauri 能力、11 个 skill 的真实 manifest/输入输出做深度调研，产出**完整且不依赖推测**的逐项推进方案。
