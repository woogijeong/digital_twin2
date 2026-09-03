# 뉴로메카 협동로봇 디지털 트윈 앱 — P0 MVP 실행 계획

- 상태: **APPROVED — Ralph 실행 (2026-09-03 사용자 승인)**
- 작성일: 2026-09-03
- 소스 PRD: `docs/PRD.md`
- 범위: **P0 핵심 기능만**. P1(Pick/Place, pallet2x2 시퀀스, 재생 컨트롤, 충돌 감지, 다크모드 등)은 이 계획에서 제외.
- **디자인 방향: Direction A — "Control Room" (다크 산업 HMI).** 아래 섹션 10 참조. 디자인 캔버스: `design/Main.dc.html`, 아티팩트 https://claude.ai/code/artifact/355c71b8-c490-40c2-8837-1c053e2d0323

---

## 1. 요구사항 요약 (P0)

| # | PRD 항목 | 해석 |
|---|---------|------|
| R1 | 로봇 3D 모델 렌더링 (IndyDCP3 형상) | 웹 브라우저에서 Indy7 URDF를 three.js로 렌더링, 궤도 회전/줌 가능 |
| R2 | 현재 좌표값(X, Y, Z, Rx, Ry, Rz) 텍스트 표시 | 컨트롤러의 현재 task pose를 mm/deg 단위로 실시간 표시 |
| R3 | 좌표 입력/변경 시 로봇 모델 자세 갱신 | 목표 pose 입력 → IK로 관절각 계산 → 3D 모델 자세가 해당 자세로 애니메이션 |
| R4 | 파이썬을 통해 실시간 애니메이션 확인 | FastAPI(파이썬) 백엔드가 IndyDCP3 SDK로 IK/FK/텔레메트리를 처리하고 WebSocket으로 프론트에 스트리밍 |

### 확정된 설계 결정 (인터뷰 결과)

- **스택**: React + three.js 프론트엔드 + FastAPI 파이썬 백엔드, WebSocket 실시간 통신
- **로봇 자산**: `neuromeka-robotics/indy-ros2` 의 `indy_description` URDF + STL 메시 (Indy7 기준)
- **기구학**: 자체 구현하지 않음. IndyDCP3 SDK의 `inverse_kin` / `forward_kin` (컨트롤러가 계산 → 실물과 동일 정확도)
- **컨트롤러**: 192.168.3.4 실물/시뮬레이터 접근 가능. **`set_simulation_mode(True)` 로 안전하게 미러링**. 컨트롤러 미도달 시 Mock 소스로 자동 폴백

---

## 2. 아키텍처

```
┌─────────────────────────────┐         ┌──────────────────────────────┐        ┌─────────────────────┐
│  Frontend (Vite+React+TS)   │  HTTP   │  Backend (FastAPI, Python)   │  gRPC  │  Indy Controller     │
│                             │ ──────► │                              │ ─────► │  192.168.3.4         │
│  • three.js + urdf-loader   │  REST   │  RobotService (interface)    │        │  (simulation mode)   │
│    → Indy7 3D 뷰어          │         │   ├─ IndyDCP3Robot (real)    │        │  neuromeka SDK       │
│  • PosePanel (X..Rz 표시/입력)│ ◄─────► │   └─ MockRobot (fallback)    │        └─────────────────────┘
│  • 관절각 보간 애니메이션    │   WS    │  • /api/pose  /api/ik        │
│  • 연결상태 인디케이터       │ telemetry│  • /ws/telemetry (20Hz)     │
└─────────────────────────────┘         └──────────────────────────────┘
```

### 데이터 흐름

1. **현재 좌표 표시(R2)**: 백엔드가 `get_control_data()` 를 20Hz로 폴링 → `{ q[6], p[6], ts }` 를 `/ws/telemetry` 로 push → 프론트가 `p` 를 PosePanel에 표시하고 `q` 로 로봇 관절 갱신.
2. **좌표 입력→자세 갱신(R3)**: 사용자가 목표 `tpos=[x,y,z,rx,ry,rz]` 입력 → `POST /api/ik { tpos, init_jpos }` → 백엔드가 `indy.inverse_kin(tpos, init_jpos)` 호출 → `jpos[6]` 반환 → 프론트가 현재 `q` 에서 목표 `jpos` 로 ~1초 tween 보간하며 three.js 관절 렌더링. (P0에서는 실제 로봇을 움직이지 않음. `movej` 호출은 P1.)
3. **FK 검증**: 프론트에 표시되는 `p` 와 `forward_kin(q)` 결과가 일치하는지 백엔드 헬스체크에서 확인 (오일러각 규약 불일치 조기 발견용).

### SDK 사실 (검증됨, `neuromeka` PyPI 패키지 `develop` 브랜치 `indydcp3.py` 기준)

- `IndyDCP3(host)` 생성자, `pip3 install neuromeka`
- `get_control_data()` → `{ q: float[6] (deg), p: float[6] ([mm,mm,mm,deg,deg,deg]), ref_frame, tool_frame, ... }`
- `get_control_state()` → `q, qdot, p, pdes, tau_ext, manipulability, ...`
- `inverse_kin(tpos: float[6], init_jpos: float[]) -> { jpos: float[] }` (deg)
- `forward_kin(jpos: float[]) -> { tpos: float[6] }`
- `get_motion_data()` → `traj_state, is_in_motion, is_target_reached, speed_ratio`
- `set_simulation_mode(enable: bool)` — 시뮬레이션 모드 토글
- `movej(jtarget)`, `movel(ttarget)` — **P1용 실제 모션 명령**

### URDF 사실 (검증됨, `indy-ros2` `humble-indyDCP3` 브랜치)

- 평탄화된 URDF: `indy_description/urdf_files/indy7.urdf` (다른 모델: `indy12.urdf`, `indyrp2.urdf` 등)
- 관절: `joint0`..`joint5` (revolute) + `global`(fixed) + `tcp`(fixed). `q` 순서 = joint0..joint5.
- 메시: STL, `meshes/indy7/visual/Indy7_0..6.stl`
- **주의**: `indy7.urdf` 의 mesh filename이 절대경로(`file:///home/user/...`)로 하드코딩됨 → 브라우저용으로 상대 URL 재작성 필요 (빌드 태스크로 처리, 아래 Phase 1).

---

## 3. 리포지토리 구조

```
digital_twin2/
├── docs/PRD.md
├── README.md                      # 실행 방법 + 데모 스크린샷/gif
├── docker-compose.yml             # (선택) 원커맨드 실행
├── Makefile                       # dev / test / assets 태스크
├── backend/
│   ├── pyproject.toml             # uv 관리, 의존성 핀
│   ├── app/
│   │   ├── main.py                # FastAPI 앱, 라우터, WS, lifespan
│   │   ├── config.py              # INDY_HOST, INDY_MODEL, USE_MOCK, TELEMETRY_HZ
│   │   ├── robot/
│   │   │   ├── base.py            # RobotService 프로토콜(ABC): get_pose, get_joints, solve_ik, forward_kin, stream()
│   │   │   ├── indy.py            # IndyDCP3Robot — neuromeka SDK 래핑, 시뮬레이션 모드 강제
│   │   │   └── mock.py            # MockRobot — 사인파 관절 + FK 근사, 오프라인 데모용
│   │   ├── api/
│   │   │   ├── routes.py          # GET /api/health, GET /api/pose, POST /api/ik, GET /api/state
│   │   │   └── telemetry_ws.py    # /ws/telemetry — 20Hz 브로드캐스트, 다중 클라이언트
│   │   └── schemas.py             # Pydantic: PoseDTO, IkRequest, IkResponse, TelemetryFrame
│   └── tests/
│       ├── test_routes.py         # TestClient, MockRobot
│       ├── test_ws.py             # WS 프레임 형태/주기
│       └── test_indy_contract.py  # SDK 응답 파싱 (녹화된 fixture)
├── frontend/
│   ├── package.json               # pnpm, Vite, React, TS
│   ├── vite.config.ts             # /api, /ws 프록시 → backend
│   ├── public/robot/              # 재작성된 indy7.urdf + meshes/ (assets 태스크가 생성)
│   └── src/
│       ├── main.tsx / App.tsx
│       ├── api/client.ts          # fetch 래퍼, IK 호출
│       ├── hooks/useTelemetry.ts  # WS 구독, 재연결, 연결상태
│       ├── three/RobotViewer.tsx  # three.js 씬, OrbitControls, 그리드, 조명
│       ├── three/urdfRobot.ts     # urdf-loader 로 로드, setJointValues(q)
│       ├── three/jointTween.ts    # 현재→목표 관절각 보간 (requestAnimationFrame)
│       ├── components/PosePanel.tsx      # X,Y,Z,Rx,Ry,Rz 표시 + 입력폼 + "적용"
│       └── components/StatusBar.tsx      # 연결상태 / 시뮬레이션 모드 배지
└── scripts/
    └── fetch_urdf_assets.py       # indy-ros2에서 URDF+STL 다운로드, mesh 경로 재작성 → frontend/public/robot/
```

---

## 4. 인수 조건 (테스트 가능)

### 백엔드

- [ ] **AC-B1**: `GET /api/health` 가 `{ status, mode: "real"|"mock", connected: bool, model: "indy7" }` 을 200으로 반환.
- [ ] **AC-B2**: `GET /api/pose` 가 `{ x, y, z, rx, ry, rz }` (숫자 6개) 반환. real 모드에서는 `get_control_data().p` 와 값 일치(부동소수 오차 1e-6).
- [ ] **AC-B3**: `POST /api/ik { tpos:[6], init_jpos:[6] }` 가 도달 가능 목표에 대해 `{ jpos:[6] }` 반환. `forward_kin(jpos)` 결과가 입력 `tpos` 와 위치 오차 ≤ 1mm, 각도 오차 ≤ 0.1° 이내.
- [ ] **AC-B4**: 도달 불가/특이점 목표는 HTTP 422 + `{ error: "ik_failed", detail }` 반환하고 서버는 크래시하지 않음.
- [ ] **AC-B5**: `/ws/telemetry` 연결 시 `{ q:[6], p:[6], ts }` 프레임을 20±5Hz 로 수신. 2개 클라이언트 동시 연결 시 둘 다 수신.
- [ ] **AC-B6**: `INDY_HOST` 미도달(타임아웃 3s) 시 자동으로 `mock` 모드로 시작하고 `/api/health` `mode:"mock"` 반영, 500 없음.
- [ ] **AC-B7**: real 모드 시작 시 `set_simulation_mode(True)` 가 반드시 호출됨 (테스트: SDK 목으로 호출 검증). 실제 모션 명령(`movej`/`movel`)은 P0 코드 경로에 존재하지 않음.
- [ ] **AC-B8**: `pytest` 전체 통과, 커버리지 ≥ 70% (robot/, api/).

### 프론트엔드

- [ ] **AC-F1**: 앱 로드 후 3초 내 Indy7 3D 모델이 화면에 보이고, 마우스 드래그로 회전/휠로 줌 가능.
- [ ] **AC-F2**: PosePanel 에 X,Y,Z,Rx,Ry,Rz 6개 값이 단위(mm/deg)와 함께 표시되고, 텔레메트리 수신 시 100ms 내 갱신.
- [ ] **AC-F3**: 목표 좌표 입력 후 "적용" → 1±0.3초 동안 로봇 관절이 부드럽게 보간되어 목표 자세로 이동. IK 실패 시 패널에 에러 메시지 표시, 로봇은 움직이지 않음.
- [ ] **AC-F4**: 백엔드 real 모드에서 시뮬레이터의 관절이 움직이면 3D 모델 관절이 실시간(지연 ≤ 200ms)으로 미러링됨.
- [ ] **AC-F5**: WS 끊김 시 StatusBar 가 "연결 끊김"으로 바뀌고, 복구 시 자동 재연결(백오프 최대 5s).
- [ ] **AC-F6**: `pnpm build` 성공, 콘솔 에러 0.

### E2E / 데모

- [ ] **AC-E1**: Playwright 시나리오 — 앱 로드 → 로봇 캔버스 존재 확인 → 좌표 입력 → 관절 변화 감지(URDF joint DOM/상태) → 통과. 백엔드 mock 모드로 CI에서 실행.
- [ ] **AC-E2**: `README.md` 에 원커맨드 실행법 + 최소 3장 스크린샷 또는 1개 gif (포트폴리오용).
- [ ] **AC-E3**: 하드웨어 수동 검증 체크리스트 문서화 — 192.168.3.4 시뮬레이션 모드 연결 → 미러링/IK 확인.

---

## 5. 구현 단계

### Phase 0 — 스캐폴딩 (0.5d)
1. `backend/` : `uv init`, FastAPI + uvicorn + pydantic + neuromeka + pytest + httpx 의존성 추가, `pyproject.toml` 버전 핀. **가장 먼저 Windows 네이티브에서 `uv sync` + `python -c "import neuromeka"` 성공 확인** (RK4). 실패 시 즉시 WSL2 절차로 전환하고 README에 기록.
2. `frontend/` : `pnpm create vite` (react-ts), three + urdf-loader + @react-three/fiber(선택) 추가. Vite 프록시 설정.
3. `Makefile` : `make dev` (백+프론트 동시), `make test`, `make assets`.
4. `.gitignore`, 최소 `README.md` 뼈대.
- **검증**: `make dev` 로 빈 FastAPI(`/api/health` 스텁)와 빈 React 페이지가 각각 뜬다.

### Phase 1 — URDF 자산 파이프라인 (0.5d)
1. `scripts/fetch_urdf_assets.py` : GitHub raw로 `indy_description/urdf_files/indy7.urdf` + `meshes/indy7/visual/*.stl` 다운로드.
2. URDF의 `<mesh filename="file:///...">` / `package://` 경로를 `robot/meshes/indy7/visual/Indy7_N.stl` 상대경로로 재작성.
3. 결과를 `frontend/public/robot/` 에 배치. 라이선스/출처를 `frontend/public/robot/NOTICE.md` 에 명시.
- **검증**: `frontend/public/robot/indy7.urdf` 를 텍스트로 열어 모든 mesh 경로가 상대경로이고, 참조 STL 파일이 전부 존재.

### Phase 2 — 백엔드 RobotService (1.5d)
1. `robot/base.py` : `RobotService` ABC — `async connect()`, `get_pose() -> PoseDTO`, `get_joints() -> list[float]`, `solve_ik(tpos, init_jpos) -> list[float]`, `forward_kin(jpos) -> list[float]`, `async stream() -> AsyncIterator[TelemetryFrame]`.
2. `robot/indy.py` : neuromeka `IndyDCP3` 래핑. **connect 시 `set_simulation_mode(True)` 강제**. `get_control_data()` → PoseDTO/joints 파싱. gRPC 호출은 `asyncio.to_thread` 로 오프로드. 연결 실패는 `RobotUnavailable` 예외.
3. `robot/mock.py` : 6관절 사인파 궤적, `forward_kin` 은 간단한 DH 근사 또는 고정 lookup. `solve_ik` 는 목표를 그대로 관절 델타로 매핑(데모 목적).
4. `config.py` + `main.py` lifespan : `IndyDCP3Robot` 시도 → 3s 타임아웃/실패 시 `MockRobot` 로 폴백, `app.state.robot` 에 저장, `app.state.mode` 기록.
5. `api/routes.py` : health/pose/ik/state 구현. IK 실패 → 422.
- **검증**: `pytest tests/test_routes.py tests/test_indy_contract.py` 통과. AC-B1~B4, B6, B7.

### Phase 3 — 텔레메트리 WebSocket (0.5d)
1. `telemetry_ws.py` : 단일 백그라운드 태스크가 `robot.stream()` 을 20Hz로 폴링, `asyncio` 브로드캐스트 큐로 다중 WS 클라이언트에 fan-out. 느린 클라이언트는 최신 프레임만 유지(드롭).
2. 클라이언트 연결/해제 처리, 예외 시 로깅 후 유지.
- **검증**: `pytest tests/test_ws.py` — 프레임 형태, 주기(20±5Hz), 2 클라이언트. AC-B5.

### Phase 4 — 3D 뷰어 (1.5d)
1. `three/RobotViewer.tsx` : three.js 씬, `PerspectiveCamera`, `OrbitControls`, `GridHelper`, 앰비언트+디렉셔널 조명, 리사이즈 핸들링.
2. `three/urdfRobot.ts` : `URDFLoader` 로 `/robot/indy7.urdf` 로드, STL 로더 등록. `setJoints(q: number[])` — deg→rad 변환 후 `robot.joints["joint0..5"].setJointValue()`.
3. `three/jointTween.ts` : 현재 관절 배열 → 목표 배열, easing(cubic) 으로 `requestAnimationFrame` 보간, 취소 가능.
- **검증**: AC-F1. 하드코딩된 `q` 배열로 자세가 바뀌는지 수동 확인 + 스냅샷.

### Phase 5 — Pose 패널 + IK 연동 (1d)
1. `hooks/useTelemetry.ts` : `/ws/telemetry` 구독, `q`/`p` 상태 제공, 재연결 백오프, `connected` 플래그.
2. `components/PosePanel.tsx` : `p` 를 X,Y,Z,Rx,Ry,Rz 로 라벨링해 표시. 입력폼(숫자 6칸) + "적용" 버튼 → `POST /api/ik` (`init_jpos` = 현재 `q`) → 성공 시 `jointTween` 트리거, 실패 시 에러 표시.
3. `components/StatusBar.tsx` : `connected`, `mode`(real/mock), 시뮬레이션 배지.
4. `App.tsx` 레이아웃 : 좌측 3D 뷰어(flex-grow), 우측 패널.
- **검증**: AC-F2, F3, F5. 프론트 mock 백엔드 상대 수동 확인.

### Phase 6 — 실시간 미러링 + 통합 + 데모 (1d)
1. 텔레메트리 `q` → 매 프레임 `setJoints` (tween 진행 중이 아닐 때). tween 중에는 사용자 IK 애니메이션 우선.
2. real 모드로 192.168.3.4 시뮬레이션 연결, 시뮬레이터에서 관절 움직여 미러링 확인 (AC-F4, AC-E3).
3. `tests/e2e/` Playwright 시나리오 (AC-E1), CI 에서 mock 백엔드로 실행.
4. `README.md` : 실행법, 아키텍처 다이어그램, 스크린샷/gif (AC-E2). `docker-compose.yml` (선택).
- **검증**: 전체 AC 재확인, `make test` 그린.

**총 추정: 약 8 개발일 (1인 기준)**

---

## 6. 리스크와 완화책

| # | 리스크 | 영향 | 완화책 |
|---|-------|------|-------|
| RK1 | 데모 현장에서 192.168.3.4 컨트롤러 미도달 | 시연 불가 | MockRobot 자동 폴백(AC-B6). `USE_MOCK=1` 강제 토글. 데모 전 mock 모드로 리허설. |
| RK2 | 오일러각 규약(Rx,Ry,Rz 순서/고정vs가동) 불일치로 자세가 틀리게 보임 | R2/R3 부정확 | **결정 3으로 대부분 해소** — 컨트롤러 원값을 변환 없이 표시/입력, SDK `inverse_kin`/`forward_kin` 만 사용. 헬스체크에서 `forward_kin(q)` vs `p` 왕복 검증(AC-B3). |
| RK3 | `indy7.urdf` mesh 경로 하드코딩(`file:///...`) → 브라우저에서 로드 실패 | 3D 안 보임 | Phase 1 자산 파이프라인이 경로 재작성. URDF 텍스트 검증 단계 포함. STL은 three.js 기본 지원. |
| RK4 | `neuromeka` 패키지가 gRPC 의존 — Windows 설치/빌드 문제 | 백엔드 실행 불가 | 버전 핀. **Windows 네이티브 우선**(uv), 실패 시 WSL2 절차를 README에 대안 문서화. CI는 리눅스. Phase 0에서 Windows 설치를 가장 먼저 검증. |
| RK5 | IK가 특이점/한계에서 실패 또는 비현실적 해 반환 | 잘못된 애니메이션 | 422 처리(AC-B4). 프론트에서 관절 한계(URDF `<limit>`) 초과 시 경고. `init_jpos`=현재 자세로 연속해 안정. |
| RK6 | 20Hz gRPC 폴링이 컨트롤러/네트워크에 부하 | 텔레메트리 지연 | 폴링 주기 설정화(`TELEMETRY_HZ`). `get_control_data` 단일 호출로 q+p 동시 취득. 느린 클라이언트 프레임 드롭. |
| RK7 | urdf-loader / three.js 버전 비호환 | 빌드 깨짐 | 정확한 버전 핀(three, urdf-loader). 업그레이드는 별도 작업. |
| RK8 | 로봇 모델이 Indy7이 아닐 수 있음(Indy12/IndyRP2 등) | 형상 불일치 | `INDY_MODEL` 설정값. `get_robot_data`/컨트롤러 모델 조회로 확인. 자산 스크립트가 모델 파라미터화. 기본 indy7. |

---

## 7. 검증 절차 (최종)

1. `cd backend && uv run pytest -v` → 전 항목 통과, 커버리지 리포트 ≥ 70%.
2. `cd frontend && pnpm build` → 에러 0, `pnpm exec tsc --noEmit` 통과.
3. `make dev` (mock 모드) → 브라우저에서:
   - 로봇 렌더링 + OrbitControls 동작 (AC-F1)
   - PosePanel 6값 표시 + 텔레메트리 갱신 (AC-F2)
   - 좌표 입력 → 자세 애니메이션 (AC-F3)
   - WS 강제 종료 → 상태 표시 + 재연결 (AC-F5)
4. `INDY_HOST=192.168.3.4 make dev` (real 모드, 시뮬레이션):
   - `/api/health` `mode:"real", connected:true` (AC-B1)
   - 시뮬레이터 관절 이동 → 3D 미러링 ≤ 200ms (AC-F4)
   - `forward_kin(q)` vs `/api/pose` 왕복 오차 확인 (AC-B3, RK2)
   - `set_simulation_mode(True)` 호출 로그 확인 (AC-B7)
5. `pnpm exec playwright test` (mock 백엔드) → E2E 시나리오 통과 (AC-E1).
6. `README.md` 지시대로 클린 클론에서 실행 재현 + 스크린샷/gif 존재 확인 (AC-E2).
7. 하드웨어 수동 체크리스트 완료 기록 (AC-E3).

---

## 8. 디자인 방향 — Direction A "Control Room" (다크 산업 HMI)

프론트엔드는 아래 디자인 시스템을 따른다. 레퍼런스 목업: `design/Main.dc.html` (정적, 로봇 그림/좌표값은 플레이스홀더).

### 디자인 토큰

| 역할 | 값 |
|------|-----|
| 앱 배경 | `#0d1012` |
| 패널/헤더 배경 | `#12171a` |
| 경계선 | `#232c31` (진한), `#2b363b` (입력 필드) |
| 본문 텍스트 | `#cdd6d9` |
| 보조 텍스트 | `#7c8a90` |
| 강조(primary) | teal `#46d6c0` — 라이브 값, 관절 바, APPLY 버튼, 로고 도트 |
| 경고/시뮬레이션 | amber `#f2b03d` — SIMULATION 배지, TCP 마커 |
| 연결 OK | green `#4ade80` — LINKED 인디케이터 |
| 뷰포트 배경 | `radial-gradient(circle at 44% 36%, #16201f, #0a0d0f 72%)` + teal 격자 오버레이 `rgba(70,214,192,.055)` 46px |

### 타이포그래피 (Google Fonts)

- **Space Grotesk** (600) — 워드마크, 버튼 라벨. letter-spacing `.12–.14em` 대문자.
- **IBM Plex Sans** (400/500/600) — 일반 UI 라벨.
- **JetBrains Mono** (400/500) — **모든 수치 데이터** (좌표값, 관절각, 호스트 IP, 입력 필드). 라이브 값은 teal, 크기 ~19px.

### 레이아웃

- **헤더 (높이 56px)**: 좌측 = teal 글로우 도트 + `INDY7 · DIGITAL TWIN`. 우측 = `SIMULATION` 배지(amber 아웃라인 pill) + `192.168.3.4`(mono, muted) + green 도트 + `LINKED`.
- **본문 = 좌우 분할**:
  - **좌: 3D 뷰포트** (flex-grow). radial-gradient 배경 + teal 격자. 좌상단 오버레이 = `TCP · [ 350.2, −12.8, 521.6 ] mm` (mono, teal). 좌하단 = X/Y/Z 좌표축 트라이어드(빨강 X / 초록 Z / 파랑 Y). 우하단 = `DRAG · ORBIT   SCROLL · ZOOM` 힌트(muted). three.js 씬: 다크, 은은한 grid floor, 관절에 teal 포인트, TCP에 amber 마커.
  - **우: 계기 패널 (폭 388px)**, `#12171a` 배경, `border-left`. 섹션 헤더는 mono 10.5px `letter-spacing:.2em` muted:
    1. **`TCP POSE / LIVE`** — 3×2 그리드 값 셀. 각 셀: 라벨(`X · mm`) + 큰 mono teal 값. 순서 X, Y, Z, Rx, Ry, Rz.
    2. **`TARGET POSE`** — 3×2 입력 필드 그리드(다크 배경, mono) + 풀폭 `APPLY TARGET` 버튼(teal 배경, 다크 텍스트, Space Grotesk 600).
    3. **`JOINTS · deg`** — J1~J6 행. 각 행: 라벨 + 트랙 바(`#1c2327` 트랙, teal 채움, −180°~180°를 0~100%로 매핑) + 우측 정렬 mono 값.
    4. **푸터** — `manipulability 0.72` / `Δ 0.0 mm` (mono, muted, 상단 경계선).

### 상태 표현

- 연결 상태(real/mock/sim)는 헤더 배지로. `mock` 모드 = green 도트 대신 amber `MOCK` 배지 + `SIMULATION` 유지.
- IK 실패 = TARGET POSE 섹션 하단에 amber 인라인 메시지, 로봇 미이동.
- WS 끊김 = LINKED → `RECONNECTING…`(amber, 점멸), 좌표값 dim 처리.

### 반응형

- 데스크톱 우선(1440×900 기준 디자인). 최소 1024px까지 우측 패널 폭 유지, 뷰포트만 축소. 그 이하는 P0 범위 밖(패널을 하단으로 스택하는 것은 P1).

---

## 9. 이 계획에서 명시적으로 제외 (P1 이후)

관절 보간 세부 튜닝을 넘는 경로 계획, Pick/Place 그리퍼·물체 부착 시각화, pallet2x2 좌표 시퀀스, 재생/일시정지/리셋·배속 컨트롤, 그리퍼 무게(0.4kg) 부하 표시, 실제 로봇 모션 명령(`movej`/`movel`) 실행, 충돌/경로 이탈 감지, 시퀀스 편집기, 다크/라이트 모드 토글, 인증/다중 사용자.

---

## 10. 확정된 결정 (인터뷰 2차)

1. **로봇 모델 = Indy7** 고정. `urdf_files/indy7.urdf` 사용. `INDY_MODEL` 설정값은 유지하되 기본/유일 검증 대상은 indy7. 자동 감지는 불필요.
2. **백엔드 실행 = Windows 네이티브 우선.** `uv` 로 Windows에서 직접 실행. `neuromeka`/gRPC 설치가 Windows에서 실패할 경우에 한해 WSL2 실행 절차를 README에 대안으로 문서화. Docker는 이번 범위에서 필수 아님(`docker-compose.yml` 선택 항목으로 격하).
3. **오일러각 = 컨트롤러 원값 그대로(deg).** `get_control_data().p` 의 Rx,Ry,Rz 를 변환 없이 표시. 입력도 동일 규약으로 받아 `inverse_kin` 에 그대로 전달. 규약 변환 로직 없음 → RK2 위험이 크게 감소.
4. **배포 = 로컬 실행만.** 정적 호스팅/공유 URL 불필요. AC-E2는 README + 스크린샷/gif 로 충족. `frontend/public/robot/` 자산은 리포에 커밋(오프라인 실행 보장).
