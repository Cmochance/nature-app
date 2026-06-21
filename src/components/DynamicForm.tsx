import { useEffect, useMemo, useState } from "react";
import type { Axis, SkillDescriptor } from "../types/skill";
import { useI18n } from "../i18n";

// 首版 figure 只支持 Python,R 置灰(计划:R 留后期)。
function disabledHint(skillId: string, axisName: string, value: string, zh: boolean): string | null {
  if (skillId === "nature-figure" && axisName === "backend" && value === "r") {
    return zh ? "R 后端即将支持(首版仅 Python)" : "R backend coming soon (Python only for now)";
  }
  return null;
}

export interface DynamicFormResult {
  instruction: string;
  valid: boolean;
  userInput: string;
}

interface Props {
  skill: SkillDescriptor;
  files: string[];
  onChange: (r: DynamicFormResult) => void;
}

function initialSelections(skill: SkillDescriptor): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const ax of skill.axes) sel[ax.name] = ax.defaultValue ? [ax.defaultValue] : [];
  return sel;
}

export default function DynamicForm({ skill, files, onChange }: Props) {
  const { t, lang } = useI18n();
  const zh = lang === "zh";
  const [sel, setSel] = useState<Record<string, string[]>>(() => initialSelections(skill));
  const [userInput, setUserInput] = useState("");

  useEffect(() => {
    setSel(initialSelections(skill));
    setUserInput("");
  }, [skill.id]);

  const valid = useMemo(() => {
    for (const ax of skill.axes) {
      if (ax.blockingGate && (sel[ax.name]?.length ?? 0) === 0) return false;
    }
    return userInput.trim().length > 0;
  }, [skill, sel, userInput]);

  // 发给 Codex 的指令:脚手架随界面语言走,skill id / 文件路径等专名保持一致。
  const instruction = useMemo(() => {
    const lines: string[] = [
      zh ? `请使用技能「${skill.id}」完成以下任务。` : `Use the skill "${skill.id}" to complete the task below.`,
    ];
    for (const ax of skill.axes) {
      const v = sel[ax.name];
      if (v && v.length) lines.push(`- ${ax.name}: ${v.join(", ")}`);
    }
    lines.push("", zh ? "任务要求:" : "Task:", userInput.trim());
    if (files.length) {
      lines.push("", zh ? "可访问以下输入文件:" : "Input files available:");
      files.forEach((f) => lines.push(`- ${f}`));
    }
    return lines.join("\n");
  }, [skill, sel, userInput, files, zh]);

  useEffect(() => {
    onChange({ instruction, valid, userInput });
  }, [instruction, valid, userInput]);

  function toggle(ax: Axis, value: string) {
    setSel((prev) => {
      const cur = prev[ax.name] ?? [];
      if (ax.multi) {
        const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
        return { ...prev, [ax.name]: next };
      }
      return { ...prev, [ax.name]: [value] };
    });
  }

  return (
    <div className="dynform">
      {skill.formCapability === "axes" ? (
        skill.axes.map((ax) => (
          <div key={ax.name} className="cfg-row block">
            <div className="axis-label">
              {ax.name}
              {ax.blockingGate && <span className="req">{t("common.required")}</span>}
              {ax.multi && <span className="multi">{zh ? "可多选" : "multi"}</span>}
            </div>
            <div className="chips">
              {ax.values.map((v) => {
                const dis = disabledHint(skill.id, ax.name, v, zh);
                const on = (sel[ax.name] ?? []).includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    className={"chip" + (on ? " on" : "") + (dis ? " disabled" : "")}
                    title={dis ?? ""}
                    disabled={!!dis}
                    onClick={() => !dis && toggle(ax, v)}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="fallback-note">{t("task.fallbackNote")}</div>
      )}

      <div className="composer">
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          rows={4}
          placeholder={t("task.descPh")}
        />
      </div>
    </div>
  );
}
