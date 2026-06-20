# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime

import matplotlib

# Force headless backend. The parent process also sets MPLBACKEND=Agg.
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.dates as mdates  # noqa: E402


def _label_with_unit(label: str, unit: str) -> str:
    label = (label or "").strip()
    unit = (unit or "").strip()
    if not unit:
        return label
    if unit.startswith("(") and unit.endswith(")"):
        return f"{label} {unit}".strip()
    if not label:
        return unit
    return f"{label} ({unit})"


def _merge_legend(ax_left, ax_right):
    # Deterministic merge order: left-axis series first, then right-axis series.
    handles_left, labels_left = ax_left.get_legend_handles_labels()
    handles_right, labels_right = ax_right.get_legend_handles_labels()
    handles = list(handles_left) + list(handles_right)
    labels = list(labels_left) + list(labels_right)
    if not handles:
        return None
    return handles, labels


def main() -> int:
    base = Path(__file__).resolve().parent
    spec = json.loads((base / "plot_spec.json").read_text(encoding="utf-8"))
    data = json.loads((base / "plot_data.json").read_text(encoding="utf-8"))

    style = spec.get("style") or {}
    fig_size = style.get("figure_size") or [10, 6]
    dpi = int(style.get("dpi") or 150)
    font_family = style.get("font_family") or "serif"
    font_size = int(style.get("font_size") or 12)
    grid = bool(style.get("grid") if style.get("grid") is not None else True)
    grid_alpha = float(style.get("grid_alpha") or 0.3)

    plt.rcParams["font.family"] = font_family
    plt.rcParams["font.size"] = font_size
    plt.rcParams["font.weight"] = "bold"
    plt.rcParams["axes.labelweight"] = "bold"
    plt.rcParams["axes.titleweight"] = "bold"
    plt.rcParams["svg.fonttype"] = "none"

    fmt = (spec.get("output_format") or "svg").lower()
    out_path = base / f"out.{fmt}"

    fig, ax = plt.subplots(figsize=(float(fig_size[0]), float(fig_size[1])), dpi=dpi)
    ax2 = ax.twinx()

    scales = spec.get("scales") or {}
    x_scale = (scales.get("x") or "linear").lower()
    series_axis = scales.get("series_axis") or {}
    y2_label = scales.get("y2_label") or "Y2"
    y2_unit = scales.get("y2_unit") or ""

    series_list = data.get("series") or []
    if not series_list:
        raise RuntimeError("plot_data.series is empty")

    datetime_plotted = False
    for idx, series in enumerate(series_list):
        x = series.get("x") or []
        if series.get("visible") is False:
            continue
        y = series.get("y") or []
        name = str(series.get("name") or f"series_{idx + 1}")
        axis = str(series_axis.get(name) or "y").lower()
        color = series.get("color") or "#1a1a1a"
        lw = float(series.get("line_width") or style.get("line_width") or 1.5)

        if x_scale == "datetime":
            parsed: list[datetime] = []
            ok = True
            for v in x:
                if not isinstance(v, str) or not v:
                    ok = False
                    break
                try:
                    parsed.append(datetime.fromisoformat(v))
                except Exception:
                    ok = False
                    break
            if ok:
                x = parsed
                datetime_plotted = True

        target_ax = ax2 if axis in {"y2", "right"} else ax
        target_ax.plot(x, y, linewidth=lw, color=color, label=name)

    if datetime_plotted:
        locator = mdates.AutoDateLocator()
        ax.xaxis.set_major_locator(locator)
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
        fig.autofmt_xdate()

    # Labels and title.
    ax.set_xlabel(_label_with_unit(spec.get("x_label") or "X", spec.get("x_unit") or ""))
    ax.set_ylabel(_label_with_unit(spec.get("y_label") or "Y", spec.get("y_unit") or ""))
    ax2.set_ylabel(_label_with_unit(str(y2_label), str(y2_unit)))
    ax.xaxis.label.set_fontweight("bold")
    ax.yaxis.label.set_fontweight("bold")
    ax2.yaxis.label.set_fontweight("bold")

    title = spec.get("title") or ""
    if title:
        ax.set_title(title, fontweight="bold")

    if grid:
        ax.grid(True, alpha=grid_alpha)

    merged = _merge_legend(ax, ax2)
    if merged is not None:
        handles, labels = merged
        if len(handles) > 1:
            legend = ax.legend(handles, labels, loc="best", fontsize=max(8, font_size - 2))
            for text in legend.get_texts():
                text.set_fontweight("bold")

    for tick in list(ax.get_xticklabels()) + list(ax.get_yticklabels()):
        tick.set_fontweight("bold")
    for tick in list(ax2.get_yticklabels()):
        tick.set_fontweight("bold")

    fig.tight_layout()
    fig.savefig(out_path, format=fmt, bbox_inches="tight", facecolor="white")
    if bool(spec.get("analysis_png_output")) and fmt != "png":
        fig.savefig(base / "out.png", format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
