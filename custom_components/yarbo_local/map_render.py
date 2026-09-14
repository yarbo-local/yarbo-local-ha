"""Render the site map as SVG in the robot's own metric frame.

Local points are metres with x west and y north. The drawing puts east to the
right and north up, so display X = -x and display Y = -y. Nothing here needs GPS:
the robot's odometry is in the same frame as the map.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from xml.sax.saxutils import escape

from yarbo_local import RobotState, SiteMap

WIDTH_PX = 800

# fill colour, fill opacity, stroke colour
_ZONE_STYLE = {
    "areas": ("#3b8fd9", 0.24, "#3b8fd9"),
    "nogozones": ("#e0524a", 0.28, "#e0524a"),
    "novisionzones": ("#9a6fd6", 0.22, "#9a6fd6"),
    "elec_fence": ("none", 0.0, "#e3a53b"),
}
_LINE_STYLE = {
    "pathways": "#e3a53b",
    "sidewalks": "#2bb3a3",
    "deadends": "#8a93a3",
}
_DOCK = "#2fae6e"
_ROBOT_FILL = "#f4f6f8"
_INK = "#1c2127"
_TEXT = "#eef2f6"
_GRID = "#8a93a3"


def _fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".") or "0"


def _nice_scale(span: float) -> float:
    target = span / 5
    for step in (1, 2, 5, 10, 20, 50, 100, 200, 500):
        if step >= target:
            return float(step)
    return 1000.0


@dataclass(frozen=True, slots=True)
class _Frame:
    """The drawing window in display coordinates (east right, north up)."""

    min_x: float
    min_y: float
    max_x: float
    max_y: float
    span: float
    pad: float

    @property
    def width(self) -> float:
        return self.max_x - self.min_x

    @property
    def height(self) -> float:
        return self.max_y - self.min_y

    @property
    def stroke(self) -> float:
        return max(0.08, self.span / 260)

    @property
    def font(self) -> float:
        return min(3.0, max(0.7, self.span / 30))


def _widen(lo: float, hi: float, minimum: float = 12.0) -> tuple[float, float]:
    if hi - lo >= minimum:
        return lo, hi
    mid = (lo + hi) / 2
    return mid - minimum / 2, mid + minimum / 2


def _frame(site: SiteMap | None, pose: tuple[float, float, float] | None) -> _Frame:
    xs: list[float] = []
    ys: list[float] = []
    bounds = site.bounds() if site is not None else None
    if bounds is not None:
        xs += [-bounds[2], -bounds[0]]
        ys += [-bounds[3], -bounds[1]]
    if pose is not None:
        xs.append(-pose[0])
        ys.append(-pose[1])
    if not xs:
        xs, ys = [-5.0, 5.0], [-5.0, 5.0]
    span = max(max(xs) - min(xs), max(ys) - min(ys), 10.0)
    pad = max(2.0, span * 0.08)
    min_x, max_x = _widen(min(xs) - pad, max(xs) + pad)
    min_y, max_y = _widen(min(ys) - pad, max(ys) + pad)
    return _Frame(min_x, min_y, max_x, max_y, span, pad)


def _grid(f: _Frame) -> list[str]:
    step = _nice_scale(f.span)
    out = [f'<g stroke="{_GRID}" stroke-opacity="0.18" stroke-width="{_fmt(f.stroke / 2)}">']
    gx = math.ceil(f.min_x / step) * step
    while gx < f.max_x:
        out.append(
            f'<line x1="{_fmt(gx)}" y1="{_fmt(f.min_y)}" x2="{_fmt(gx)}" y2="{_fmt(f.max_y)}"/>'
        )
        gx += step
    gy = math.ceil(f.min_y / step) * step
    while gy < f.max_y:
        out.append(
            f'<line x1="{_fmt(f.min_x)}" y1="{_fmt(gy)}" x2="{_fmt(f.max_x)}" y2="{_fmt(gy)}"/>'
        )
        gy += step
    out.append("</g>")
    return out


def _zones(site: SiteMap, f: _Frame) -> tuple[list[str], list[str]]:
    shapes: list[str] = []
    labels: list[str] = []
    for zone in site.zones:
        pts = " ".join(f"{_fmt(-p[0])},{_fmt(-p[1])}" for p in zone.points)
        opacity = "1" if zone.enabled else "0.45"
        if zone.closed and len(zone.points) >= 3:
            fill, fill_op, line = _ZONE_STYLE.get(zone.family, ("#8a93a3", 0.2, "#8a93a3"))
            shapes.append(
                f'<polygon points="{pts}" fill="{fill}" fill-opacity="{fill_op}" '
                f'stroke="{line}" stroke-width="{_fmt(f.stroke * 2)}" stroke-linejoin="round" '
                f'opacity="{opacity}"/>'
            )
            centre = zone.centroid
            if centre is not None and zone.name:
                labels.append(_label(-centre[0], -centre[1], zone.name, f.font))
        elif not zone.closed and len(zone.points) >= 2:
            line = _LINE_STYLE.get(zone.family, "#8a93a3")
            shapes.append(
                f'<polyline points="{pts}" fill="none" stroke="{line}" '
                f'stroke-width="{_fmt(f.stroke * 4)}" stroke-dasharray="{_fmt(f.stroke * 8)} '
                f'{_fmt(f.stroke * 5)}" stroke-linecap="round" stroke-linejoin="round" '
                f'opacity="{opacity}"/>'
            )
    return shapes, labels


def _docks(site: SiteMap, f: _Frame) -> list[str]:
    out: list[str] = []
    size = max(0.7, f.span / 45)
    for dock in site.charging:
        dx, dy = -dock.point[0], -dock.point[1]
        if dock.start_point is not None:
            out.append(
                f'<line x1="{_fmt(-dock.start_point[0])}" y1="{_fmt(-dock.start_point[1])}" '
                f'x2="{_fmt(dx)}" y2="{_fmt(dy)}" stroke="{_DOCK}" '
                f'stroke-width="{_fmt(f.stroke * 2)}" stroke-dasharray="{_fmt(f.stroke * 4)}"/>'
            )
        out.append(
            f'<rect x="{_fmt(dx - size / 2)}" y="{_fmt(dy - size / 2)}" width="{_fmt(size)}" '
            f'height="{_fmt(size)}" rx="{_fmt(size / 5)}" fill="{_DOCK}" stroke="{_INK}" '
            f'stroke-width="{_fmt(f.stroke)}"/>'
        )
    return out


def _robot(pose: tuple[float, float, float], f: _Frame) -> str:
    rx, ry, phi = -pose[0], -pose[1], pose[2]
    # phi runs from +x (west) toward +y (north); in display axes that direction is (-cos, -sin).
    angle = math.degrees(math.atan2(-math.sin(phi), -math.cos(phi)))
    r = max(0.45, f.span / 55)
    return (
        f'<g transform="translate({_fmt(rx)} {_fmt(ry)}) rotate({_fmt(angle)})">'
        f'<circle r="{_fmt(r)}" fill="{_ROBOT_FILL}" stroke="{_INK}" '
        f'stroke-width="{_fmt(f.stroke * 1.5)}"/>'
        f'<path d="M {_fmt(r * 2.1)} 0 L {_fmt(r * 1.05)} {_fmt(-r * 0.62)} '
        f'L {_fmt(r * 1.05)} {_fmt(r * 0.62)} Z" fill="{_INK}"/>'
        "</g>"
    )


def _furniture(f: _Frame, empty: bool) -> list[str]:
    bar = _nice_scale(f.span)
    if bar > f.width * 0.4:
        bar /= 2
    bx, by = f.min_x + f.pad * 0.5, f.max_y - f.pad * 0.45
    nx, ny = f.max_x - f.pad * 0.6, f.min_y + f.pad * 0.9
    out = [
        f'<line x1="{_fmt(bx)}" y1="{_fmt(by)}" x2="{_fmt(bx + bar)}" y2="{_fmt(by)}" '
        f'stroke="{_INK}" stroke-width="{_fmt(f.stroke * 1.5)}"/>',
        _label(bx + bar / 2, by - f.font * 0.45, f"{_fmt(bar)} m", f.font * 0.8),
        f'<path d="M {_fmt(nx)} {_fmt(ny - f.font * 1.1)} L {_fmt(nx - f.font * 0.45)} {_fmt(ny)} '
        f'L {_fmt(nx + f.font * 0.45)} {_fmt(ny)} Z" fill="{_INK}" stroke="{_TEXT}" '
        f'stroke-width="{_fmt(f.stroke)}"/>',
        _label(nx, ny + f.font * 0.95, "N", f.font * 0.8),
    ]
    if empty:
        out.append(
            _label((f.min_x + f.max_x) / 2, f.min_y + f.pad * 0.9, "No areas mapped yet", f.font)
        )
    return out


def render_svg(site: SiteMap | None, state: RobotState | None) -> str:
    """Return a standalone SVG document."""
    pose = state.position if state is not None else None
    f = _frame(site, pose)
    height_px = max(200, round(WIDTH_PX * f.height / f.width))
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_fmt(f.min_x)} {_fmt(f.min_y)} '
        f'{_fmt(f.width)} {_fmt(f.height)}" width="{WIDTH_PX}" height="{height_px}" '
        f'font-family="system-ui, -apple-system, Segoe UI, sans-serif">',
        "<title>Yarbo site map</title>",
        f'<rect x="{_fmt(f.min_x)}" y="{_fmt(f.min_y)}" width="{_fmt(f.width)}" '
        f'height="{_fmt(f.height)}" rx="{_fmt(f.span / 60)}" fill="{_GRID}" fill-opacity="0.08"/>',
        *_grid(f),
    ]
    if site is not None:
        shapes, labels = _zones(site, f)
        out += shapes
        out += _docks(site, f)
        out += labels
    if pose is not None:
        out.append(_robot(pose, f))
    out += _furniture(f, site is None or site.empty)
    out.append("</svg>")
    return "".join(out)


def _label(x: float, y: float, text: str, size: float) -> str:
    return (
        f'<text x="{_fmt(x)}" y="{_fmt(y)}" font-size="{_fmt(size)}" text-anchor="middle" '
        f'dominant-baseline="middle" fill="{_TEXT}" stroke="{_INK}" '
        f'stroke-width="{_fmt(size * 0.2)}" paint-order="stroke" stroke-linejoin="round">'
        f"{escape(text)}</text>"
    )
