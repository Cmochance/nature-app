//! uv 托管的隔离 Python 环境(根治"环境地狱":系统 Python 3.14 + 沙箱缓存问题)。
//!
//! 用 uv 建一个 pinned-Python 的 venv,装好各 skill 的 python 依赖;engine spawn codex 时
//! 把 venv/bin 前置进 PATH(配合 shell_environment_policy.inherit=all),codex 跑的 `python3`
//! 就解析到这个稳定环境。未就绪时回落系统 python。

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

/// pinned Python(稳定版,避开系统 3.14 的新轮子问题)。
const PYTHON_VERSION: &str = "3.13";
/// 各 skill 的 python 依赖(figure/patent/paper2ppt;academic-search 的 pybliometrics 留 M3)。
const PACKAGES: &[&str] = &[
    "matplotlib",
    "seaborn",
    "numpy",
    "python-docx",
    "pypdf",
    "Pillow",
    "latex2mathml",
    "python-pptx",
];
/// 包集合版本标记;改变包集合时 bump 以触发重装。
const MARKER_VERSION: &str = "m1-v1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PyEnvStatus {
    pub uv: Option<String>,
    pub ready: bool,
    pub venv: String,
    pub python: Option<String>,
    /// 在 uv venv 中能否导入 matplotlib(用于 figure skill)。
    pub matplotlib_ok: bool,
    /// 在 uv venv 中能否导入 seaborn (用于绘图辅助)。
    pub seaborn_ok: bool,
}

pub fn pyenv_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
        .join(".nature-app")
        .join("pyenv")
}

pub fn venv_python() -> PathBuf {
    pyenv_dir().join("bin").join("python")
}

fn venv_bin() -> PathBuf {
    pyenv_dir().join("bin")
}

fn marker() -> PathBuf {
    pyenv_dir().join(".nature-ready")
}

/// 定位 uv:env 覆盖 > 常见安装位置 > PATH。打包版 sidecar 留 M4。
pub fn resolve_uv() -> Option<String> {
    if let Ok(p) = std::env::var("NATURE_APP_UV_BIN") {
        if !p.is_empty() {
            return Some(p);
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.local/bin/uv"),
        "/opt/homebrew/bin/uv".to_string(),
        "/usr/local/bin/uv".to_string(),
    ];
    for c in candidates {
        if Path::new(&c).exists() {
            return Some(c);
        }
    }
    if Command::new("uv")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Some("uv".to_string());
    }
    None
}

pub fn is_ready() -> bool {
    venv_python().exists()
        && std::fs::read_to_string(marker())
            .map(|s| s.trim() == MARKER_VERSION)
            .unwrap_or(false)
}

/// venv 就绪则返回其 bin 目录(供 engine 前置 PATH)。
pub fn venv_bin_if_ready() -> Option<String> {
    if is_ready() {
        Some(venv_bin().to_string_lossy().to_string())
    } else {
        None
    }
}

/// 在 uv venv 中检测指定 Python 包能否正常导入(仅 stdout=0 即判定成功)。
pub fn python_import_ok(pkg: &str) -> bool {
    let out = Command::new(venv_python())
        .args(["-c", &format!("import {}", pkg)])
        .output()
        .ok();
    matches!(out, Some(o) if o.status.success())
}

/// 检测 matplotlib 是否可导入(用于 figure skill)。
pub fn has_matplotlib() -> bool {
    python_import_ok("matplotlib") || python_import_ok("matplotlib.pyplot")
}

/// 检测 seaborn 是否可导入(用于绘图辅助)。
pub fn has_seaborn() -> bool {
    python_import_ok("seaborn")
}

pub fn status() -> PyEnvStatus {
    PyEnvStatus {
        uv: resolve_uv(),
        ready: is_ready(),
        venv: pyenv_dir().to_string_lossy().to_string(),
        python: venv_python()
            .exists()
            .then(|| venv_python().to_string_lossy().to_string()),
        matplotlib_ok: has_matplotlib(),
        seaborn_ok: has_seaborn(),
    }
}

/// 创建隔离 venv(pinned python)+ 装 skill 依赖。慢(首次下载 wheels),应后台跑。幂等。
pub fn ensure_pyenv() -> Result<(), String> {
    if is_ready() {
        return Ok(());
    }
    let uv = resolve_uv().ok_or("uv 不可用(未安装)")?;
    let dir = pyenv_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // uv venv --python 3.13 <dir>
    let out = Command::new(&uv)
        .args([
            "venv",
            "--python",
            PYTHON_VERSION,
            dir.to_string_lossy().as_ref(),
        ])
        .output()
        .map_err(|e| format!("uv venv: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "uv venv 失败: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    // uv pip install --python <venv>/bin/python <pkgs...>
    let mut args: Vec<String> = vec![
        "pip".into(),
        "install".into(),
        "--python".into(),
        venv_python().to_string_lossy().to_string(),
    ];
    args.extend(PACKAGES.iter().map(|s| s.to_string()));
    let out = Command::new(&uv)
        .args(&args)
        .output()
        .map_err(|e| format!("uv pip install: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "uv pip install 失败: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    std::fs::write(marker(), MARKER_VERSION)
        .map_err(|e| format!("写 venv marker 失败(venv 已建但下次会重装): {e}"))?;
    Ok(())
}
