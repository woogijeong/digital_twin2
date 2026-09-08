# digital_twin2 — Neuromeka Indy7 Digital Twin

- Product spec: `docs/PRD.md`
- Approved plan + design tokens (Direction A "Control Room"): `.omc/plans/2026-09-03-neuromeka-digital-twin-p0.md`
- Design mockups: `design/` (A = Main.dc.html, B, C)
- Run: `pnpm dev` (backend :8000 + frontend :5173). Force offline: `INDY_USE_MOCK=1 pnpm dev`.
- Test: `pnpm test` (pytest + build + Playwright e2e).
- Backend Python is pinned to 3.12 via uv (neuromeka's gRPC deps have no 3.13+ wheels).
- P0 never commands a robot *move* and never changes the controller's state on connect (it does **not** call `set_simulation_mode` — the twin observes whatever mode the controller is in and reports it back as `simulation` in telemetry). `_call` allowlists read + kinematics + `set_tool_frame` (a TCP-reference config, not motion) + `set_do` (gripper/suction I/O) + `recover` (fault flag) + `stop_motion` only. No `movej`/`movel`/teleop, ever (enforced by a test).
- The **one** deliberate exception to "the twin never commands the controller" is the E-STOP button (`POST /api/estop` → `RobotService.emergency_stop` → `stop_motion` category-1). It is an operator safety control: it *halts* motion, it can never start one. The frontend also freezes the rendered twin immediately (cancels any in-flight IK animation) so the arm stops on screen the instant it is pressed.
