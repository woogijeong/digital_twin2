# digital_twin2 — Neuromeka Indy7 Digital Twin

- Product spec: `docs/PRD.md`
- Approved plan + design tokens (Direction A "Control Room"): `.omc/plans/2026-09-03-neuromeka-digital-twin-p0.md`
- Design mockups: `design/` (A = Main.dc.html, B, C)
- Run: `pnpm dev` (backend :8000 + frontend :5173). Force offline: `INDY_USE_MOCK=1 pnpm dev`.
- Test: `pnpm test` (pytest + build + Playwright e2e).
- Backend Python is pinned to 3.12 via uv (neuromeka's gRPC deps have no 3.13+ wheels).
- P0 never commands robot motion — controller is forced into simulation mode; `_call` allowlists read + kinematics only.
