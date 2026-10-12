"""
Read the Treasury's "Impact on households" decile chart from its PDF, for the `treasury:` block of
content/budget/household/<event>.yaml (docs/BUDGET_DAY.md, "The Budget for your household").

The Treasury publishes the chart without a table. Its PDF draws each bar as a filled rectangle and the
"Overall" marker as a small black square, so the figures can be read from the drawing itself: the PDF page is
turned into SVG with poppler's pdftocairo, the y axis is calibrated from its tick marks, and every bar and marker
is converted to axis units. Accurate to about 0.01 of a point (or a few pounds on the cash chart).

    python3 scripts/treasury_chart.py Impact_on_households.pdf 10 -2 9 12 --order 3,1,2           # Figure 1.A, %
    python3 scripts/treasury_chart.py Impact_on_households.pdf 11 -2500 2000 10 --order 3,1,2 --dp 0 # Figure 1.B, £

Arguments: the PDF, the page (1 = the file's first page), the lowest and highest labels on the y axis, and how
many tick marks the axis has (labels from lowest to highest, both included). It prints one line per colour (a
stacked series: match each colour to the chart's legend), then the "Overall" markers, then a YAML block in the
measures file's shape. Give --order: the numbers of the printed colour lines (1, 2, 3) that are tax, welfare and
public services, in that order, from the chart's legend. Needs pdftocairo (`brew install poppler`). Standard
library only.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

POINT = re.compile(r"([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)")
BLACK = "rgb(0%, 0%, 0%)"


def page_svg(pdf: Path, page: int) -> ET.Element:
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "page.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), str(out)], check=True)
        return ET.parse(out).getroot()


def drawn_paths(root: ET.Element) -> list[ET.Element]:
    """Paths drawn on the page (not glyph definitions or clip paths)."""
    out: list[ET.Element] = []

    def walk(el: ET.Element, inside: bool) -> None:
        tag = el.tag.split("}")[-1]
        inside = inside or tag in ("defs", "symbol", "clipPath", "mask")
        if tag == "path" and not inside:
            out.append(el)
        for child in el:
            walk(child, inside)

    walk(root, False)
    return out


def points(el: ET.Element) -> list[tuple[float, float]]:
    return [(float(x), float(y)) for _, x, y in POINT.findall(el.get("d", ""))]


def read(pdf: Path, page: int, low: float, high: float, ticks: int) -> dict:
    paths = drawn_paths(page_svg(pdf, page))
    axis = None
    for p in paths:
        ps = points(p)
        if p.get("fill") == "none" and len(ps) == 2 * ticks:
            ys = sorted({round(y, 2) for _, y in ps})
            if len(ys) == ticks and len({round(x, 2) for x, _ in ps}) == 2:
                axis = (ys[0], ys[-1])
                break
    if axis is None:
        sys.exit(f"no y axis with {ticks} tick marks on page {page}: check the page and the tick count")
    per_unit = (axis[1] - axis[0]) / (high - low)
    value = lambda y: low + (y - axis[0]) / per_unit  # noqa: E731
    series: dict[str, list[tuple[float, float, float]]] = {}
    overall: list[tuple[float, float]] = []
    for p in paths:
        fill = p.get("fill")
        ps = points(p)
        if not fill or fill == "none":
            continue
        xs = [x for x, _ in ps]
        ys = [y for _, y in ps]
        if fill == BLACK and len(ps) == 5 and max(xs) - min(xs) < 8 and min(ys) > axis[0] - 1:
            overall.append(((min(xs) + max(xs)) / 2, value((min(ys) + max(ys)) / 2)))
        elif len(ps) > 6:
            rects, i = [], 0
            while i + 3 < len(ps):
                r = ps[i : i + 4]
                rx = [x for x, _ in r]
                ry = [y for _, y in r]
                rects.append(((min(rx) + max(rx)) / 2, value(min(ry)), value(max(ry))))
                i += 4
                if i < len(ps) and ps[i] == r[0]:
                    i += 1
            series[fill] = sorted(rects)
    overall.sort()
    return {"axis": axis, "series": series, "overall": overall}


def bar_value(lo: float, hi: float, tol: float) -> float:
    """A stacked bar's own height: signed from the axis if it touches it, else the segment's length."""
    if abs(lo) < tol:
        return hi
    if abs(hi) < tol:
        return lo
    return hi - lo


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("page", type=int)
    ap.add_argument("low", type=float)
    ap.add_argument("high", type=float)
    ap.add_argument("ticks", type=int)
    ap.add_argument("--order", help="the printed colour lines (1-based) that are tax, welfare and services, e.g. 3,1,2")
    ap.add_argument("--dp", type=int, default=2, help="decimal places (2 for %, 0 for £)")
    a = ap.parse_args()
    r = read(a.pdf, a.page, a.low, a.high, a.ticks)
    fmt = lambda v: f"{v:.{a.dp}f}" if a.dp else f"{round(v)}"  # noqa: E731
    tol = (a.high - a.low) * 0.002  # a segment this close to zero starts at the axis
    print(f"y axis: {a.low} to {a.high} over {r['axis']}")
    printed = list(r["series"])
    for n, colour in enumerate(printed, 1):
        print(f"{n}. {colour}: {', '.join(fmt(bar_value(lo, hi, tol)) for _, lo, hi in r['series'][colour])}")
    print(f"overall markers: {', '.join(fmt(v) for _, v in r['overall'])}")
    if not a.order:
        sys.exit("\nnow give --order: the numbers of the lines above that are tax, welfare and public services (see the legend)")
    colours = [printed[int(n) - 1] for n in a.order.split(",")]
    if len(colours) != 3 or any(len(r["series"].get(c, [])) != 11 for c in colours) or len(r["overall"]) != 11:
        sys.exit("expected three stacked series and the Overall markers, 11 bars each (deciles 1 to 10 and all households): read the lines above")
    print("\n# deciles 1 to 10, then all households; tax + welfare + services should equal overall")
    rows = []
    for i in range(11):
        t, w, s = (bar_value(*r["series"][c][i][1:], tol) for c in colours)
        rows.append(f"{{ tax: {fmt(t)}, welfare: {fmt(w)}, services: {fmt(s)}, overall: {fmt(r['overall'][i][1])} }}")
        if abs(t + w + s - r["overall"][i][1]) > (0.02 if a.dp else 10):
            print(f"# warning: bar {i + 1} adds to {fmt(t + w + s)}, the marker reads {fmt(r['overall'][i][1])}")
    print("deciles:")
    for row in rows[:10]:
        print(f"  - {row}")
    print(f"all: {rows[10]}")


if __name__ == "__main__":
    main()
