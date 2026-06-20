# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path

import matplotlib

# Force headless backend. The parent process also sets MPLBACKEND=Agg.
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import matplotlib.ticker as mticker  # noqa: E402
import math  # noqa: E402


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


def _shorten_tick_label(value: object, *, max_chars: int = 12) -> str:
    text = str(value or "")
    max_chars = int(max(1, max_chars))
    if len(text) <= max_chars:
        return text
    if max_chars <= 3:
        return text[:max_chars]
    return text[: max_chars - 3] + "..."


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

    text_cfg = style.get("text") or {}
    title_text = text_cfg.get("title") if isinstance(text_cfg, dict) else {}
    axis_text = text_cfg.get("axis_label") if isinstance(text_cfg, dict) else {}

    legend_cfg = style.get("legend") or {}
    legend_enabled = bool(legend_cfg.get("enabled") if legend_cfg.get("enabled") is not None else True)
    legend_location = str(legend_cfg.get("location") or "best").strip() or "best"
    allowed_locs = {
        "best",
        "upper right",
        "upper left",
        "lower right",
        "lower left",
        "center right",
        "center left",
        "upper center",
        "lower center",
        "center",
    }
    if legend_location not in allowed_locs:
        legend_location = "best"

    ticks_cfg = style.get("ticks") or {}
    ticks_x = ticks_cfg.get("x") if isinstance(ticks_cfg, dict) else {}
    ticks_y = ticks_cfg.get("y") if isinstance(ticks_cfg, dict) else {}

    axis_range_cfg = style.get("axis_range") if isinstance(style, dict) else None

    spines_cfg = style.get("spines") or {}
    spines_enabled = bool(spines_cfg.get("enabled") if isinstance(spines_cfg, dict) and spines_cfg.get("enabled") is not None else True)
    spines_width = None
    spines_color = None
    if isinstance(spines_cfg, dict):
        if spines_cfg.get("width") is not None:
            try:
                spines_width = float(spines_cfg.get("width"))
            except Exception:
                spines_width = None
        if spines_cfg.get("color") is not None:
            spines_color = str(spines_cfg.get("color") or "").strip() or None

    plt.rcParams["font.family"] = font_family
    plt.rcParams["font.size"] = font_size
    plt.rcParams["font.weight"] = "bold"
    plt.rcParams["axes.labelweight"] = "bold"
    plt.rcParams["axes.titleweight"] = "bold"
    plt.rcParams["svg.fonttype"] = "none"

    fmt = (spec.get("output_format") or "svg").lower()
    out_path = base / f"out.{fmt}"

    fig, ax = plt.subplots(figsize=(float(fig_size[0]), float(fig_size[1])), dpi=dpi)

    series_list = (data.get("series") or [])
    if not series_list:
        raise RuntimeError("plot_data.series is empty")

    series_list = [s for s in series_list if s.get("visible") is not False]
    if not series_list:
        raise RuntimeError("no visible series to plot")

    # Single-series (default) or grouped bar (multi-series).
    all_categories = list(series_list[0].get("x") or [])
    if not all_categories:
        raise RuntimeError("bar categories is empty")

    category_filter = style.get("category_filter") if isinstance(style, dict) else None
    category_filter_enabled = bool(category_filter.get("enabled")) if isinstance(category_filter, dict) else False
    include_raw = category_filter.get("include") if isinstance(category_filter, dict) else None
    include_list = [str(v or "").strip() for v in include_raw] if isinstance(include_raw, list) else []
    include_set = {v for v in include_list if v}
    keep_indices: list[int] = list(range(len(all_categories)))
    if category_filter_enabled and include_set:
        keep_indices = [idx for idx, c in enumerate(all_categories) if str(c or "").strip() in include_set]
        if not keep_indices:
            raise RuntimeError("category filter removed all categories")
    categories = [all_categories[idx] for idx in keep_indices]

    categories_display = [_shorten_tick_label(v, max_chars=12) for v in categories]
    value_scale_mode_raw = str(style.get("value_scale_mode") or "absolute").strip().lower()
    value_scale_mode = "percentage" if value_scale_mode_raw == "percentage" else "absolute"
    value_scale_scope_raw = str(style.get("value_scale_scope") or "global").strip().lower()
    value_scale_scope = "per_category" if value_scale_scope_raw == "per_category" else "global"

    n_series = len(series_list)
    if n_series == 1:
        values = series_list[0].get("y") or []
        if len(values) != len(all_categories):
            raise RuntimeError("x/y length mismatch")
        values = [float(values[idx]) for idx in keep_indices]
        if len(categories) != len(values):
            raise RuntimeError("x/y length mismatch")
        if value_scale_mode == "percentage" and values:
            max_val = max(values)
            if math.isfinite(max_val) and max_val != 0:
                values = [v / max_val for v in values]
        color = series_list[0].get("color") or "#1a1a1a"
        base_x = np.arange(len(categories), dtype=float)
        ax.bar(base_x, values, color=color)
        ax.set_xticks(base_x)
        ax.set_xticklabels(categories_display)
    else:
        base_x = np.arange(len(categories), dtype=float)
        bar_width = 0.8 / float(n_series)
        grouped_values = []
        for idx, series in enumerate(series_list):
            sx = series.get("x") or []
            sy = series.get("y") or []
            if list(sx) != list(all_categories):
                raise RuntimeError("grouped bar requires aligned categories across series")
            if len(sy) != len(all_categories):
                raise RuntimeError("x/y length mismatch")
            sy = [float(sy[i]) for i in keep_indices]
            if len(sy) != len(categories):
                raise RuntimeError("x/y length mismatch")
            color = series.get("color") or "#1a1a1a"
            name = str(series.get("name") or f"series_{idx + 1}")
            offset = (float(idx) - (float(n_series) - 1.0) / 2.0) * bar_width
            grouped_values.append((sy, color, name, offset))

        if value_scale_mode == "percentage":
            if value_scale_scope == "per_category" and grouped_values:
                category_max: list[float | None] = []
                for cat_idx in range(len(categories)):
                    col_vals = [item[0][cat_idx] for item in grouped_values]
                    col_max = max(col_vals) if col_vals else 0.0
                    if math.isfinite(col_max) and col_max != 0:
                        category_max.append(col_max)
                    else:
                        category_max.append(None)
                grouped_values = [
                    (
                        [
                            (v / category_max[idx]) if category_max[idx] is not None else v
                            for idx, v in enumerate(sy)
                        ],
                        color,
                        name,
                        offset,
                    )
                    for sy, color, name, offset in grouped_values
                ]
            else:
                all_values = [v for item in grouped_values for v in item[0]]
                if all_values:
                    max_val = max(all_values)
                    if math.isfinite(max_val) and max_val != 0:
                        grouped_values = [
                            ([v / max_val for v in sy], color, name, offset)
                            for sy, color, name, offset in grouped_values
                        ]

        for sy, color, name, offset in grouped_values:
            ax.bar(base_x + offset, sy, width=bar_width, color=color, label=name)

        ax.set_xticks(base_x)
        ax.set_xticklabels(categories_display)
        if legend_enabled:
            legend = ax.legend(loc=legend_location, fontsize=max(8, font_size - 2))
            for text in legend.get_texts():
                text.set_fontweight("bold")

    # Apply spines style.
    for spine in ax.spines.values():
        spine.set_visible(bool(spines_enabled))
        if spines_enabled:
            if spines_width is not None:
                spine.set_linewidth(float(spines_width))
            if spines_color:
                spine.set_color(str(spines_color))

    # Tick label styling (font size / rotation / numeric formatting).
    try:
        x_font_size = int(ticks_x.get("font_size")) if isinstance(ticks_x, dict) and ticks_x.get("font_size") is not None else None
    except Exception:
        x_font_size = None
    try:
        y_font_size = int(ticks_y.get("font_size")) if isinstance(ticks_y, dict) and ticks_y.get("font_size") is not None else None
    except Exception:
        y_font_size = None
    try:
        x_top_font_size = int(ticks_x.get("top_font_size")) if isinstance(ticks_x, dict) and ticks_x.get("top_font_size") is not None else None
    except Exception:
        x_top_font_size = None
    try:
        y_right_font_size = int(ticks_y.get("right_font_size")) if isinstance(ticks_y, dict) and ticks_y.get("right_font_size") is not None else None
    except Exception:
        y_right_font_size = None
    if x_font_size is not None:
        ax.tick_params(axis="x", labelsize=max(1, x_font_size))
    if y_font_size is not None:
        ax.tick_params(axis="y", labelsize=max(1, y_font_size))

    x_show_labels = bool(ticks_x.get("show_labels") if isinstance(ticks_x, dict) and ticks_x.get("show_labels") is not None else True)
    x_show_ticks = bool(ticks_x.get("show_ticks") if isinstance(ticks_x, dict) and ticks_x.get("show_ticks") is not None else True)
    y_show_labels = bool(ticks_y.get("show_labels") if isinstance(ticks_y, dict) and ticks_y.get("show_labels") is not None else True)
    y_show_ticks = bool(ticks_y.get("show_ticks") if isinstance(ticks_y, dict) and ticks_y.get("show_ticks") is not None else True)
    x_show_labels_bottom = bool(ticks_x.get("show_labels_bottom") if isinstance(ticks_x, dict) and ticks_x.get("show_labels_bottom") is not None else x_show_labels)
    x_show_labels_top = bool(ticks_x.get("show_labels_top") if isinstance(ticks_x, dict) and ticks_x.get("show_labels_top") is not None else False)
    x_show_ticks_bottom = bool(ticks_x.get("show_ticks_bottom") if isinstance(ticks_x, dict) and ticks_x.get("show_ticks_bottom") is not None else x_show_ticks)
    x_show_ticks_top = bool(ticks_x.get("show_ticks_top") if isinstance(ticks_x, dict) and ticks_x.get("show_ticks_top") is not None else False)
    y_show_labels_left = bool(ticks_y.get("show_labels_left") if isinstance(ticks_y, dict) and ticks_y.get("show_labels_left") is not None else y_show_labels)
    y_show_labels_right = bool(ticks_y.get("show_labels_right") if isinstance(ticks_y, dict) and ticks_y.get("show_labels_right") is not None else False)
    y_show_ticks_left = bool(ticks_y.get("show_ticks_left") if isinstance(ticks_y, dict) and ticks_y.get("show_ticks_left") is not None else y_show_ticks)
    y_show_ticks_right = bool(ticks_y.get("show_ticks_right") if isinstance(ticks_y, dict) and ticks_y.get("show_ticks_right") is not None else False)
    ax.tick_params(
        axis="x",
        labelbottom=x_show_labels_bottom,
        labeltop=x_show_labels_top,
        bottom=x_show_ticks_bottom,
        top=x_show_ticks_top,
    )
    ax.tick_params(
        axis="y",
        labelleft=y_show_labels_left,
        labelright=y_show_labels_right,
        left=y_show_ticks_left,
        right=y_show_ticks_right,
    )

    x_tick_font_family = str(ticks_x.get("font_family") or "").strip() if isinstance(ticks_x, dict) else ""
    y_tick_font_family = str(ticks_y.get("font_family") or "").strip() if isinstance(ticks_y, dict) else ""
    x_top_tick_font_family = str(ticks_x.get("top_font_family") or x_tick_font_family).strip() if isinstance(ticks_x, dict) else ""
    y_right_tick_font_family = str(ticks_y.get("right_font_family") or y_tick_font_family).strip() if isinstance(ticks_y, dict) else ""
    if x_tick_font_family.lower() in {"", "auto", "inherit"}:
        x_tick_font_family = ""
    if y_tick_font_family.lower() in {"", "auto", "inherit"}:
        y_tick_font_family = ""
    if x_top_tick_font_family.lower() in {"", "auto", "inherit"}:
        x_top_tick_font_family = ""
    if y_right_tick_font_family.lower() in {"", "auto", "inherit"}:
        y_right_tick_font_family = ""

    x_label_color = str(ticks_x.get("label_color") or "").strip() if isinstance(ticks_x, dict) else ""
    y_label_color = str(ticks_y.get("label_color") or "").strip() if isinstance(ticks_y, dict) else ""
    x_top_label_color = str(ticks_x.get("top_label_color") or x_label_color).strip() if isinstance(ticks_x, dict) else ""
    y_right_label_color = str(ticks_y.get("right_label_color") or y_label_color).strip() if isinstance(ticks_y, dict) else ""

    x_tick_color = str(ticks_x.get("tick_color") or "").strip() if isinstance(ticks_x, dict) else ""
    y_tick_color = str(ticks_y.get("tick_color") or "").strip() if isinstance(ticks_y, dict) else ""
    x_tick_width = None
    y_tick_width = None
    x_tick_length = None
    y_tick_length = None
    if isinstance(ticks_x, dict) and ticks_x.get("tick_width") is not None:
        try:
            x_tick_width = float(ticks_x.get("tick_width"))
        except Exception:
            x_tick_width = None
    if isinstance(ticks_y, dict) and ticks_y.get("tick_width") is not None:
        try:
            y_tick_width = float(ticks_y.get("tick_width"))
        except Exception:
            y_tick_width = None
    if isinstance(ticks_x, dict) and ticks_x.get("tick_length") is not None:
        try:
            x_tick_length = float(ticks_x.get("tick_length"))
        except Exception:
            x_tick_length = None
    if isinstance(ticks_y, dict) and ticks_y.get("tick_length") is not None:
        try:
            y_tick_length = float(ticks_y.get("tick_length"))
        except Exception:
            y_tick_length = None
    if x_tick_color or x_tick_width is not None or x_tick_length is not None:
        kwargs = {}
        if x_tick_color:
            kwargs["color"] = x_tick_color
        if x_tick_width is not None:
            kwargs["width"] = max(0.1, float(x_tick_width))
        if x_tick_length is not None:
            kwargs["length"] = max(0.0, float(x_tick_length))
        ax.tick_params(axis="x", **kwargs)
    if y_tick_color or y_tick_width is not None or y_tick_length is not None:
        kwargs = {}
        if y_tick_color:
            kwargs["color"] = y_tick_color
        if y_tick_width is not None:
            kwargs["width"] = max(0.1, float(y_tick_width))
        if y_tick_length is not None:
            kwargs["length"] = max(0.0, float(y_tick_length))
        ax.tick_params(axis="y", **kwargs)

    x_rotation = None
    if isinstance(ticks_x, dict) and ticks_x.get("rotation") is not None:
        try:
            x_rotation = float(ticks_x.get("rotation"))
        except Exception:
            x_rotation = None
    if x_rotation is not None:
        for tick in ax.get_xticklabels():
            tick.set_rotation(x_rotation)
            tick.set_ha("right" if x_rotation and abs(x_rotation) >= 15 else "center")

    if isinstance(ticks_y, dict):
        y_fmt = str(ticks_y.get("format") or "auto").strip().lower()
        if y_fmt in {"plain", "scientific"}:
            formatter = mticker.ScalarFormatter(useMathText=False)
            if y_fmt == "scientific":
                formatter.set_scientific(True)
                formatter.set_powerlimits((-3, 3))
            else:
                formatter.set_scientific(False)
            ax.yaxis.set_major_formatter(formatter)

    if len(categories) > 12:
        for tick in ax.get_xticklabels():
            tick.set_rotation(45)
            tick.set_ha("right")

    for tick in ax.xaxis.get_major_ticks():
        if x_font_size is not None:
            tick.label1.set_fontsize(max(1, x_font_size))
        if x_top_font_size is not None:
            tick.label2.set_fontsize(max(1, x_top_font_size))
        if x_tick_font_family:
            tick.label1.set_fontfamily(x_tick_font_family)
        if x_top_tick_font_family:
            tick.label2.set_fontfamily(x_top_tick_font_family)
        if x_label_color:
            tick.label1.set_color(x_label_color)
        if x_top_label_color:
            tick.label2.set_color(x_top_label_color)
    for tick in ax.yaxis.get_major_ticks():
        if y_font_size is not None:
            tick.label1.set_fontsize(max(1, y_font_size))
        if y_right_font_size is not None:
            tick.label2.set_fontsize(max(1, y_right_font_size))
        if y_tick_font_family:
            tick.label1.set_fontfamily(y_tick_font_family)
        if y_right_tick_font_family:
            tick.label2.set_fontfamily(y_right_tick_font_family)
        if y_label_color:
            tick.label1.set_color(y_label_color)
        if y_right_label_color:
            tick.label2.set_color(y_right_label_color)

    # Axis ranges (optional): only y-axis makes sense for category bars.
    if isinstance(axis_range_cfg, dict):
        ry = axis_range_cfg.get("y") if isinstance(axis_range_cfg.get("y"), dict) else {}
        try:
            y_min = float(ry.get("min")) if ry.get("min") is not None else None
        except Exception:
            y_min = None
        try:
            y_max = float(ry.get("max")) if ry.get("max") is not None else None
        except Exception:
            y_max = None
        if y_min is not None and not math.isfinite(y_min):
            y_min = None
        if y_max is not None and not math.isfinite(y_max):
            y_max = None
        if y_min is not None or y_max is not None:
            ax.set_ylim(bottom=y_min, top=y_max)

    axis_font_family = str(axis_text.get("font_family") or "").strip() if isinstance(axis_text, dict) else ""
    if axis_font_family.lower() in {"", "auto", "inherit"}:
        axis_font_family = ""
    axis_font_size = None
    axis_color = None
    if isinstance(axis_text, dict) and axis_text.get("font_size") is not None:
        try:
            axis_font_size = int(axis_text.get("font_size"))
        except Exception:
            axis_font_size = None
    if isinstance(axis_text, dict) and axis_text.get("color") is not None:
        axis_color = str(axis_text.get("color") or "").strip() or None

    axis_kwargs = {"fontweight": "bold"}
    if axis_font_family:
        axis_kwargs["fontfamily"] = axis_font_family
    if axis_font_size is not None:
        axis_kwargs["fontsize"] = max(1, axis_font_size)
    if axis_color:
        axis_kwargs["color"] = axis_color

    ax.set_xlabel(_label_with_unit(spec.get("x_label") or "Category", spec.get("x_unit") or ""), **axis_kwargs)
    ax.set_ylabel(_label_with_unit(spec.get("y_label") or "Value", spec.get("y_unit") or ""), **axis_kwargs)

    title = spec.get("title") or ""
    if title:
        title_font_family = str(title_text.get("font_family") or "").strip() if isinstance(title_text, dict) else ""
        if title_font_family.lower() in {"", "auto", "inherit"}:
            title_font_family = ""
        title_font_size = None
        title_color = None
        if isinstance(title_text, dict) and title_text.get("font_size") is not None:
            try:
                title_font_size = int(title_text.get("font_size"))
            except Exception:
                title_font_size = None
        if isinstance(title_text, dict) and title_text.get("color") is not None:
            title_color = str(title_text.get("color") or "").strip() or None

        title_kwargs = {"fontweight": "bold"}
        if title_font_family:
            title_kwargs["fontfamily"] = title_font_family
        if title_font_size is not None:
            title_kwargs["fontsize"] = max(1, title_font_size)
        if title_color:
            title_kwargs["color"] = title_color
        ax.set_title(title, **title_kwargs)

    if grid:
        ax.grid(True, axis="y", alpha=grid_alpha)

    for tick in list(ax.get_xticklabels()) + list(ax.get_yticklabels()):
        tick.set_fontweight("bold")

    fig.tight_layout()
    fig.savefig(out_path, format=fmt, bbox_inches="tight", facecolor="white")
    if bool(spec.get("analysis_png_output")) and fmt != "png":
        fig.savefig(base / "out.png", format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
