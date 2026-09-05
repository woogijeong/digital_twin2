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

![Pick and place demo](docs/demo-pickplace.gif)

> Mount the gripper, descend onto the workpiece, close to pick it up, carry it
> to a new spot, and open to place it down. Mock mode. Regenerate with
> `pnpm demo:pickplace:gif`.

<details>
<summary>Static screenshots</summary>

![Overview](docs/screenshots/01-overview.png)

| Target applied (IK solved) | Unreachable target rejected |
| --- | --- |
| ![Apply](docs/screenshots/02-target-applied.png) | ![Reject](docs/screenshots/03-ik-rejected.png) |

</details>

## P0 이후 업데이트 내역

P0 MVP 이후 추가된 기능들입니다 (한국어로 정리):

- **Pick / Place 시각화** — 바닥에 놓인 워크피스를 그리퍼로 잡았다 놓을 수 있습니다. 그리퍼 팁이 물체 근처(8cm 이내)에서 닫히면 부착되어 팔을 따라 이동하고, 열면 그 자리에 놓입니다.
- **안전 경고** — 목표 좌표가 바닥면(Z < 5mm) 아래일 경우 IK 단계에서 아예 거부되고(사후 경고가 아니라 사전 차단), 관절이 하드웨어 한계에 근접하면 JOINTS 바가 노란색으로 강조됩니다.
- **TOOL 좌표계 이동 모드** — TARGET POSE에 `ABS`/`REL`에 이어 `TOOL` 모드가 추가되어, 툴이 현재 향하고 있는 방향을 기준으로 전진/후진(접근·후퇴)하거나 툴 자신의 축으로 회전시킬 수 있습니다.
- **엔드 이펙터 커스터마이징** — 그리퍼/석션 각각 색상을 자유롭게 지정할 수 있고(몸통+접촉부 전체 반영), 어두운 배경에서도 잘 보이도록 teal 색 윤곽선(림 라이트)이 둘러져 있습니다. 실측값 반영: 그리퍼 전장 110mm, 석션 전장 210mm.
- **다크 / 라이트 모드 & 뷰포트 배경 전환** — 헤더에서 UI 전체를 라이트/다크로 전환할 수 있고, 3D 뷰포트 배경도 검정/회색 중 선택할 수 있습니다(그리드 색상도 배경에 맞춰 자동 보정). 3D 시야 자체는 항상 어둡게 유지되어 오버레이(TCP 좌표, 방향 기즈모 등)의 가독성은 그대로 보장됩니다.
- **정확한 연결 상태 표시** — 헤더의 `LINKED`/`NOT LINKED` 배지가 이제 "텔레메트리가 흐르는지"가 아니라 "실제 로봇 컨트롤러에 연결되어 있는지"만을 나타냅니다. mock 모드에서는 항상 `NOT LINKED`로 표시됩니다.
- **Manipulability(가동성 지수) 표시 + 컨트롤러 에러 복구** — 하단에 실시간 manipulability(자코비안 기반, 특이점에 가까울수록 0에 수렴)가 표시됩니다. 실제 컨트롤러가 충돌(COLLISION)이나 안전 위반(VIOLATE) 상태가 되면 TARGET POSE 패널에 경고 배너와 `RECOVER` 버튼이 나타나며, 이 버튼은 fault 플래그만 해제할 뿐 모션 명령이 아닙니다.
- **그리퍼 / 석션 디지털 출력 제어** — 화면의 OPEN/CLOSE, ON/OFF 버튼이 실제 컨트롤러 연결 시 디지털 출력(DO0/DO1 = 그리퍼 열기/닫기, DO2 = 석션 on/off)을 그대로 토글합니다. 로봇 팔 자체를 움직이는 명령이 아니라 엔드 이펙터 밸브만 작동시키므로, 아래 "P0 never commands motion" 원칙과 별개로 안전하게 허용되어 있습니다.

## 실행 방법 (한국어)

```bash
# 최초 1회
pnpm install
pnpm --dir frontend install
uv sync --project backend
# pnpm assets   # 선택 사항 — Indy7 URDF/메시는 이미 저장소에 포함되어 있어
                # 원본을 다시 받아올 때만 실행하면 됩니다

# 백엔드(:8000) + 프론트엔드(:5173) 동시 실행
pnpm dev              # -> http://localhost:5173 접속
```

- 컨트롤러 없이 강제로 mock 모드 실행: `INDY_USE_MOCK=1 pnpm dev`
- 다른 컨트롤러 IP로 접속: `INDY_HOST=10.0.0.5 pnpm dev`
- 실제 로봇 컨트롤러(192.168.3.4)가 네트워크에 없으면 자동으로 mock 모드로 전환되며, 헤더에 `MOCK` 배지가 표시됩니다. 화면 상단의 CONNECT 버튼으로 언제든 실제 컨트롤러 IP를 입력해 연결을 시도할 수 있습니다.
- 테스트 전체 실행: `pnpm test` (백엔드 pytest + 프론트엔드 빌드 + Playwright e2e)

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
pnpm demo:pickplace:gif  # record e2e/demo-pickplace.spec.ts -> docs/demo-pickplace.gif
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
