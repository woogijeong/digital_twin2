# Hardware check — real Indy7 controller / simulator

The automated suite runs entirely against `MockRobot`. This checklist is the
manual verification against a real IndyDCP3 controller or the Neuromeka
simulator, and must be run once before claiming real-mode support.

> The app forces `set_simulation_mode(True)` on connect and issues no motion
> commands, so this is safe to run against a physical robot. Still, keep the
> e-stop within reach.

## 1. Connectivity

- [ ] Controller / simulator reachable: `ping 192.168.3.4`
- [ ] Start real mode: `INDY_HOST=192.168.3.4 pnpm dev`
- [ ] `curl http://localhost:8000/api/health` → `{"mode":"real","connected":true,"model":"indy7"}`
- [ ] Backend log shows `connected to controller 192.168.3.4 (simulation mode)`
- [ ] UI header shows `SIMULATION` (not `MOCK`) and `LINKED`

## 2. Live mirroring

- [ ] In Conty / the simulator, jog a joint. The 3D model in the browser follows
      within ~200 ms and the `JOINTS` bars + `TCP POSE` values update live.
- [ ] Move the robot to a few distinct poses; the rendered arm matches the
      physical/simulated arm shape each time.

## 3. Forward-kinematics round-trip (Euler convention sanity)

- [ ] `curl http://localhost:8000/api/state` → note `q` and `p`.
- [ ] In a Python shell:
      ```python
      from neuromeka import IndyDCP3
      indy = IndyDCP3("192.168.3.4")
      print(indy.forward_kin(q)["tpos"])   # q from /api/state
      ```
- [ ] `forward_kin(q)` matches `/api/pose` within ~1 mm / ~0.1° on every axis.
      A large mismatch on the rotation axes means the controller's Euler
      convention differs from what is displayed — file it, do not silently
      convert.

## 4. Inverse kinematics

- [ ] Enter a reachable target pose in the UI, `APPLY TARGET` → the model
      animates (~1 s) to the IK solution.
- [ ] **Expected on real hardware:** P0 issues no motion command, so the real
      robot stays put; ~1 s after the animation the model snaps back to the live
      (unchanged) pose. This confirms IK solved correctly but is not commanded.
      Commanding the move is P1. (In mock mode the model holds the new pose.)
- [ ] Enter an obviously unreachable target (e.g. X = 5000) → inline
      `IK: ...` message appears, model does not jump.

## 5. Fallback

- [ ] Stop the controller / pull the cable, restart `pnpm dev` → backend logs
      `controller unavailable ... falling back to mock mode`, UI shows `MOCK`,
      app still works.

---

Record the date, controller firmware, and any anomalies below when run:

| date | firmware | result | notes |
| --- | --- | --- | --- |
|      |          |        |       |
