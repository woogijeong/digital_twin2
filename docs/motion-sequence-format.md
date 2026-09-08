# 모션 시퀀스 JSON 형식 (MOTION SEQUENCE 패널)

`MOTION SEQUENCE` 패널(사이드바)은 **mock 모드**에서 JSON 스텝 배열을 붙여넣어
3D 트윈을 재생합니다. 이 문서는 그 형식과, 파이썬 로봇 코드를 이 형식으로
바꾸는 방법을 정리합니다.

- 파서/검증: `frontend/src/sequence.ts`
- 컴파일(재생 전 IK 사전 풀이): `frontend/src/sequenceCompile.ts`
- 바로 붙여넣어 볼 수 있는 예시: [`docs/sequences/`](sequences/)

---

## 형식

최상위는 **스텝 객체의 JSON 배열**입니다. 좌표 단위는 앱 전체와 동일합니다:
길이 **mm**, 각도 **deg**, 오리엔테이션은 컨트롤러가 보고하는 것과 같은
**fixed-axis XYZ 오일러** (`R = Rz(rz)·Ry(ry)·Rx(rx)`).

| 스텝 | 필드 | 의미 |
| --- | --- | --- |
| `movej` | `jpos`: 숫자 6개 (deg) | 관절 이동 (J1..J6) |
| `movel` | `pose`: 숫자 6개 `[x,y,z,rx,ry,rz]`<br>`frame`: `"abs"` \| `"rel"` \| `"tool"` (기본 `"abs"`) | 직교 이동. `rel`/`tool`은 **직전 스텝의 포즈** 기준 |
| `gripper` | `open`: `true`/`false` | 그리퍼 열기/닫기 (3D 손가락 + Pick/Place 시각화) |
| `suction` | `on`: `true`/`false` | 석션 on/off |
| `wait` | `seconds`: `> 0`, `≤ 30` | 스텝 사이 지연 |
| `home` | (없음) | 홈(레디) 자세로 |
| `tool` | `tool`: `"none"` \| `"suction"` \| `"gripper"` | 장착 엔드이펙터 전환 (TCP 오프셋 변경) |

### `frame` (movel 전용)

- `abs` — base frame 절대 포즈 (기본값). 파이썬의 `movel(tpos)`와 1:1.
- `rel` — 직전 포즈에서 base 축 방향으로의 오프셋. `[0,0,-50,0,0,0]` = base −Z로 50mm.
- `tool` — 직전 포즈에서 **툴이 향한 방향** 기준 오프셋. `[0,0,50,0,0,0]` = 접근 방향으로 50mm 전진(하강).

### 규칙 / 제약

- **재생은 mock 모드 전용.** 실기 연결 시 `PLAY` 비활성 (RESET TO HOME이 real에서 잠기는 것과 동일). 어떤 스텝도 모션 엔드포인트를 호출하지 않음 — `/api/ik`(컴파일)와 `/api/home`(RESET)만 사용.
- **PLAY는 먼저 컴파일**합니다. 모든 `movej`/`movel`/`home`을 IK로 미리 풀어, 문제가 있으면 `step N: …`로 재생 전에 알려주고 아무것도 움직이지 않습니다:
  - 도달 불가 (`target unreachable …`)
  - 바닥 침범: 툴 팁 `z < 5mm` (`… below the floor clearance …`)
  - 관절 한계 초과: J1–J5 `±175°`, J6 `±215°`
- **`movej`/`home` 직후의 `rel`/`tool` `movel`은 컴파일 에러**입니다. 클라이언트에 FK가 없어 이전 포즈를 알 수 없기 때문 → 그 앞에 `frame:"abs"`인 `movel`을 두거나, 처음부터 절대 좌표를 쓰세요.
- 이동 1스텝은 기본 1초에 이징(배속으로 나눔). `wait`는 `seconds / 배속`.
- `movej`/`home`은 트윈만 애니메이션하고 mock 백엔드를 명령하지 않습니다. 그래서 시퀀스 실행 중엔 텔레메트리 미러링이 잠기고, `RESET`을 눌러야 다시 동기화됩니다.

---

## 파이썬 → JSON 변환

Neuromeka IndyDCP3 (또는 유사한) 파이썬 프로그램의 대응 관계:

| 파이썬 | JSON 스텝 |
| --- | --- |
| `indy.movej(jpos)` / `movej([...])` | `{ "type": "movej", "jpos": [j1,…,j6] }` |
| `indy.movel(tpos)` / `movel([x,y,z,u,v,w])` | `{ "type": "movel", "pose": [x,y,z,u,v,w] }` |
| 상대 이동 `movel(..., base_type=RELATIVE)` | `{ "type": "movel", "pose": [dx,…], "frame": "rel" }` |
| 툴 기준 접근/후퇴 | `{ "type": "movel", "pose": [0,0,dz,0,0,0], "frame": "tool" }` |
| `indy.set_do([(0, True),(1, False)])` (그리퍼 열기) | `{ "type": "gripper", "open": true }` |
| `indy.set_do([(0, False),(1, True)])` (그리퍼 닫기) | `{ "type": "gripper", "open": false }` |
| `indy.set_do([(2, True)])` (석션 on) | `{ "type": "suction", "on": true }` |
| `indy.set_do([(2, False)])` (석션 off) | `{ "type": "suction", "on": false }` |
| `time.sleep(0.5)` | `{ "type": "wait", "seconds": 0.5 }` |
| `indy.go_home()` / `movej(home)` | `{ "type": "home" }` |
| 툴 장착/해제 | `{ "type": "tool", "tool": "gripper" }` |

무시해도 되는 것: 속도/가속 인자(`vel_ratio`, `blending` 등), `wait_for_motion_done`,
연결/모드 설정, 로깅. 속도는 패널의 배속으로 조절합니다.

### AI에게 그대로 붙여넣는 프롬프트

> 아래 Neuromeka Indy7 파이썬 프로그램을, 디지털 트윈 "MOTION SEQUENCE" 패널이
> 읽는 JSON 모션 시퀀스로 변환해줘.
>
> **출력은 JSON 배열 하나만.** 코드블록도 설명도 붙이지 마.
>
> 스텝 형식:
> - `{ "type": "movej", "jpos": [j1..j6] }` — 관절각 deg 6개
> - `{ "type": "movel", "pose": [x,y,z,rx,ry,rz] }` — mm, deg (fixed-axis XYZ 오일러). base frame 절대 좌표
> - 상대 이동이면 `"frame": "rel"`, 툴 기준이면 `"frame": "tool"` 추가 (기본은 절대)
> - `{ "type": "gripper", "open": true|false }` — DO0/DO1 그리퍼 (열림=true)
> - `{ "type": "suction", "on": true|false }` — DO2 석션
> - `{ "type": "wait", "seconds": N }` — 0 초과 30 이하
> - `{ "type": "home" }` — 홈 복귀
> - `{ "type": "tool", "tool": "none"|"suction"|"gripper" }` — 툴 전환
>
> 규칙:
> - 속도/가속/블렌딩 인자, 연결·모드 설정, 로깅은 무시.
> - `set_do`로 그리퍼/석션을 토글하면 각각 `gripper`/`suction` 스텝으로. DO0 HIGH = 그리퍼 열림, DO2 HIGH = 석션 on.
> - `time.sleep(s)` → `wait`.
> - `movej`/`home` **바로 다음**에는 `frame:"rel"`/`"tool"` movel을 쓰지 말고 절대 좌표(`frame:"abs"`)를 써.
> - 좌표는 로봇 base frame 기준 그대로. 단위 변환하지 마 (이미 mm/deg).
>
> ```python
> # ← 여기에 파이썬 코드
> ```

---

## 예시

- [`sequences/01-three-moves.json`](sequences/01-three-moves.json) — home → movej → movel(abs) → tool 프레임 후퇴
- [`sequences/02-pick-and-place.json`](sequences/02-pick-and-place.json) — 그리퍼로 워크피스 집어 옮기기 (Pick/Place 시각화 연동)
- [`sequences/03-palletize-2x2.json`](sequences/03-palletize-2x2.json) — 석션으로 2×2 팔레타이징

패널의 `3-MOVE` / `PICK+PLACE` 버튼으로도 예시를 바로 넣을 수 있습니다.
