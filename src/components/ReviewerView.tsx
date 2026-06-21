import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "../i18n";

// 按 nature-reviewer 的 report-structure.md 段落契约切分(段名是报告结构的固有标识,保持原样)。
const SECTIONS = ["Review setup", "Reviewer 1", "Reviewer 2", "Reviewer 3", "Cross-review synthesis", "Risk"];

function matchSection(line: string): string | null {
  const t = line.replace(/^[#*\s>\-]+/, "").replace(/[*:#]+$/, "").trim().toLowerCase();
  for (const s of SECTIONS) if (t.startsWith(s.toLowerCase())) return s;
  return null;
}

function splitSections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => { if (current) out[current] = buf.join("\n").trim(); buf = []; };
  for (const line of md.split("\n")) {
    const m = matchSection(line);
    if (m) { flush(); current = m; continue; }
    if (current) buf.push(line);
  }
  flush();
  return out;
}

export default function ReviewerView({ md }: { md: string }) {
  const { lang } = useI18n();
  const empty = lang === "zh" ? "_(空)_" : "_(empty)_";
  const Md = ({ t }: { t?: string }) => (
    <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{t || empty}</ReactMarkdown></div>
  );

  const sec = splitSections(md);
  const hasReviewers = sec["Reviewer 1"] || sec["Reviewer 2"] || sec["Reviewer 3"];
  if (!hasReviewers) return <Md t={md} />;

  return (
    <div className="reviewer">
      {sec["Review setup"] && (
        <div className="rv-synthesis"><div className="col-head">Review setup</div><Md t={sec["Review setup"]} /></div>
      )}
      <div className="rv-cols">
        {["Reviewer 1", "Reviewer 2", "Reviewer 3"].map((r) => (
          <div key={r} className="rv-col"><div className="col-head">{r}</div><Md t={sec[r]} /></div>
        ))}
      </div>
      {sec["Cross-review synthesis"] && (
        <div className="rv-synthesis"><div className="col-head">Cross-review synthesis</div><Md t={sec["Cross-review synthesis"]} /></div>
      )}
      {sec["Risk"] && (
        <div className="rv-synthesis"><div className="col-head">Risk / unsupported claims</div><Md t={sec["Risk"]} /></div>
      )}
    </div>
  );
}
