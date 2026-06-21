import type { Lang } from "./i18n";

// skill 展示元数据:manifest 的 description 是给 SKILL.md 用的技术说明,不适合做 UI 文案。
// 这里按 skill id 维护面向用户的中/英名称与一句话描述,以及图标键和研究流程分组。
// 未登记的 skill 回退到 descriptor 自带的 name/description。

export type SkillGroup = "searchRead" | "writePolish" | "figData" | "reviewResp" | "convert";

export interface SkillMeta {
  zh: string;
  en: string;
  descZh: string;
  descEn: string;
  icon: string; // 见 src/icons.tsx 的 key
  group: SkillGroup;
}

export const SKILL_META: Record<string, SkillMeta> = {
  "nature-academic-search": {
    zh: "检索", en: "Search",
    descZh: "按需求检索文献,五种工作流协同,可挂学术 MCP。",
    descEn: "Search literature across five coordinated workflows; supports academic MCP.",
    icon: "search", group: "searchRead",
  },
  "nature-reader": {
    zh: "阅读", en: "Read",
    descZh: "解析 PDF / 网页,双语对照精读,图表随文。",
    descEn: "Parse PDF / web pages into a bilingual close reading with inline figures.",
    icon: "book", group: "searchRead",
  },
  "nature-writing": {
    zh: "写作", en: "Write",
    descZh: "起草与重构稿件,按章节脉络组织论证。",
    descEn: "Draft and restructure manuscripts along a sectioned argument.",
    icon: "pen", group: "writePolish",
  },
  "nature-polishing": {
    zh: "润色", en: "Polish",
    descZh: "母语级润色,原稿 / 改后逐句对照。",
    descEn: "Native-level polishing with sentence-by-sentence diff.",
    icon: "wand", group: "writePolish",
  },
  "nature-citation": {
    zh: "引用", en: "Cite",
    descZh: "解析与规范引用,一键导出到 Zotero。",
    descEn: "Parse and normalize citations; export to Zotero in one click.",
    icon: "quote", group: "writePolish",
  },
  "nature-figure": {
    zh: "绘图", en: "Figure",
    descZh: "matplotlib / R 出版级图表,支持「再改一版」。",
    descEn: "Publication-grade figures in matplotlib / R, with one-click iterate.",
    icon: "chart", group: "figData",
  },
  "nature-data": {
    zh: "数据", en: "Data",
    descZh: "生成数据可用性声明,梳理数据集清单。",
    descEn: "Generate data-availability statements and dataset inventories.",
    icon: "database", group: "figData",
  },
  "nature-reviewer": {
    zh: "审稿", en: "Review",
    descZh: "Nature 风格审稿人视角,三份报告 + 综述。",
    descEn: "Nature-style reviewer perspective — three reports plus a synthesis.",
    icon: "checklist", group: "reviewResp",
  },
  "nature-response": {
    zh: "回复", en: "Response",
    descZh: "逐条回复审稿意见,生成对照回复表。",
    descEn: "Point-by-point responses to reviewer comments.",
    icon: "reply", group: "reviewResp",
  },
  "nature-paper2ppt": {
    zh: "PPT", en: "Slides",
    descZh: "论文转演示文稿,按论文类型选叙事弧。",
    descEn: "Turn papers into slide decks with a fitting narrative arc.",
    icon: "slides", group: "convert",
  },
  "nature-paper-to-patent": {
    zh: "专利", en: "Patent",
    descZh: "研究披露转中文发明专利草案,证据锚定。",
    descEn: "Convert research disclosures into evidence-grounded patent drafts.",
    icon: "patent", group: "convert",
  },
};

export const GROUP_ORDER: SkillGroup[] = ["searchRead", "writePolish", "figData", "reviewResp", "convert"];

export function skillName(id: string, lang: Lang, fallback: string): string {
  const m = SKILL_META[id];
  return m ? m[lang] : fallback;
}

export function skillDesc(id: string, lang: Lang, fallback: string): string {
  const m = SKILL_META[id];
  if (!m) return fallback;
  return lang === "zh" ? m.descZh : m.descEn;
}

export function skillIcon(id: string): string {
  return SKILL_META[id]?.icon ?? "skill";
}

export function skillGroup(id: string): SkillGroup {
  return SKILL_META[id]?.group ?? "convert";
}
