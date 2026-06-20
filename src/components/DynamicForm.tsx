import { useEffect, useMemo, useState } from "react";
import type { Axis, SkillDescriptor } from "../types/skill";

// 首版 figure 只支持 Python,R 置灰(计划:R 留后期)。
function disabledValue(skillId: string, axisName: string, value: string): string | null {
  if (skillId === "nature-figure" && axisName === "backend" && value === "r") {
    return "R 后端即将支持(首版仅 Python)";
  }
  return null;
}

export interface DynamicFormResult {
  instruction: string;
  valid: boolean;
}

interface Props {
  skill: SkillDescriptor;
  files: string[];
  onChange: (r: DynamicFormResult) => void;
}

function initialSelections(skill: SkillDescriptor): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const ax of skill.axes) {
    sel[ax.name] = ax.defaultValue ? [ax.defaultValue] : [];
  }
  return sel;
}

export default function DynamicForm({ skill, files, onChange }: Props) {
  const [sel, setSel] = useState<Record<string, string[]>>(() => initialSelections(skill));
  const [userInput, setUserInput] = useState("");

  // 切换 skill 时重置
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

  const instruction = useMemo(() => {
    const lines: string[] = [`请使用技能「${skill.id}」完成以下任务。`];
    for (const ax of skill.axes) {
      const v = sel[ax.name];
      if (v && v.length) lines.push(`- ${ax.name}: ${v.join(", ")}`);
    }
    lines.push("", "任务要求:", userInput.trim());
    if (files.length) {
      lines.push("", "可访问以下输入文件:");
      files.forEach((f) => lines.push(`- ${f}`));
    }
    return lines.join("\n");
  }, [skill, sel, userInput, files]);

  useEffect(() => {
    onChange({ instruction, valid });
  }, [instruction, valid]);

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
          <div key={ax.name} className="axis">
            <div className="axis-label">
              {ax.name}
              {ax.blockingGate && <span className="req">*必选</span>}
              {ax.multi && <span className="multi">可多选</span>}
            </div>
            <div className="chips">
              {ax.values.map((v) => {
                const dis = disabledValue(skill.id, ax.name, v);
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
        <div className="fallback-note">
          {skill.formCapability === "manifestNoAxes"
            ? "该 skill 无结构化选项,变体由运行时规则处理 —— 直接描述任务即可。"
            : "该 skill 为自由格式 —— 在下方描述任务并按需上传文件。"}
        </div>
      )}

      <div className="axis">
        <div className="axis-label">任务描述 / 内容<span className="req">*</span></div>
        <textarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          rows={5}
          placeholder="描述你要这个 skill 做什么;需要处理的文本可直接粘贴,或在上方选择输入文件。"
        />
      </div>
    </div>
  );
}
