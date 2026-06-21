//! academic-search 的 MCP server 注册(全套里最复杂的异类)。
//!
//! 不自管进程生命周期:用 `codex mcp add` 把 FastMCP/stdio server 注册进 codex 配置,
//! codex 在任务用到 MCP 工具时按需启动。命令照搬 bundled config/mcp-snippet.json
//! (uv run --with ...),但 `<MCP_SERVER_DIR>` 换成安装后的实际路径、`uv` 用绝对路径
//! (防打包后 PATH 缺失)。首版仅免费源(PubMed 需邮箱;Scopus/ScienceDirect 的 Elsevier
//! key 不配 → 自然不可用)。
//!
//! 全部 codex 调用走 `engine::codex_command()`(隔离 CODEX_HOME),注册写进项目自己的
//! 配置环境,与本地 `~/.codex` 不交叉。

use std::path::PathBuf;

const SERVER_NAME: &str = "academic-search";

/// 安装后 MCP server 所在目录(install_skills 已把 skill 拷到隔离 CODEX_HOME 的 skills/)。
pub fn mcp_server_dir() -> PathBuf {
    crate::engine::codex_home()
        .join("skills")
        .join("nature-academic-search")
        .join("mcp-server")
}

/// 是否已注册(`codex mcp list` 含该名)。
pub fn is_registered() -> bool {
    crate::engine::codex_command()
        .args(["mcp", "list"])
        .output()
        .ok()
        .map(|o| {
            let s = String::from_utf8_lossy(&o.stdout);
            s.contains(SERVER_NAME)
        })
        .unwrap_or(false)
}

/// 注册 academic-search MCP(免费源,需 PubMed 邮箱)。幂等:先移除再添加。
pub fn register(email: &str) -> Result<(), String> {
    let uv = crate::pyenv::resolve_uv().ok_or("uv 不可用(请先安装 uv)")?;
    let dir = mcp_server_dir();
    if !dir.exists() {
        return Err(format!(
            "MCP server 目录不存在: {}(请先确保 skills 已同步到隔离 CODEX_HOME 的 skills/)",
            dir.display()
        ));
    }
    let dir_s = dir.to_string_lossy().to_string();

    // 幂等:先移除旧注册(忽略错误)
    let _ = crate::engine::codex_command()
        .args(["mcp", "remove", SERVER_NAME])
        .output();

    let args: Vec<String> = vec![
        "mcp".into(),
        "add".into(),
        SERVER_NAME.into(),
        "--env".into(),
        format!("PUBMED_EMAIL={email}"),
        "--".into(),
        uv,
        "run".into(),
        "--no-project".into(),
        "--directory".into(),
        dir_s,
        "--with".into(),
        "mcp>=1.0.0,<2.0.0".into(),
        "--with".into(),
        "requests>=2.28.0,<3.0.0".into(),
        "--with".into(),
        "toml>=0.10.2,<2.0.0".into(),
        "--with".into(),
        "lxml>=4.9.0,<6.0.0".into(),
        "--with".into(),
        "pybliometrics>=4.4.1,<5.0.0".into(),
        "python".into(),
        "academic_search_server.py".into(),
    ];

    let out = crate::engine::codex_command()
        .args(&args)
        .output()
        .map_err(|e| format!("codex mcp add 执行失败: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}
