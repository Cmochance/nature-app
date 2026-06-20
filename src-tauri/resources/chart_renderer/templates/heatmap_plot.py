# -*- coding: utf-8 -*-
from __future__ import annotations

import base64
import io
import json
from pathlib import Path

import matplotlib

# Force headless backend. The parent process also sets MPLBACKEND=Agg.
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402


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


def main() -> int:
    base = Path(__file__).resolve().parent
    spec = json.loads((base / "plot_spec.json").read_text(encoding="utf-8"))
    data = json.loads((base / "plot_data.json").read_text(encoding="utf-8"))

    style = spec.get("style") or {}
    fig_size = style.get("figure_size") or [10, 6]
    dpi = int(style.get("dpi") or 150)
    font_family = style.get("font_family") or "serif"
    font_size = int(style.get("font_size") or 12)

    plt.rcParams["font.family"] = font_family
    plt.rcParams["font.size"] = font_size
    plt.rcParams["font.weight"] = "bold"
    plt.rcParams["axes.labelweight"] = "bold"
    plt.rcParams["axes.titleweight"] = "bold"
    plt.rcParams["svg.fonttype"] = "none"

    fmt = (spec.get("output_format") or "svg").lower()
    out_path = base / f"out.{fmt}"

    grid = (data.get("grid") or {}) if isinstance(data, dict) else {}
    mode = str(grid.get("mode") or "heatmap").strip().lower()

    fig, ax = plt.subplots(figsize=(float(fig_size[0]), float(fig_size[1])), dpi=dpi)

    png_b64 = grid.get("png_base64")
    if isinstance(png_b64, str) and png_b64.strip():
        try:
            from PIL import Image  # pillow is part of backend deps
        except Exception as exc:  # pragma: no cover
            raise RuntimeError(f"Pillow is required for image heatmap plotting: {exc}") from exc

        raw = base64.b64decode(png_b64.encode("utf-8"))
        img = Image.open(io.BytesIO(raw))
        ax.imshow(img)
        ax.axis("off")
    else:
        values = grid.get("values") or []
        cmap = grid.get("cmap") or "viridis"
        origin = grid.get("origin") or "lower"
        im = ax.imshow(values, cmap=cmap, origin=origin, interpolation="nearest", aspect="auto")

        x_label = _label_with_unit(spec.get("x_label") or "X", spec.get("x_unit") or "")
        y_label = _label_with_unit(spec.get("y_label") or "Y", spec.get("y_unit") or "")
        ax.set_xlabel(x_label)
        ax.set_ylabel(y_label)
        ax.xaxis.label.set_fontweight("bold")
        ax.yaxis.label.set_fontweight("bold")

        if mode == "heatmap":
            cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
            z_label = str(grid.get("z_label") or "").strip()
            if z_label:
                cbar.set_label(z_label)
                cbar.ax.yaxis.label.set_fontweight("bold")

    title = spec.get("title") or ""
    if title:
        ax.set_title(title, fontweight="bold")

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
