"""Fetch the Indy7 URDF + visual meshes and rewrite them for the browser.

Source: neuromeka-robotics/indy-ros2 @ humble-indyDCP3 (BSD-3-Clause).
The upstream flattened URDF hardcodes absolute ``file:///home/user/...`` mesh
paths; three.js needs paths relative to where the URDF is served. This script
downloads ``indy7.urdf`` and ``meshes/indy7/visual/*.stl`` and rewrites every
``<mesh filename="...">`` to ``meshes/indy7/visual/<name>.stl``.

Run via ``pnpm assets`` (or ``python scripts/fetch_urdf_assets.py``).
"""

from __future__ import annotations

import re
import sys
import urllib.request
from pathlib import Path

RAW = "https://raw.githubusercontent.com/neuromeka-robotics/indy-ros2/humble-indyDCP3"
URDF_SRC = f"{RAW}/indy_description/urdf_files/indy7.urdf"
MESH_SRC = f"{RAW}/indy_description/meshes/indy7/visual"

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public" / "robot"
MESH_OUT = OUT / "meshes" / "indy7" / "visual"

MESH_RE = re.compile(r'filename="([^"]+?/([^"/]+\.stl))"', re.IGNORECASE)


def _get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310 - fixed https host
        return resp.read()


def main() -> int:
    MESH_OUT.mkdir(parents=True, exist_ok=True)

    urdf = _get(URDF_SRC).decode("utf-8")
    names = sorted({m.group(2) for m in MESH_RE.finditer(urdf)})
    if not names:
        print("ERROR: no mesh references found in indy7.urdf", file=sys.stderr)
        return 1

    for name in names:
        data = _get(f"{MESH_SRC}/{name}")
        (MESH_OUT / name).write_bytes(data)
        print(f"  mesh  {name}  ({len(data) // 1024} KiB)")

    rewritten = MESH_RE.sub(r'filename="meshes/indy7/visual/\2"', urdf)
    (OUT / "indy7.urdf").write_text(rewritten, encoding="utf-8")

    leftover = re.findall(r'filename="(file://|package://)[^"]*"', rewritten)
    if leftover:
        print(f"ERROR: {len(leftover)} absolute mesh paths remain", file=sys.stderr)
        return 1
    missing = [n for n in names if not (MESH_OUT / n).is_file()]
    if missing:
        print(f"ERROR: missing meshes: {missing}", file=sys.stderr)
        return 1

    (OUT / "NOTICE.md").write_text(
        "# Robot assets\n\n"
        "`indy7.urdf` and `meshes/indy7/visual/*.stl` are derived from\n"
        "[neuromeka-robotics/indy-ros2](https://github.com/neuromeka-robotics/indy-ros2)\n"
        "(`humble-indyDCP3` branch), `indy_description` package, licensed BSD-3-Clause.\n\n"
        "The only modification is rewriting absolute `<mesh filename>` paths to\n"
        "paths relative to this directory, via `scripts/fetch_urdf_assets.py`.\n",
        encoding="utf-8",
    )
    print(f"OK: wrote {OUT / 'indy7.urdf'} + {len(names)} meshes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
