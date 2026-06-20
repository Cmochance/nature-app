# M0 Codex Spike 实测结论

> 实测日期:2026-06-20
> 实测环境:`codex 0.142.0-alpha.6`(macOS,Codex.app 自带 CLI:`/Applications/Codex.app/Contents/Resources/codex`)
> ⚠️ 版本 caveat:本机是 **alpha 版且重度定制**(用户全局 config 为 `danger-full-access` + `approval_policy=never` + `model=gpt-5.5`)。**产品须 pin 一个稳定版 codex-cli 并在该版本上回归本表**;下列结论是强证据,但不替代对 pinned 版的复测。

## 结论总表

| Spike | 状态 | 结论 | 对 plan 的动作 |
|---|---|---|---|
| 事件流格式 (A2) | ✅ 实测 | 见 §1,JSONL 结构与字段已逐字段确认 | 映射表定型 |
| SPIKE-A skills 目录 | ✅ 实测 | `~/.codex/skills/` 真实存在且被加载(隐式触发成功即证);`~/.agents/skills` 不存在 | 同步目标 = `~/.codex/skills/` |
| SPIKE-B file 命名 | ✅ 实测 | item.type = **`file_change`(单数)**,payload `changes:[{path, kind}]`,kind 如 `"add"` | 改 Rust 类型(见 §2) |
| SPIKE-C 隐式触发 | ✅ 实测 | **exec 下靠 description 隐式触发生效**(probe token 命中) | 隐式路可作兜底 |
| SPIKE-D $mention | ✅ 实测 | **exec 下 `$skill-name` 触发生效** | 可作省 token 优化路 |
| SPIKE-E resume | ✅ 实测 | `codex exec resume <id>`(或 `--last`)子命令存在 | thread-resume 快路可行 |
| SPIKE-F sandbox/审批 | ✅ 实测 | exec **无 `--ask-for-approval`**;只有 `-s/--sandbox [read-only\|workspace-write\|danger-full-access]` 和 `--dangerously-bypass-approvals-and-sandbox`。workspace-write 写边界强制执行(写 `$HOME` 根被拒) | **删掉 `--ask-for-approval`,每次显式传 `--sandbox`** |
| SPIKE-G 退出码 | ✅ 实测 | 成功 = `0` | NonZeroExit 细分待补 |
| SPIKE-H stdin | ✅ 实测 | ⭐ 即使给了 prompt 位置参数,**stdin 为开放管道会挂住等 EOF**;必须关闭(`</dev/null`)或写完即关 | spawn 必须管 stdin 关闭 |
| SPIKE-J network 开关 | ✅ 实测 | `-c sandbox_workspace_write.network_access=true` → 联网(HTTP 200);`false`/read-only → 被拦(curl exit 7) | "允许联网"开关机制确定 |
| SPIKE-K -o | ✅ 实测 | `--output-last-message <file>` 正常写出最终文本,与 `agent_message.text` 一致 | 旁路冗余可用 |
| SPIKE-I CODEX_HOME | 🟡 部分 | auth 存于 `$CODEX_HOME/auth.json`;**默认 `~/.codex` 被继承复用**(所有 exec 免登录成功即证)。fresh CODEX_HOME 需登录的路径未测(避免交互挂起) | app 继承默认或显式设 `CODEX_HOME=~/.codex` |
| SPIKE-L Tauri 按行 | ⏳ 顺延 | 需 Tauri 工程才能测,留 M0 编码阶段 | — |

---

## 1. JSONL 事件契约(`codex exec --json`,逐字段实测)

一次"建文件"任务的真实事件序列:
```jsonl
{"type":"thread.started","thread_id":"019ee4c6-4fbc-7f00-8e26-0b552b366fc1"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"..."}}
{"type":"item.started","item":{"id":"item_1","type":"file_change","changes":[{"path":"...","kind":"add"}],"status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_1","type":"file_change","changes":[{"path":"/tmp/.../hello.txt","kind":"add"}],"status":"completed"}}
{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"已创建 `hello.txt`…"}}
{"type":"turn.completed","usage":{"input_tokens":44467,"cached_input_tokens":27712,"output_tokens":74,"reasoning_output_tokens":31}}
```

确认要点:
- 顶层事件:`thread.started{thread_id}` → `turn.started` → 多个 `item.started`/`item.completed{item}` → `turn.completed{usage}`。
- `item` = `{id, type, ...type-specific}`:
  - `reasoning` → `{id, type, text}`
  - `file_change` → `{id, type, changes:[{path, kind}], status}`(status: `in_progress`→`completed`)
  - `agent_message` → `{id, type, text}`(最后一个 = 最终答复)
- `usage` 字段名:`input_tokens` / `cached_input_tokens` / `output_tokens` / `reasoning_output_tokens`。
- 本任务未出现 `command_execution`(模型用内建文件工具直接改文件);当模型跑 shell 命令时才会出 `command_execution`。

## 2. 必须修正的 plan 细节(实测推翻原假设)

1. **`--ask-for-approval` 不存在于 exec** → 命令骨架删掉它。非交互 exec 不走交互审批,沙箱完全由 `--sandbox` 决定。
2. **`file_change` 是单数,payload 是 `changes:[{path,kind}]`** → Rust 类型改为:
   ```rust
   FileChange { id: String, changes: Vec<FileChangeEntry>, status: Option<String> }
   struct FileChangeEntry { path: PathBuf, kind: String }  // kind: "add" | (推测 "update"/"delete",待补测)
   ```
   serde 默认名用 `file_change`;保留 `#[serde(alias="file_changes")]` 兼容未来版本。
3. **stdin 必须关闭**:spawn `codex exec` 时,无 stdin 上下文 → 重定向 `/dev/null`;有上下文 → `child.write(payload)` 后**立即关闭 stdin**,否则进程挂起等 EOF。
4. **不能依赖用户全局 config**:用户 `~/.codex/config.toml` 可能是 `danger-full-access`/任意值 → app **每次显式传 `--sandbox workspace-write`**(必要时 `--ignore-user-config`,但注意它也会丢 model 设置,auth 仍走 CODEX_HOME)。
5. **skill 注入有三条可用路**(均实测可用):显式注入 SKILL.md(最确定,主路)/ `$mention`(省 token)/ 隐式 description 匹配(兜底)。

## 3. 新发现的有用 exec flag

| flag | 用途 |
|---|---|
| `--add-dir <DIR>` | workspace 之外额外可写目录(多输入目录场景有用) |
| `--ephemeral` | 不落盘 session 文件(一次性任务可用) |
| `--ignore-user-config` | 不加载用户 config.toml(auth 仍用 CODEX_HOME)——隔离用户全局设置 |
| `-i, --image <FILE>` | 给初始 prompt 附图(reader/figure 可能用到) |
| `-c key=value` | 值按 TOML 解析;嵌套用点路径(如 `sandbox_workspace_write.network_access=true`) |
| `--output-schema <FILE>` | 强制最终响应 JSON Schema(结构化产物) |

## 4. `codex sandbox` 子命令(确定性测沙箱,不调 LLM)

- `codex sandbox [-c k=v]... -- <command...>` 可在 seatbelt 沙箱里直接跑命令、**无需 LLM**,适合 CI/自测沙箱行为。
- ⚠️ **本版本 `-C`/`--cd <DIR>` flag 坏**(传了就报 usage 错);命令位前导带 flag(如 `bash -lc`)也会被误当 codex 选项 → 用 `--` 分隔,且命令位避免前导 flag。
- 已用它确定性验证 SPIKE-J(网络)与写边界。

## 5. 仍待补的小项(不阻塞 M0 编码)

- SPIKE-G 扩展:各类失败(auth 缺失/用法错误/turn.failed)的退出码数值。
- file_change 的 `kind` 全集(add 之外的 update/delete/rename 命名)。
- SPIKE-L:Tauri `Receiver<CommandEvent>` 是否严格按行 + 长事件不被切(M0 搭好 Tauri 后测)。
- SPIKE-I 完整版:fresh CODEX_HOME 的登录行为(需要时再测,注意避免交互挂起)。
- pinned 稳定版 codex-cli 上的全表回归(产品化前必做)。
