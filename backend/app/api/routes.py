"""REST endpoints: health, current pose, kinematics, home, connection control."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.robot.base import (
    IkFailed,
    MotionNotPermitted,
    RobotService,
    RobotUnavailable,
)
from app.robot.indy import IndyDCP3Robot
from app.robot.mock import MockRobot
from app.schemas import (
    ConnectRequest,
    GripperRequest,
    HealthResponse,
    IkRequest,
    IkResponse,
    PoseDTO,
    StateResponse,
    SuctionRequest,
    ToolRequest,
)

router = APIRouter(prefix="/api")


def _robot(request: Request) -> RobotService:
    return request.app.state.robot


def _active_host(request: Request) -> str:
    return getattr(request.app.state, "active_host", settings.host)


def _health(request: Request) -> HealthResponse:
    robot = _robot(request)
    return HealthResponse(
        mode=robot.mode,
        connected=robot.connected,
        model=settings.model,
        host=_active_host(request),
        tool=robot.tool,
    )


async def _swap_robot(request: Request, new: RobotService, host: str) -> None:
    """Make ``new`` the live robot: carry the tool over, repoint telemetry,
    then close the old one."""
    app = request.app
    old = app.state.robot
    await new.set_tool(getattr(app.state, "active_tool", "none"))
    app.state.robot = new
    app.state.active_host = host
    await app.state.telemetry_hub.swap(new)
    if old is not new:
        await old.close()


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    return _health(request)


def _unavailable(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={"error": "controller_unavailable", "detail": str(exc)},
    )


@router.get("/pose", response_model=PoseDTO)
async def pose(request: Request) -> PoseDTO:
    try:
        return await _robot(request).get_pose()
    except Exception as exc:  # noqa: BLE001 - controller/channel down; report it, don't 500
        raise _unavailable(exc) from exc


@router.get("/state", response_model=StateResponse)
async def state(request: Request) -> StateResponse:
    robot = _robot(request)
    try:
        q = await robot.get_joints()
        p = (await robot.get_pose()).as_list()
    except Exception as exc:  # noqa: BLE001 - controller/channel down; report it, don't 500
        raise _unavailable(exc) from exc
    return StateResponse(q=q, p=p)


@router.post("/ik", response_model=IkResponse)
async def ik(request: Request, body: IkRequest) -> IkResponse:
    try:
        jpos = await _robot(request).solve_ik(body.tpos, body.init_jpos)
    except IkFailed as exc:
        raise HTTPException(
            status_code=422, detail={"error": "ik_failed", "detail": str(exc)}
        ) from exc
    return IkResponse(jpos=jpos)


@router.post("/home", response_model=IkResponse)
async def home(request: Request) -> IkResponse:
    try:
        jpos = await _robot(request).home()
    except MotionNotPermitted as exc:
        raise HTTPException(
            status_code=409, detail={"error": "motion_not_permitted", "detail": str(exc)}
        ) from exc
    return IkResponse(jpos=jpos)


@router.post("/connect", response_model=HealthResponse)
async def connect(request: Request, body: ConnectRequest) -> HealthResponse:
    host = (body.host or settings.host).strip()
    real = IndyDCP3Robot(host)
    try:
        await real.connect()
    except RobotUnavailable as exc:
        raise HTTPException(
            status_code=502, detail={"error": "connect_failed", "detail": str(exc)}
        ) from exc
    await _swap_robot(request, real, host)
    return _health(request)


@router.post("/disconnect", response_model=HealthResponse)
async def disconnect(request: Request) -> HealthResponse:
    mock = MockRobot()
    await mock.connect()
    await _swap_robot(request, mock, settings.host)
    return _health(request)


@router.post("/tool", response_model=HealthResponse)
async def tool(request: Request, body: ToolRequest) -> HealthResponse:
    try:
        await _robot(request).set_tool(body.tool)
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail={"error": "bad_tool", "detail": str(exc)}
        ) from exc
    request.app.state.active_tool = body.tool
    return _health(request)


@router.post("/recover", response_model=HealthResponse)
async def recover(request: Request) -> HealthResponse:
    try:
        await _robot(request).recover()
    except RobotUnavailable as exc:
        raise HTTPException(
            status_code=502, detail={"error": "recover_failed", "detail": str(exc)}
        ) from exc
    return _health(request)


@router.post("/gripper")
async def gripper(request: Request, body: GripperRequest) -> dict:
    await _robot(request).set_gripper(body.open)
    return {"status": "ok", "open": body.open}


@router.post("/suction")
async def suction(request: Request, body: SuctionRequest) -> dict:
    await _robot(request).set_suction(body.on)
    return {"status": "ok", "on": body.on}


@router.post("/do/all-off")
async def all_do_off(request: Request) -> dict:
    """Drive every end-effector digital output LOW (gripper solenoids + suction)."""
    await _robot(request).set_all_do_off()
    return {"status": "ok"}


@router.post("/estop")
async def estop(request: Request) -> dict:
    """Emergency stop: command the controller to halt all motion immediately."""
    try:
        await _robot(request).emergency_stop()
    except RobotUnavailable as exc:
        raise HTTPException(
            status_code=502, detail={"error": "estop_failed", "detail": str(exc)}
        ) from exc
    return {"status": "ok"}
