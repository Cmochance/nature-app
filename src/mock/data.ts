import type { SkillDescriptor } from "../types/skill";
import type { EngineStatus, DoctorReport } from "../types/engine";

// ── Mock 数据:纯浏览器预览时使用,不连接 Tauri 后端 ──

export const MOCK_SKILLS: SkillDescriptor[] = [
  {
    id: "nature-figure",
    name: "nature-figure",
    description:
      "投稿级 Nature/高影响力期刊配图工作流,支持 matplotlib/seaborn 与 ggplot2,输出期刊级 SVG/PDF/TIFF。从论文配图到多面板组合、出版级排版一站式完成。",
    status: "stable",
    version: "2.0.0",
    formCapability: "axes",
    hasManifest: true,
    alwaysLoad: ["static/core/contract.md", "static/core/stance.md"],
    axes: [
      {
        name: "backend",
        values: ["python", "r"],
        multi: false,
        blockingGate: true,
        defaultValue: "python",
      },
    ],
    onDemand: [
      { condition: "matplotlib/seaborn 绘图", path: "references/python-recipes.md" },
      { condition: "ggplot2 绘图", path: "references/r-recipes.md" },
    ],
    dir: "/mock/skills-bundled/nature-figure",
  },
  {
    id: "nature-polishing",
    name: "nature-polishing",
    description:
      "将学术散文润色、重组或翻译为 Nature 风格英语,覆盖摘要、引言、结果、讨论等全部章节,含 LaTeX 排版修复。",
    status: "stable",
    version: "6.1.0",
    formCapability: "axes",
    hasManifest: true,
    alwaysLoad: ["static/core/principles.md"],
    axes: [
      {
        name: "paper_type",
        values: ["full", "abstract", "results", "discussion", "intro", "method"],
        multi: false,
        blockingGate: false,
        defaultValue: null,
      },
    ],
    onDemand: [],
    dir: "/mock/skills-bundled/nature-polishing",
  },
  {
    id: "nature-writing",
    name: "nature-writing",
    description:
      "起草、重构或规划 Nature 风格的稿件章节,从作者提供的 claim、结果、笔记或中文草稿出发搭建论文骨架与论证。",
    status: "stable",
    version: "1.0.0",
    formCapability: "axes",
    hasManifest: true,
    alwaysLoad: ["static/core/argument.md"],
    axes: [
      {
        name: "paper_type",
        values: ["abstract", "intro", "related-work", "method", "experiments", "discussion", "conclusion", "title"],
        multi: false,
        blockingGate: false,
        defaultValue: null,
      },
    ],
    onDemand: [],
    dir: "/mock/skills-bundled/nature-writing",
  },
  {
    id: "nature-reader",
    name: "nature-reader",
    description:
      "构建全文中英对照、图表感知、来源锚定的 Markdown 论文阅读器,支持 PDF/DOI/arXiv/HTML 多种输入。",
    status: "stable",
    version: "2.0.0",
    formCapability: "axes",
    hasManifest: true,
    alwaysLoad: ["static/core/reader.md"],
    axes: [
      {
        name: "source_format",
        values: ["pdf", "doi", "arxiv", "html", "text"],
        multi: false,
        blockingGate: true,
        defaultValue: "pdf",
      },
    ],
    onDemand: [],
    dir: "/mock/skills-bundled/nature-reader",
  },
  {
    id: "nature-paper2ppt",
    name: "nature-paper2ppt",
    description:
      "从科研论文构建完整高效的 Nature 风格中文 PPTX 演示文稿,适用于组会、文献汇报、学术答辩等场景。",
    status: "stable",
    version: "2.0.0",
    formCapability: "axes",
    hasManifest: true,
    alwaysLoad: ["static/core/pptx.md"],
    axes: [
      {
        name: "paper_type",
        values: ["medical", "general-science", "biology", "chemistry", "cs"],
        multi: false,
        blockingGate: false,
        defaultValue: null,
      },
    ],
    onDemand: [],
    dir: "/mock/skills-bundled/nature-paper2ppt",
  },
  {
    id: "nature-paper-to-patent",
    name: "nature-paper-to-patent",
    description:
      "将科研论文、学位论文或技术报告转化为有证据支撑的中国发明专利草案,包含权利要求书、说明书、摘要及配图。",
    status: "beta",
    version: "1.0.0",
    formCapability: "axes",
    hasManifest: true,
    alwaysLoad: ["static/core/patent.md"],
    axes: [
      {
        name: "source_format",
        values: ["paper", "thesis", "report", "code", "figures"],
        multi: false,
        blockingGate: false,
        defaultValue: "paper",
      },
    ],
    onDemand: [],
    dir: "/mock/skills-bundled/nature-paper-to-patent",
  },
  {
    id: "nature-academic-search",
    name: "nature-academic-search",
    description:
      "多源文献检索(PubMed/CrossRef/arXiv/Scopus)、引文核对、MeSH 检索策略与引文文件管理(.nbib/.ris/.bib 转换)。",
    status: "beta",
    version: "2.0.0",
    formCapability: "axes",
    hasManifest: true,
    alwaysLoad: ["static/core/search.md"],
    axes: [
      {
        name: "workflow",
        values: ["search", "verify", "manage", "convert"],
        multi: false,
        blockingGate: false,
        defaultValue: "search",
      },
    ],
    onDemand: [],
    dir: "/mock/skills-bundled/nature-academic-search",
  },
  {
    id: "nature-citation",
    name: "nature-citation",
    description:
      "为稿件正文添加严格的 Nature/CNS 系列引用:将长段落拆分为可引用片段,仅检索旗舰/子刊标题,导出文献管理器可用文件。",
    status: "stable",
    version: "2.0.0",
    formCapability: "manifestNoAxes",
    hasManifest: true,
    alwaysLoad: ["static/core/principles.md", "static/core/workflow.md"],
    axes: [],
    onDemand: [{ condition: "脚本用法与批处理策略", path: "references/script-usage.md" }],
    dir: "/mock/skills-bundled/nature-citation",
  },
  {
    id: "nature-data",
    name: "nature-data",
    description:
      "撰写、审核或修订 Nature 级别的数据可用性声明、数据仓库方案、数据集引用与 FAIR 元数据清单。",
    status: "stable",
    version: "2.0.0",
    formCapability: "manifestNoAxes",
    hasManifest: true,
    alwaysLoad: ["static/core/data-availability.md"],
    axes: [],
    onDemand: [],
    dir: "/mock/skills-bundled/nature-data",
  },
  {
    id: "nature-response",
    name: "nature-response",
    description:
      "起草、审核或修订逐点审稿回复信,覆盖大修/小修、rebuttal、点对点回复审稿意见等学术修回场景。",
    status: "beta",
    version: "1.0.0",
    formCapability: "manifestNoAxes",
    hasManifest: true,
    alwaysLoad: ["static/core/response.md"],
    axes: [],
    onDemand: [],
    dir: "/mock/skills-bundled/nature-response",
  },
];

export const MOCK_ENGINE: EngineStatus = {
  bin: "/usr/local/bin/codex",
  version: "codex 1.2.0 (mock)",
  loggedIn: true,
};

export const MOCK_DOCTOR: DoctorReport = {
  engine: MOCK_ENGINE,
  pyenv: {
    uv: "/Users/mock/.local/bin/uv",
    ready: true,
    venv: "/Users/mock/.codex/skills-venv",
    python: "/Users/mock/.codex/skills-venv/bin/python",
  },
  tools: [
    { name: "codex", ok: true, path: "/usr/local/bin/codex" },
    { name: "uv", ok: true, path: "/Users/mock/.local/bin/uv" },
    { name: "python3", ok: true, path: "/usr/bin/python3" },
    { name: "node", ok: true, path: "/usr/local/bin/node" },
  ],
};

export const MOCK_SETUP_STATUS = {
  skills: "ok",
  pyenv: "ok",
};

// 1x1 透明 PNG 的 data URI,用于 convertFileSrc 的占位图。
const PLACEHOLDER_PNG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#1a1a2e"/><text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="#555" text-anchor="middle" dominant-baseline="middle">[mock 产物预览]</text></svg>'
  );

export function mockPlaceholder(_path: string): string {
  return PLACEHOLDER_PNG;
}
