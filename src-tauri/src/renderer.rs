//! 图表参数化渲染器 —— 移植自 Sci-Data-Analyzer 的 chart_renderer 模块。
//!
//! 接收前端传来的 plot_spec + plot_data JSON,注入预置模板渲染成 SVG/PNG。
//! 全程不经过 LLM,纯本地 matplotlib 子进程,延迟百毫秒级。

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::pyenv;

/// 前端预览请求。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRequest {
    /// 图表类型 → 决定使用哪个模板(line / bar / heatmap / line_dual_y)
    pub chart_type: String,
    /// 绘图参数(标题 / 坐标轴 / 样式 / 序列颜色等)
    pub plot_spec: Value,
    /// 绘图数据(series 数组,含 x / y / color / line_width / visible)
    pub plot_data: Value,
    /// 输出格式(svg | png)
    #[serde(default = "default_format")]
    pub format: String,
}

fn default_format() -> String {
    "svg".to_string()
}

/// 渲染结果(前端转 data URL 显示)。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResponse {
    pub image_base64: String,
    pub image_format: String,
    pub warnings: Vec<Value>,
}

/// 图表类型 → 模板文件名。
fn template_for(chart_type: &str) -> &str {
    match chart_type {
        "bar" => "bar_plot.py",
        "heatmap" => "heatmap_plot.py",
        "line_dual_y" | "dual_y" => "dual_y_plot.py",
        _ => "line_plot.py",
    }
}

/// 定位模板文件:优先打包后的 resource 目录,回退开发时源码目录。
fn resolve_template(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let resource = app.path().resource_dir().ok();
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates: [Option<PathBuf>; 2] = [
        resource.map(|d| d.join("chart_renderer/templates").join(name)),
        Some(dev.join("resources/chart_renderer/templates").join(name)),
    ];
    for c in candidates.into_iter().flatten() {
        if c.exists() {
            return Ok(c);
        }
    }
    Err(format!("找不到绘图模板: {name}"))
}

#[tauri::command]
pub async fn preview_plot(
    app: AppHandle,
    request: PreviewRequest,
) -> Result<PreviewResponse, String> {
    let fmt = match request.format.to_lowercase().as_str() {
        "png" => "png",
        _ => "svg",
    }
    .to_string();

    // 1. 定位模板
    let template_name = template_for(&request.chart_type);
    let template_path = resolve_template(&app, template_name)?;

    // 2. 临时工作目录(函数返回时自动清理)
    let tmp = tempfile::tempdir().map_err(|e| format!("创建临时目录失败: {e}"))?;
    let work = tmp.path().to_path_buf();

    // 3. 写 plot_spec.json(注入 output_format / schema_version)
    let mut spec = request.plot_spec;
    if let Value::Object(ref mut map) = spec {
        map.insert("output_format".into(), Value::String(fmt.clone()));
        map.insert("schema_version".into(), json!(1));
    }
    fs::write(work.join("plot_spec.json"), spec.to_string())
        .map_err(|e| format!("写 plot_spec.json 失败: {e}"))?;

    // 4. 写 plot_data.json
    let mut data = request.plot_data;
    if data.is_null() {
        data = json!({ "schema_version": 1, "series": [] });
    } else if let Value::Object(ref mut map) = data {
        map.insert("schema_version".into(), json!(1));
    }
    fs::write(work.join("plot_data.json"), data.to_string())
        .map_err(|e| format!("写 plot_data.json 失败: {e}"))?;

    // 5. 复制模板为 plot.py(模板从脚本同目录读 JSON)
    fs::copy(&template_path, work.join("plot.py"))
        .map_err(|e| format!("复制模板失败: {e}"))?;

    // 6. 获取 python(优先 uv venv,回退系统 python3)
    let venv_py = pyenv::venv_python();
    let python: PathBuf = if venv_py.exists() {
        venv_py
    } else {
        PathBuf::from("python3")
    };

    // 7. 执行(清白环境 + headless matplotlib,在阻塞线程避免卡 async 运行时)
    let py = python.clone();
    let script = work.join("plot.py");
    let cwd = work.clone();
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(&py)
            .arg(&script)
            .env("MPLBACKEND", "Agg")
            .env("HOME", &cwd)
            .env("PYTHONUNBUFFERED", "1")
            .current_dir(&cwd)
            .output()
    })
    .await
    .map_err(|e| format!("渲染线程异常: {e}"))?
    .map_err(|e| format!("启动 python 失败: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "绘图失败(exit {})\n--- stderr ---\n{}\n--- stdout ---\n{}",
            output.status, stderr, stdout
        ));
    }

    // 8. 读取输出图片
    let out_file = work.join(format!("out.{fmt}"));
    let bytes = fs::read(&out_file)
        .map_err(|e| format!("读取输出图片失败({}): {e}", out_file.display()))?;

    if bytes.len() > 20 * 1024 * 1024 {
        return Err("输出图片过大(>20MB)".into());
    }

    // 9. base64 编码返回
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(PreviewResponse {
        image_base64: b64,
        image_format: fmt,
        warnings: vec![],
    })
}
