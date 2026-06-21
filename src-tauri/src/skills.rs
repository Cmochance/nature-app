//! nature-skills manifest / SKILL.md 解析 → SkillDescriptor。
//!
//! 解析 schema(实读 pinned 仓库确认):
//! - SKILL.md frontmatter:`name` / `description`(面向用户,含中文触发词)/ `version`。
//! - manifest.yaml:`always_load`(路径列表)、`axes.<name>.{detect, values(有序 map), default?, multi?}`、
//!   `references.on_demand[].{condition, path}`。
//! - 三档 formCapability:有 axes → axes;有 manifest 无 axes → manifestNoAxes;无 manifest(reviewer)→ proseOnly。
//!
//! 用 serde_yaml::Value 防御式读取,容忍各 skill 的 schema 差异。

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDescriptor {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: String, // stable | beta | draft
    pub version: Option<String>,
    pub form_capability: String, // axes | manifestNoAxes | proseOnly
    pub has_manifest: bool,
    pub always_load: Vec<String>,
    pub axes: Vec<Axis>,
    pub on_demand: Vec<OnDemandRef>,
    /// skill 目录绝对路径(供注入 / 安装到 codex skills 目录用)。
    pub dir: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Axis {
    pub name: String,
    pub values: Vec<String>,
    pub multi: bool,
    pub blocking_gate: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnDemandRef {
    pub condition: String,
    pub path: String,
}

/// 成熟度来自 README 索引表(manifest/frontmatter 无可靠 status 字段)。
fn status_for(id: &str) -> &'static str {
    match id {
        "nature-figure" | "nature-polishing" => "stable",
        "nature-writing" | "nature-data" | "nature-reviewer" => "draft",
        _ => "beta",
    }
}

/// skills 根目录:env 覆盖 > dev 相对工程(CARGO_MANIFEST_DIR/../skills-bundled)。
/// 打包版的 resource 解析留待 M4。
pub fn skills_root() -> PathBuf {
    if let Ok(p) = std::env::var("NATURE_APP_SKILLS_DIR") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../skills-bundled")
}

/// 提取 SKILL.md 顶部 frontmatter(两个 `---` 之间)并解析为 YAML。
fn parse_frontmatter(skill_md: &str) -> Option<serde_yaml::Value> {
    let trimmed = skill_md.trim_start_matches('\u{feff}').trim_start();
    let rest = trimmed.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    serde_yaml::from_str(rest[..end].trim_start_matches('\n')).ok()
}

fn val_str(v: &serde_yaml::Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}

fn seq_of_strings(v: &serde_yaml::Value) -> Vec<String> {
    v.as_sequence()
        .map(|s| {
            s.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn parse_axes(m: &serde_yaml::Value) -> Vec<Axis> {
    let axes_map = match m.get("axes").and_then(|a| a.as_mapping()) {
        Some(am) => am,
        None => return vec![],
    };
    let mut out = vec![];
    for (k, av) in axes_map {
        let name = match k.as_str() {
            Some(n) => n.to_string(),
            None => continue,
        };
        let detect = av.get("detect").and_then(|d| d.as_str()).unwrap_or("");
        let blocking_gate = detect.to_uppercase().contains("BLOCKING GATE");
        // values 是有序 map(value_key -> fragment 路径),取键、保持声明顺序
        let values = av
            .get("values")
            .and_then(|vv| vv.as_mapping())
            .map(|vm| {
                vm.iter()
                    .filter_map(|(vk, _)| vk.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let multi = av.get("multi").and_then(|x| x.as_bool()).unwrap_or(false);
        let default_value = av
            .get("default")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        out.push(Axis {
            name,
            values,
            multi,
            blocking_gate,
            default_value,
        });
    }
    out
}

fn parse_on_demand(m: &serde_yaml::Value) -> Vec<OnDemandRef> {
    m.get("references")
        .and_then(|r| r.get("on_demand"))
        .and_then(|o| o.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|e| {
                    Some(OnDemandRef {
                        condition: e.get("condition").and_then(|c| c.as_str())?.to_string(),
                        path: e
                            .get("path")
                            .and_then(|p| p.as_str())
                            .unwrap_or("")
                            .to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_skill(dir: &Path) -> Option<SkillDescriptor> {
    let id = dir.file_name()?.to_str()?.to_string();
    let skill_md = std::fs::read_to_string(dir.join("SKILL.md")).ok()?;
    let fm = parse_frontmatter(&skill_md);

    let name = fm
        .as_ref()
        .and_then(|v| val_str(v, "name"))
        .unwrap_or_else(|| id.clone());
    let description = fm
        .as_ref()
        .and_then(|v| val_str(v, "description"))
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let version = fm.as_ref().and_then(|v| val_str(v, "version"));

    let manifest_path = dir.join("manifest.yaml");
    let has_manifest = manifest_path.exists();
    let mut axes = vec![];
    let mut always_load = vec![];
    let mut on_demand = vec![];
    let mut form_capability = "proseOnly".to_string();

    if has_manifest {
        if let Ok(txt) = std::fs::read_to_string(&manifest_path) {
            if let Ok(m) = serde_yaml::from_str::<serde_yaml::Value>(&txt) {
                always_load = m.get("always_load").map(seq_of_strings).unwrap_or_default();
                on_demand = parse_on_demand(&m);
                axes = parse_axes(&m);
                form_capability = if axes.is_empty() {
                    "manifestNoAxes".into()
                } else {
                    "axes".into()
                };
            }
        }
    }

    Some(SkillDescriptor {
        id: id.clone(),
        name,
        description,
        status: status_for(&id).to_string(),
        version,
        form_capability,
        has_manifest,
        always_load,
        axes,
        on_demand,
        dir: dir.to_string_lossy().to_string(),
    })
}

/// 扫描 skills 根目录,解析所有 nature-* skill。
pub fn load_skills(root: &Path) -> Vec<SkillDescriptor> {
    let rd = match std::fs::read_dir(root) {
        Ok(r) => r,
        Err(_) => return vec![],
    };
    let mut dirs: Vec<PathBuf> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("nature-"))
                .unwrap_or(false)
        })
        .collect();
    dirs.sort();
    dirs.iter().filter_map(|d| parse_skill(d)).collect()
}

/// 安装/同步 bundled skills 到隔离 CODEX_HOME 的 `skills/`,使 codex 能原生加载
/// nature-* 技能(SPIKE-C/D 已验证 codex 从该目录隐式/显式触发 skill)。
/// 幂等:marker 记录 pinned commit,未变则跳过(返回 0)。
pub fn install_skills(bundled_root: &Path) -> Result<usize, String> {
    let codex_skills = crate::engine::codex_home().join("skills");
    std::fs::create_dir_all(&codex_skills).map_err(|e| e.to_string())?;

    let pin = std::fs::read_to_string(bundled_root.join(".pinned"))
        .unwrap_or_default()
        .trim()
        .to_string();
    let marker = codex_skills.join(".nature-app-installed");
    let installed = std::fs::read_to_string(&marker)
        .unwrap_or_default()
        .trim()
        .to_string();
    if !pin.is_empty() && pin == installed {
        return Ok(0); // 已是最新,跳过
    }

    let mut n = 0;
    for entry in std::fs::read_dir(bundled_root)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let name = entry.file_name();
        let ns = name.to_string_lossy().to_string();
        // 只装 _shared 与 nature-*;不碰用户已有的其它 skill
        if entry.path().is_dir() && (ns == "_shared" || ns.starts_with("nature-")) {
            let dst = codex_skills.join(&name);
            // 清旧版失败(非"不存在")必须传播,否则残留旧文件 + 下面照写 marker → 永久脏状态
            if let Err(e) = std::fs::remove_dir_all(&dst) {
                if e.kind() != std::io::ErrorKind::NotFound {
                    return Err(format!("清理旧 skill {ns} 失败: {e}"));
                }
            }
            copy_dir_all(&entry.path(), &dst).map_err(|e| format!("copy {ns}: {e}"))?;
            n += 1;
        }
    }
    // marker 写失败也传播:否则下次跳过 → 假"已是最新"
    std::fs::write(&marker, &pin).map_err(|e| format!("写 skills marker 失败: {e}"))?;
    Ok(n)
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else if ty.is_file() {
            std::fs::copy(entry.path(), &dest)?;
        }
        // 跳过符号链接
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        skills_root()
    }

    #[test]
    fn loads_all_eleven_nature_skills() {
        let skills = load_skills(&root());
        // 11 个 nature-* skill
        assert_eq!(
            skills.len(),
            11,
            "应解析 11 个 nature-* skill,实际 {}",
            skills.len()
        );
        assert!(skills.iter().all(|s| s.id.starts_with("nature-")));
    }

    #[test]
    fn figure_is_axes_with_blocking_gate() {
        let skills = load_skills(&root());
        let fig = skills.iter().find(|s| s.id == "nature-figure").unwrap();
        assert_eq!(fig.form_capability, "axes");
        assert_eq!(fig.status, "stable");
        let backend = fig.axes.iter().find(|a| a.name == "backend").unwrap();
        assert!(backend.blocking_gate);
        assert!(!backend.multi);
        assert_eq!(backend.values, vec!["python", "r"]); // 保持声明顺序
                                                         // 描述应来自 SKILL.md frontmatter(含中文触发词)
        assert!(fig.description.contains("科研绘图") || fig.description.contains("figure"));
    }

    #[test]
    fn polishing_has_four_axes_section_multi() {
        let skills = load_skills(&root());
        let pol = skills.iter().find(|s| s.id == "nature-polishing").unwrap();
        assert_eq!(pol.axes.len(), 4);
        let section = pol.axes.iter().find(|a| a.name == "section").unwrap();
        assert!(section.multi);
        let paper_type = pol.axes.iter().find(|a| a.name == "paper_type").unwrap();
        assert_eq!(paper_type.default_value.as_deref(), Some("research"));
    }

    #[test]
    fn citation_is_manifest_no_axes() {
        let skills = load_skills(&root());
        let cit = skills.iter().find(|s| s.id == "nature-citation").unwrap();
        assert!(cit.has_manifest);
        assert_eq!(cit.form_capability, "manifestNoAxes");
        assert!(cit.axes.is_empty());
    }

    #[test]
    fn reviewer_is_prose_only() {
        let skills = load_skills(&root());
        let rev = skills.iter().find(|s| s.id == "nature-reviewer").unwrap();
        assert!(!rev.has_manifest);
        assert_eq!(rev.form_capability, "proseOnly");
        assert_eq!(rev.status, "draft");
    }
}
