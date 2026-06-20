# nature-app 完整推进方案(逐项)

> 状态:已批准(Approved 2026-06-20)· **M0 已完成并实测出图(2026-06-20)**
> 配套文档:`00-feasibility-and-direction.md`(整体方向);`01-codex-spikes-results.md`(Codex 实测结论 + M0 集成发现,**已生成**——含对本方案的修正)
> M0 成果:Tauri2+React 工程跑通 `选目录→codex exec→流式控制台→chart.png 出图显示`;8 个 Rust 单测 + 前端 build 全绿。已暴露并修复"沙箱内 matplotlib abort(环境地狱)"与"产物需快照兜底"两问题。
> 本方案所有技术细节均经对 nature-skills 仓库 / Codex CLI 官方文档 / Tauri 2.x 官方文档的实地调研;未确认事实一律列入 M0 验证 spike,绝不凭推测。

## Context

把 GitHub 上的科研工作流 skill 套件 **Yuan1z0825/nature-skills**(Apache-2.0,21.4k★,11 个 skill)产品化为一个**本地桌面 app**,让科研人员无需碰命令行即可用上整条科研流水线(检索/阅读/写作/润色/绘图/引用/数据/审稿/回复/PPT/专利)。

nature-skills 本质是"上下文工程"产物(Markdown 规则 + Python/R 脚本 + 资产),自己没有运行时,必须靠 agent runtime 解释执行。本项目即补齐它缺的那一层:**GUI 壳 + Codex 编排 + 本机环境 + 产物管理**。

### 已锁定的 15 项决策(硬约束,后续不得无故偏离)

| 维度 | 定案 | 维度 | 定案 |
|---|---|---|---|
| 产品形态 | 本地桌面 app | 会话模型 | thread-resume(M0 验证,回落无状态) |
| 执行引擎 | 包装 Codex CLI | Office 预览 | 仅打开/下载(不做 in-app 预览) |
| 首发范围 | 全套 11 skill | skills 分发 | 打包 pinned 版 + 可选检查更新 |
| 目标 OS | macOS + Windows(CI matrix) | 前端框架 | React |
| Python 环境 | uv sidecar 托管隔离 venv | 开源策略 | 开源(Apache-2.0/MIT) |
| R 后端 | 首版只 Python,R 留后期 | 遥测 | 完全本地零遥测 |
| 外壳 | Tauri 2.x(非 Electron) | 团队 | 2-3 人 |
| Codex 沙箱 | 默认 workspace-write+never;高级全放开开关 | | |

### 关键策略(让"全套 11"可行)
**先做 1 个 manifest 驱动的通用 runner,11 个 skill 自动 baseline 可用**(M1),再针对高价值场景叠加 4 个精修视图(figure 产物 / polishing diff / reader 双语 / reviewer 三栏)。绝不为 11 个 skill 各写一套 UI。

---

## 一、架构总览与工程结构

```
┌─ Tauri 外壳 (Rust) ────────────────────────────────────────────┐
│  skills/parser.rs   serde_yaml 解析 manifest+frontmatter→Descriptor│
│  engine/codex.rs    Codex sidecar spawn / JSONL 解析 / 流式映射   │
│  session/mod.rs     thread_id 存取 / resume 双路 / 无状态回落     │
│  env/uv.rs          uv sidecar:隔离 venv 自举 + 装包             │
│  commands.rs        #[tauri::command] IPC + Channel<DomainEvent> │
│  capabilities/*.json  shell/fs/asset scope 白名单                │
└────────────────────────────────────────────────────────────────┘
        ▲ invoke / Channel              ▲ convertFileSrc / asset://
┌─ React 前端 ─┴────────────────────────┴────────────────────────┐
│  SkillRegistry(zustand) · DynamicForm(manifest→控件,三档)      │
│  RunConsole(流式) · ArtifactPreviewRouter · ProjectWorkspace    │
│  精修视图: FigureRefine / PolishingDiff / ReaderBilingual / Reviewer3Col │
└─────────────────────────────────────────────────────────────────┘
```

**工程结构(独立新仓 `nature-app/`)**:
```
nature-app/
├─ docs/                      # 00-feasibility(已存) + 本方案 + M0 spike 结论
├─ src/                       # React 前端
│  ├─ types/skill.ts          # SkillDescriptor 等 TS 单一来源
│  ├─ components/DynamicForm.tsx, ArtifactPreviewRouter.tsx
│  ├─ features/figure/FigureRefineView.tsx …
│  └─ stores/                 # zustand
├─ src-tauri/
│  ├─ src/{skills,engine,session,env,commands}.rs
│  ├─ capabilities/default.json
│  ├─ binaries/               # externalBin: codex-*, uv-*(带 target triple)
│  └─ skills-bundled/         # pinned 的 nature-skills 副本 + LICENSE/NOTICE
└─ .github/workflows/ci.yml   # mac+win matrix(参考 mochat/desktop.yml)
```

**可复用的本仓 prior art(参考,非修改对象)**:
- `mochat/.github/workflows/desktop.yml` — 跨平台 (os,arch,platform) CI matrix 与签名约定
- `mochat/desktop/electron/sidecar.ts` — 进程生命周期 / 优雅关闭(SIGTERM→5s→SIGKILL)/ dev-packaged 路径解析
- `mochat/frontend/src/stores/learnStore.ts` — zustand 写法;`pages/Learn/components/ReaderView.tsx`、`pages/Chat/components/MessageItem.tsx` — react-markdown 流式渲染模式(remark-math + rehype-katex + react-syntax-highlighter)

---

## 二、技术选型定案(均经调研)

| 项 | 选型 | 依据 |
|---|---|---|
| 外壳 | Tauri **2.11.x** | 体积小、子进程流式成熟、capabilities 安全模型适合"执行外部命令" |
| spawn | **Rust 侧** `app.shell().command()` → `(Receiver<CommandEvent>, CommandChild)` | 流式 JSONL 集中解析一次、取消可靠 kill、并发任务统一登记。前端只收已映射的 `DomainEvent` |
| 推流通道 | `tauri::ipc::Channel<DomainEvent>`(每 task 一个) | 官方推荐流式通道,无序列化开销;`app.emit` 仅用于全局通知 |
| Codex 调用 | `codex exec --json`(JSONL 流) | 官方机器可读接口,事件类型文档化 |
| Python | **uv sidecar**(`bundle.externalBin`,target-triple 命名)首跑自建隔离 venv | 解决"环境地狱",版本可控 |
| skills | 打包 pinned 副本 + serde_yaml 解析 | Apache-2.0 允许;离线、版本锁定、不受上游 break 冲击 |
| manifest 解析 | **Rust `serde_yaml`** → `serde_json` 给前端 | 类型单一来源,前端不碰 YAML/不暴露读盘权限 |
| 图片预览 | `convertFileSrc` + asset 协议 | 官方,快 |
| PDF 预览 | **pdf.js**(worker/字体本地打包,禁外网 CDN) | webview 不保证原生 PDF;离线可用 |
| 前端栈 | React + Vite;zustand / react-markdown+remark-math+rehype-katex / react-syntax-highlighter | 复用 mochat 既验证栈 |

---

## 三、核心子系统设计

### 3.1 Codex 桥接 + 编排层(`engine/codex.rs`,最脆,M0 先打通)

**命令骨架**(CommandBuilder 把 TaskSpec→argv):
> ⚠️ 以下骨架已按 `docs/01-codex-spikes-results.md` 的实测结论修正(codex 0.142.0-alpha.6):exec **无 `--ask-for-approval`**;stdin **必须关闭**;`file_change` 为单数。

```
codex exec "<rendered_instruction>"        # 指令走位置参数;长上下文走 stdin(child.write 后【立即关闭 stdin】)
  --json                                    # 必须:JSONL
  -C <workdir>                              # 工作目录=产物根
  --sandbox workspace-write                 # 默认档;高级开关→ danger-full-access(必须显式传,不依赖用户全局 config)
  --skip-git-repo-check                     # 统一加(非 git 必须,git 加上无害)
  --output-last-message <task_dir>/last_message.txt   # 最终文本旁路冗余
  [-m <model>] [--output-schema …] [-c sandbox_workspace_write.network_access=true]  # 联网开关已实测有效
  [--add-dir <DIR>] [--ephemeral] [--ignore-user-config]   # 实测可用的辅助 flag
  [resume <thread_id>]                      # 子命令实测存在(SPIKE-E);默认不加
```
- ⭐ **stdin 必须关闭**(SPIKE-H 实测):无上下文 → 重定向 `/dev/null`;有上下文 → `child.write(payload)` 后**立即关 stdin**,否则进程挂起等 EOF。
- **无 `--ask-for-approval`**(SPIKE-F):exec 非交互不走交互审批,沙箱完全由 `--sandbox` 决定;且**每次显式传 `--sandbox`**,因用户全局 config 可能是 `danger-full-access`。
- **指令 vs 上下文切分**:位置参数=命令式指令;stdin=注入的 SKILL.md 全文 + 文件路径清单 + 历史产物(会作为 `<stdin>` 块追加)。
- **skill 注入(三路均实测可用)**:主路=显式注入 pinned `<skill>/SKILL.md` 全文 + axes(最确定);优化路=`$skill-name` mention(省 token,SPIKE-D ✅);兜底=隐式 description 匹配(SPIKE-C ✅)。skills 目录实测为 `~/.codex/skills/`(`~/.agents/skills` 不存在)。
- **网络**:skill 标 `needs_network` 或用户勾选时加 `-c sandbox_workspace_write.network_access=true`(命令级,不污染全局 config)。
- **沙箱档映射**:默认 `workspace-write + never`;高级 `danger-full-access + never`(UI 二次确认 + 持久警示)。

**JSONL 事件→领域事件映射**(逐行 `serde_json` 解析,顶层读 `type`,item 读 `item.type`;**全程容错**:未知 type/缺字段降级为 `Raw` 透传,终态只认退出码 + `turn.failed`/`error`):

| Codex 顶层 `type` | → `DomainEvent` | 用途 |
|---|---|---|
| `thread.started{thread_id}` | `ThreadStarted` | 存 thread_id |
| `turn.started` / `turn.completed{usage}` | `TurnStarted`/`TurnCompleted` | 进度、token 统计 |
| `turn.failed` / `error` | `TurnFailed`/`EngineError` | 失败判定 |
| `item.*` → `agent_message{.text}` | `AssistantMessage{is_final}` | 控制台主回复 |
| → `reasoning` / `command_execution{command,status}` | `Reasoning`/`CommandRun` | 控制台 |
| → `file_change`(单数,payload `changes:[{path,kind}]`,SPIKE-B 实测) | `FileChanged` → `Artifact` | 产物发现 |
| → `mcp_tool_call` / `web_search` / `plan` | 同名 DomainEvent | 控制台/进度条 |

产物发现 = 事件驱动(`file_changes`)+ 任务前后 workdir 浅快照 diff 兜底。

**关键 Rust 类型**:`TaskSpec`(skill_id/axes/file_paths/workdir/sandbox_tier/model/config_overrides/needs_network/session_id)、`CommandSpec`(program/argv/envs/workdir/stdin_payload)、`CodexEvent`(`#[serde(tag="type")]` + `#[serde(other)] Unknown`)、`Item`(同上 + `alias`)、`DomainEvent`、`TaskState` 状态机、`TaskHandle`(child/state/channel/stderr_ring),全局 `DashMap<TaskId, Arc<TaskHandle>>`。

**IPC 契约**:`prepare_task`(dry-run 返回 argv 预览+校验)、`run_skill_task(spec, on_event: Channel<DomainEvent>)→TaskId`、`cancel_task`、`list_tasks`、`get_task_stderr`、`check_engine→EngineStatus`、`continue_session`。

**会话/resume 双路**:`Session{session_id, codex_thread_id?, codex_version, turns[]}` 落库(sqlite/json)。收 `ThreadStarted` 写 thread_id。`continue_session` 决策:有 thread_id 且 SPIKE-E 确认 resume 可用 → 走 resume argv(只发新指令);否则**无缝回落无状态重组**(SKILL.md 注入 + 历史摘要/产物路径 + 新指令,发新 exec)。前端不感知;`resume_mode: Resumed|Replayed` 记录。`EngineCapabilities.supports_resume` 由 `check_engine` 探测填充,任何 resume 失败自动降级重试一次。

**engine 抽象 seam**(未来换 Claude Agent SDK 只改这层):`trait AgentEngine { probe; capabilities; build; run; cancel }`,中立类型 `TaskSpec`/`DomainEvent`/`Usage`/`SandboxTier` 是"宪法";`CodexEngine` 是首个 impl,JSONL 映射是其私有细节。

**错误分类**(`ErrorClass`,前端按 class 给不同 CTA):`NotInstalled | NotLoggedIn | VersionMismatch | ProcessCrash | NonZeroExit{code} | TurnFailed | EngineError | ApprovalDenied | Timeout | NetworkBlocked`。stderr 不当错误(codex 往 stderr 写日志),仅终态 Failure 时作诊断附件。每任务 watchdog(无新事件 N 秒 / 总时长上限)兜底超时→kill。

### 3.2 manifest→UI + 产物层(前端,M1 主体)

**SkillDescriptor 模型**(Rust serde 派生 → 前端消费;前端不解析 YAML):
`id/name/description/status/version?/formCapability/axes[]/inputs[]/alwaysLoad[]/onDemandStages[]/productTypes[]/deps[]/customView?/uiMeta?/firstReleaseTier`。
- `formCapability`: `'axes'`(7 个)| `'manifest-no-axes'`(citation/data/response)| `'prose-only'`(reviewer)。
- `Axis`: `name/values[]/multi/blockingGate/autoDetect/defaultValue?/detectRaw?`;`detect` 含 "BLOCKING GATE"(大小写不敏感)→ `blockingGate=true`。

**axis→控件映射**:`multi=false` → Radio(≤5)/Select(>5),默认选 `defaultValue`;`multi=true` → 多选 Chips;`blockingGate` → 必填标记 + 运行按钮禁用至选中;`autoDetect` → 运行检测预填 + 可手改;`AxisValue.disabled` → 置灰 + tooltip(figure 的 `r` 首版恒灰"即将支持")。运行按钮 = 所有 required 满足 && 所有 blockingGate 满足。

**三档 fallback**(11 个共用同一 DynamicForm + 运行管线):
- 档 A(7 个 axes skill):自动结构化表单。
- 档 B(citation/data/response,有 manifest 无 axes):`FreeTextPanel` + `FileUploadList` + 少量手填 `CustomFieldsRow`(journal_scope/date_range/language 等,**来自逐 skill 静态声明,M0 复核**)。
- 档 C(reviewer,prose):最小可用 = 文件上传(稿件 multi + 图注)+ 自由文本(作者定位),产物固定 md,进度退化为通用 spinner + stdout 流。

**逐 skill UI 规格**(11 行):

| skill | 徽章 | 输入控件 | 必填闸 | 产物 | 预览 | 分层 |
|---|---|---|---|---|---|---|
| nature-figure | Stable | 数据/脚本;backend Radio[python,r灰] | **是**(backend) | svg/pdf/tiff/png | figure 精修视图 | 精修 |
| nature-polishing | Stable | 稿件;paper_type/section(multi)/language/journal | 否 | md | Markdown+**diff** | 精修 |
| nature-writing | Draft | 大纲;4 轴(journal 默认 generic) | 否 | md | Markdown | baseline |
| nature-reader | Beta | 来源(multi);source_format Chips(multi,autoDetect) | 否 | paper.md+source_map.json+notes | **双语对照**+json 树 | 精修 |
| nature-paper2ppt | Beta | 论文;paper_type Select | 否 | pptx | 打开/下载 | baseline |
| nature-paper-to-patent | Beta | 来源(multi);source_format/task_mode/invention_type | 否 | docx×多 | 打开/下载+产物列表 | baseline |
| nature-academic-search | Beta | 查询;workflow Chips(multi);**仅免费源,邮箱预填** | 否 | bib/ris/nbib/csv/json | 引用列表+导Zotero | baseline |
| nature-citation | Beta | 稿件/claim;journal_scope/date_range/language;输出多选 | 否 | enw(默认)/ris/rdf/bib+审查 | 引用列表+审查 md/html | baseline |
| nature-data | Draft | journal/dataset_list/access/language | 否 | md | Markdown | baseline |
| nature-response | Beta | 审稿意见/决定信/草稿;输出 md/docx | 否 | md 或 docx | md 渲染(高亮 AUTHOR_INPUT_NEEDED) | baseline |
| nature-reviewer | Draft v0.1.0 | 稿件(multi)+图注+作者定位(档 C) | 否 | md | **三栏**(3 审稿人+综合) | 精修 |

**产物预览路由**(按 ext):png/tiff→`convertFileSrc`+`<img asset://>`(tiff webview 多不支持→打开/下载或转 png,SPIKE);svg→asset img;pdf→**pdf.js**(本地 worker,禁 CDN);md→react-markdown(+diff/+marker 高亮);bib/ris/enw/nbib/rdf→引用列表+导 Zotero;csv/tsv→表格分页;json→可折叠树(reader 的 source_map.json);html→sandboxed iframe;docx/pptx→`OpenExternalButton`(系统软件打开/下载)。所有读盘路径必须落入 assetProtocol/fs scope(选目录即整树入 scope)。

**figure 精修视图**:左 `plot_*.py`(react-syntax-highlighter,可编辑)/ 右 渲染图并排;"再改一版"回灌生成 v1/v2 版本树(run 间 `parentRunId`),可对比;backend=R 置灰;chart-atlas 选图器(注入下一轮提示);PALETTE 约束默认带上(防模型自由配色)。

**工作区/项目模型**:一个"项目"=一个工作目录(dialog 选目录,整树入 scope):
```
<project>/ project.json · inputs/ · runs/<ts_run-NNN>/{params.json,prompt.txt,stdout.log,stages.json,artifacts/} · sessions/history.jsonl
```
figure 再改一版=新 run,`parentRunId` 串版本树。全本地、零遥测。

### 3.3 环境/依赖层(`env/uv.rs`)

- **uv sidecar**:`bundle.externalBin: ["binaries/uv"]`,带 target triple(`uv-aarch64-apple-darwin`/`uv-x86_64-apple-darwin`/`uv-x86_64-pc-windows-msvc.exe`)。首跑在 app data 目录建隔离 venv,按 skill 依赖装包:figure→matplotlib/seaborn;patent→latex2mathml/Pillow/pypdf/python-docx;paper2ppt→python-pptx(+ libreoffice/pandoc 系统级,体检提示);academic-search MCP→mcp/requests/toml/lxml/pybliometrics;citation→纯 stdlib。
- **codex 调用注入 env**:`HOME`/`CODEX_HOME`(复用用户登录,SPIKE-I)/`PATH`(含 uv venv)。
- **环境体检面板**(M2):探测 codex 登录态+版本、uv venv、各 python 包、libreoffice/pandoc/pdflatex;借鉴 nature-skills `preflight.py` 思路但**补足它只测网络、不测包/key 的缺口**。
- **academic-search MCP**(M3):用 uv 起 FastMCP/stdio server,注册进 codex `[mcp_servers.academic_search]`(统一用 `uv run` 版,不用打架的 install.sh `python3` 版);首版只配 PubMed 邮箱,隐藏 Elsevier。

---

## 四、逐项推进路线图(M0–M4,2-3 人团队)

标签:[RS]=Rust/后端 · [FE]=前端 · [INFRA]=工程/CI · [SPIKE]=验证。

### M0 — 验证与最薄骨架(硬 Gate:所有 SPIKE 出结论才进 M1)
> 这一阶段专门消灭"凭推测"——所有未确认事实必须实测钉死,结论落 `docs/01-codex-spikes-results.md`,再据此定型 engine seam。
- [SPIKE] 跑完下方 §五 SPIKE-A..L(Codex 实测)+ 前端侧 M0 #1-12(manifest/产物事实复核)
- [INFRA] 初始化 Tauri 2.11.x + React + Vite;配 capabilities(shell:allow-execute + codex argv scope、fs `$HOME/.codex/**`+项目目录 scope、assetProtocol scope + CSP)
- [INFRA] codex sidecar 打包(externalBin + target triple)+ **pin 版本**;dev 用 PATH、packaged 用 sidecar
- [RS] `engine/codex.rs` 最小:CommandBuilder 固定骨架 + JsonlParser(半行缓冲+容错)+ DomainEvent 映射 + Channel 推流;`engine` trait seam 定型
- [RS] 单 skill 端到端:`prepare_task`/`run_skill_task`/`cancel_task`(figure/python)
- [FE] 最小控制台(流式渲染 DomainEvent)+ 选 figure + 选数据文件 + 跑 + `convertFileSrc` 显示 png
- **Exit**:mac+win 各跑通 figure 出图;SPIKE 全部有结论并落档;`supports_resume`/skill 注入方式/sandbox 默认/退出码映射均已确定
  - ✅ **macOS 已达成**(2026-06-20):figure 端到端出图显示;SPIKE A2/A/B/C/D/E/F/G/H/J/K 实测;engine seam(`engine.rs`)就位;8 单测绿
  - ⏳ **Windows 验证**留到 M4 CI(本机 macOS 先行);Codex 用本机 0.142.0-alpha.6,产品化前 pin 稳定版回归

### M1 — manifest 通用 runner(全 11 skill baseline)
- [RS] `skills/parser.rs`:serde_yaml 解析 11 个 manifest + SKILL.md frontmatter → SkillDescriptor;`list_skills`/`get_skill`
- [RS] skills 打包 pinned 副本(+LICENSE/NOTICE)+ 设置"检查上游更新"
- [RS] `env/uv.rs`:uv sidecar 首跑自举隔离 venv + 按 skill 装 python 依赖
- [RS] `session/mod.rs`:resume 双路(据 SPIKE-E)+ 无状态回落
- [FE] SkillDescriptor zustand store + skill 目录卡片(成熟度徽章)
- [FE] `DynamicForm`:档 A(axes→控件)+ 档 B/C fallback + 校验/必填闸
- [FE] `ArtifactPreviewRouter`:md/png/svg/pdf.js/csv/json/citation-list/open-external
- [FE] 工作区/项目模型(project.json / runs/ 目录结构)
- **Exit**:11 个 skill 都能以"表单+流式+产物"形态跑通(baseline);uv 环境自举在 mac+win 成功

### M2 — figure 精修 + 环境体检
- [FE] figure 精修视图(代码/图并排 + 再改一版回灌 + 版本树 + chart-atlas 选图 + PALETTE 约束)
- [RS/FE] 环境体检面板(codex 登录/版本、uv venv、python 包、libreoffice/pandoc/pdflatex)
- [RS/FE] 沙箱"高级全放开"开关 + 二次确认 + 持久警示
- [FE] token 用量展示(turn.completed.usage)
- **Exit**:figure 出图→看图→改图→对比闭环;体检面板覆盖所有 skill 依赖并给修复指引

### M3 — 高价值定制 + academic-search
- [FE] polishing diff 视图(原稿 vs 润色)、reader 双语对照 + source_map.json 树、reviewer 三栏
- [RS] academic-search MCP server 生命周期(uv run FastMCP/stdio)+ 注册进 codex config(免费源邮箱设置面板,隐藏 Elsevier)
- [FE] citation/academic-search 引用列表 + 导 Zotero(集成方式据 M0 #7)
- **Exit**:4 个精修视图就位;academic-search 免费源 arXiv/Crossref/PubMed 可用

### M4 — 打磨 + 分发
- [INFRA] CI matrix(mac/win)用 `tauri-action`;macOS 签名+公证、Windows 代码签名(参考 mochat desktop.yml)
- [FE] 成熟度徽章全覆盖、错误分类 CTA 完整、i18n(中/英,复用 mochat i18next)
- [RS] skills 上游同步、Office 打开/下载、watchdog/取消/僵尸进程回收(参考 sidecar.ts SIGTERM→SIGKILL)
- **Exit**:可分发内测版(.dmg / .msi),首启引导(codex 登录检测 + uv 环境自举进度)完整

---

## 五、M0 验证 spike 清单(必须最先执行,用 pinned 版 codex)

> **执行状态见 `01-codex-spikes-results.md`**:A2/B/C/D/E/F/G/H/J/K 已在 codex 0.142.0-alpha.6 实测确认;I 部分确认;L 顺延到 Tauri 搭好后。下表为 spike 定义,产品 pin 稳定版后需全表回归。

| ID | 验证 | 最小步骤 | 影响 |
|---|---|---|---|
| SPIKE-A | codex exec 实际扫哪个 skills 目录(`.agents/skills` vs `~/.codex/skills`) | 两处各放独特 description 的 SKILL.md,跑 exec 看哪个被加载 | mention/隐式路能否启用;同步目标目录 |
| SPIKE-B | item.type 单复数(`file_changes` vs `file_change` 等) | 让 codex 改文件,抓真实 JSONL grep `"type":` 全集 | serde alias 是否够;映射字段名 |
| SPIKE-C | exec 下隐式 description 触发是否生效 | 指令不提 skill 名,看是否自动加载 | 是否保留隐式兜底;否则纯显式注入 |
| SPIKE-D | `$skill-name` 显式 mention 在 exec 下是否解析 | 指令含 `$probe-skill` 观察 | 是否启用省 token 的 mention 路 |
| SPIKE-E | exec 模式 thread resume 是否存在且有效 | 拿 thread_id,试 `codex exec resume <id>` / `-c` 覆盖 / `--help` | 会话快路是否可用;`supports_resume` |
| SPIKE-F | 不传 `--sandbox` 的权威默认值 | 不带 flag 触发写操作看是否被拒 + 查 `--help` | 是否总是显式传 `--sandbox`(预期:是) |
| SPIKE-G | 成功/各类失败退出码数值 | 制造正常/turn.failed/auth 缺失/用法错误看 `$?` | NonZeroExit 细分映射 |
| SPIKE-H | `codex exec -` stdin=上下文、位置参数=指令的实际行为 | 两者各放可识别标记,看最终回复是否都用到 | 指令/上下文切分策略 |
| SPIKE-I | 子进程继承 HOME/CODEX_HOME 复用登录 | 自定义 CODEX_HOME 先登录,spawn 验证免登录 | env 注入;未登录探测 |
| SPIKE-J | `-c sandbox_workspace_write.network_access=true` 命令级放网是否生效 | workspace-write 下跑 uv 装包对比带/不带 | 联网开关实现 |
| SPIKE-K | `--output-last-message`/`--output-schema` 是否如期 | 跑带两 flag 的 exec 校验文件与 agent_message.text 一致 | 产物冗余来源;结构化 skill |
| SPIKE-L | Tauri `Receiver<CommandEvent>` 是否严格按行、长事件不被切 | 跑超长 reasoning,Rust 打点验证每 Stdout(line) 合法 JSON | 半行缓冲必要性 |
| M0-UI-1 | `agents/openai.yaml` 确切 schema(invocation policy/UI 字段) | 抓各 skill 该文件 | uiMeta 解析 |
| M0-UI-2 | `detect` 文案除 "BLOCKING GATE" 外的预填判定规则 | 读各 manifest detect 原文 | autoDetect 解析 |
| M0-UI-3 | reader `source_format` 能否从文件自动判别 | 试 pdf/scanned/html/doi 样本 | reader 预填可行性 |
| M0-UI-4 | 产物清单是否由 manifest 声明 or 需静态映射表 | 复核 manifest 字段 | 逐 skill 产物可靠性 |
| M0-UI-7 | Zotero 集成(导出文件 vs connector;enw/ris/rdf 哪个最稳) | 试导入 Zotero | citation 导出实现 |

每条 SPIKE 都已配保守默认分支(见 §三),即使结论不利也不阻塞——只是决定走快路还是回落路。

---

## 六、测试 / CI / 工程规格(2-3 人)

- **分工建议**:1×[RS](engine/session/env/parser)、1×[FE](DynamicForm/预览/精修视图)、1×浮动(INFRA/CI/设计/测试)。
- **测试**:Rust 单测覆盖 JsonlParser(喂真实 JSONL 样本 + 畸形/半行/未知 type)、CommandBuilder(TaskSpec→argv 快照)、错误分类。前端组件测 DynamicForm 三档渲染 + 校验。端到端冒烟:每 skill 一个最小输入跑通(CI 中用 mock engine,避免真调 LLM)。
- **CI**:GitHub Actions matrix(macOS+Windows runner),`tauri-action` 构建;sidecar 阶段下载/校验 pinned codex+uv 并按 target triple 重命名进 externalBin。
- **接口契约**:`DomainEvent`/`SkillDescriptor`/IPC command 签名是 FE-RS 边界契约,改动需同步双侧类型。
- **engine 版本治理**:pin codex 版本;升级前用 SPIKE-B/G/L 回归事件流;出现大量 `Raw` 事件时 UI 软警告版本不兼容。

---

## 七、风险与对策

| 风险 | 对策 |
|---|---|
| Codex 0.x 输出格式漂移 | JSONL 容错(未知→Raw)、serde alias、pin 版本、升级回归 SPIKE |
| skills 目录 `.agents/skills` 与 nature-skills 脚本目标冲突 | 主路显式注入不依赖目录;若启用 mention 路则按 SPIKE-A 钉死并同步到正确目录 |
| resume 在 exec 下不可用 | 双路设计,默认无状态回落,用户无感 |
| 环境地狱 | uv sidecar 隔离 venv + 体检面板;libreoffice/pandoc 等系统级依赖以"打开/下载"降级,不强依赖 |
| 多数 skill 仍 Draft/Beta | 成熟度徽章显式标注,管理预期 |
| 自动执行 LLM 生成代码的安全 | 默认 workspace-write+never(需审批即失败不挂起)、限定项目目录、高级档二次确认 |
| 上游 break 传导 | 打包 pinned 版,更新为可选手动操作 |

---

## 八、验证方式(端到端)

1. **M0 验证**:在 macOS 与 Windows 各执行一次"选 figure → 选 csv → 运行 → 看到 png 渲染",并产出 `docs/01-codex-spikes-results.md`(SPIKE 全表结论)。
2. **M1 验证**:11 个 skill 逐一以最小输入跑通,产物落 `runs/<ts>/artifacts/` 且预览正确;uv venv 自举成功(`check_engine` 全绿)。
3. **M2 验证**:figure"再改一版"产生 v2 并能对比;环境体检面板对缺失依赖给出准确修复指引。
4. **M3 验证**:academic-search 免费源返回真实文献并导出 bib/ris;polishing diff、reader 双语、reviewer 三栏正确渲染。
5. **M4 验证**:CI 在 mac+win 产出已签名安装包;干净机器安装后首启引导可完成 codex 登录检测 + 环境自举。
