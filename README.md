# Indy7 Digital Twin — P0 MVP

[![CI](https://github.com/woogijeong/digital_twin2/actions/workflows/ci.yml/badge.svg)](https://github.com/woogijeong/digital_twin2/actions/workflows/ci.yml)
[![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB?logo=python&logoColor=white)](backend/pyproject.toml)
[![Node ≥22](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](package.json)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](backend/app/main.py)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](frontend/package.json)
[![three.js](https://img.shields.io/badge/three.js-r169-000000?logo=threedotjs&logoColor=white)](frontend/src/three)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A browser-based digital twin of the Neuromeka **Indy7** collaborative robot.
Loads the real `indy_description` URDF into a three.js viewport, shows the live
TCP pose (X, Y, Z, Rx, Ry, Rz), and lets you type a target pose — absolute in
the base frame, or a relative offset from the current pose — that the controller
solves with inverse kinematics and the model animates to.

Design direction: **"Control Room"** — a dark industrial HMI (see
`.omc/plans/2026-09-03-neuromeka-digital-twin-p0.md` §8).

![Live demo](docs/demo.gif)

> Orbit the model, drive it to two target poses (IK solved on the controller),
> then an unreachable target is rejected inline. Mock mode — no controller
> attached. Regenerate with `pnpm demo:gif`.

<details>
<summary>Static screenshots</summary>

![Overview](docs/screenshots/01-overview.png)

| Target applied (IK solved) | Unreachable target rejected |
| --- | --- |
| ![Apply](docs/screenshots/02-target-applied.png) | ![Reject](docs/screenshots/03-ik-rejected.png) |

</details>

## Architecture

```
┌──────────────────────────────┐      ┌───────────────────────────────┐      ┌──────────────────────┐
│ Frontend — Vite + React + TS │ HTTP │ Backend — FastAPI (Python)    │ gRPC │ Indy controller /     │
│                              │─────▶│                               │─────▶│ simulator            │
│ • three.js + urdf-loader     │ REST │ RobotService (interface)      │      │ 192.168.3.4          │
│   → Indy7 3D viewer          │      │  ├─ IndyDCP3Robot (real)      │      │ (simulation mode)    │
│ • TCP pose panel + IK input  │◀────▶│  └─ MockRobot   (offline)     │      │ neuromeka SDK        │
│ • per-joint bars, status bar │  WS  │ GET /api/health /pose /state  │      └──────────────────────┘
│                              │      │ POST /api/ik                  │
│                              │      │ WS  /ws/telemetry  (20 Hz)    │
└──────────────────────────────┘      └───────────────────────────────┘
```

- **Kinematics are never computed here.** `IndyDCP3Robot` calls the controller's
  own `inverse_kin` / `forward_kin`, so the twin matches the real robot. Euler
  angles are shown exactly as the controller reports them (no convention
  conversion).
- **P0 never commands motion.** On connect the controller is put into
  `set_simulation_mode(True)`; there is no `movej` / `movel` in any P0 code path
  (enforced by a test). `RESET TO HOME` is a mock-only convenience — against a
  real controller it returns `409`.
- **End effector.** `NONE` / `SUCTION` / `GRIPPER` (`POST /api/tool`) shifts the
  TCP the kinematics report to the tool tip and renders procedural tool geometry
  on the flange; the gripper has an open/close toggle. Connected to a real
  controller it also pushes `set_tool_frame` (a TCP-reference config, allowed in
  P0 — it does not move the robot).
- **No controller? It still runs.** If `192.168.3.4` is unreachable the backend
  falls back to `MockRobot` and the UI shows a `MOCK` badge. The mock holds a
  ready pose and eases to applied targets using forward/inverse kinematics
  derived from the committed Indy7 URDF, so its poses are in the same base
  (reference) frame the real controller reports and line up with the 3D model.
- **Connect / disconnect from the UI.** The status bar has an editable
  controller address and a `CONNECT` / `DISCONNECT` toggle (`POST /api/connect`
  · `/api/disconnect`); the open telemetry socket is repointed at the new source
  without a reload. A failed dial reports inline and stays on the mock.

## Prerequisites

- **Node ≥ 22** and **pnpm 11** (`npm i -g pnpm`)
- **[uv](https://docs.astral.sh/uv/)** — manages the Python 3.12 backend env
  (Python 3.12 is pinned because the `neuromeka` SDK's gRPC dependencies have no
  wheels for 3.13+; `uv` downloads 3.12 automatically)

## One-command run

```bash
# first time only
pnpm install
pnpm --dir frontend install
uv sync --project backend
# pnpm assets          # optional — the Indy7 URDF + meshes are already committed;
                       # re-run only to refresh them from upstream

# run backend (:8000) + frontend (:5173) together
pnpm dev               # -> open http://localhost:5173
```

Force mock mode (no controller): `INDY_USE_MOCK=1 pnpm dev`
Point at a different controller: `INDY_HOST=10.0.0.5 pnpm dev`

`make dev` / `make test` / `make assets` do the same on POSIX/CI.

## Configuration

Environment variables (prefix `INDY_`), or a `backend/.env` file:

| var | default | meaning |
| --- | --- | --- |
| `INDY_HOST` | `192.168.3.4` | controller / simulator address |
| `INDY_USE_MOCK` | `false` | force the offline mock robot |
| `INDY_CONNECT_TIMEOUT_S` | `3.0` | connect timeout before mock fallback |
| `INDY_TELEMETRY_HZ` | `20` | `/ws/telemetry` broadcast rate |

## Tests

```bash
pnpm test          # backend pytest + frontend build + Playwright e2e
pnpm test:api      # pytest only  (backend/)
pnpm test:e2e      # Playwright only (frontend/, mock backend, writes screenshots)
pnpm demo:gif      # record e2e/demo.spec.ts and rebuild docs/demo.gif (needs ffmpeg)
```

`pnpm --dir frontend exec playwright install chromium` once before the first e2e run.
CI (`.github/workflows/ci.yml`) runs `test:api` + `test:web` + `test:e2e` on every push.

## Connecting to the real controller

See [`docs/hardware-check.md`](docs/hardware-check.md) for the manual checklist
(simulation-mode connection, live mirroring, FK round-trip check).

## Layout

```
backend/    FastAPI app — app/robot (services), app/api (REST + WS), tests/
frontend/   Vite React app — src/three (viewer), src/components, src/hooks, e2e/
scripts/    fetch_urdf_assets.py, make-demo-gif.mjs
docs/       PRD, hardware checklist, screenshots, demo.gif
design/     Direction A/B/C design mockups (design canvas)
```

## License

[MIT](LICENSE) for this project's code. The bundled Indy7 URDF + STL meshes
(`frontend/public/robot/`) are from
[neuromeka-robotics/indy-ros2](https://github.com/neuromeka-robotics/indy-ros2),
BSD-3-Clause — see [`frontend/public/robot/NOTICE.md`](frontend/public/robot/NOTICE.md).
