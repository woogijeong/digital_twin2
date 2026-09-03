# Indy7 Digital Twin — P0 MVP

A browser-based digital twin of the Neuromeka **Indy7** collaborative robot.
Loads the real `indy_description` URDF into a three.js viewport, shows the live
TCP pose (X, Y, Z, Rx, Ry, Rz), and lets you type a target pose that the
controller solves with inverse kinematics and the model animates to.

Design direction: **"Control Room"** — a dark industrial HMI (see
`.omc/plans/2026-09-03-neuromeka-digital-twin-p0.md` §8).

![Overview](docs/screenshots/01-overview.png)

| Target applied (IK solved) | Unreachable target rejected |
| --- | --- |
| ![Apply](docs/screenshots/02-target-applied.png) | ![Reject](docs/screenshots/03-ik-rejected.png) |

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
  (enforced by a test).
- **No controller? It still runs.** If `192.168.3.4` is unreachable the backend
  falls back to `MockRobot` (a deterministic idle motion) and the UI shows a
  `MOCK` badge.

## Prerequisites

- **Node ≥ 20** and **pnpm** (`npm i -g pnpm`)
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
```

`pnpm --dir frontend exec playwright install chromium` once before the first e2e run.

## Connecting to the real controller

See [`docs/hardware-check.md`](docs/hardware-check.md) for the manual checklist
(simulation-mode connection, live mirroring, FK round-trip check).

## Layout

```
backend/    FastAPI app — app/robot (services), app/api (REST + WS), tests/
frontend/   Vite React app — src/three (viewer), src/components, src/hooks, e2e/
scripts/    fetch_urdf_assets.py — URDF + mesh downloader / path rewriter
docs/       PRD, hardware checklist
design/     Direction A/B/C design mockups (design canvas)
```
