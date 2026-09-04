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
    HealthResponse,
    IkRequest,
    IkResponse,
    PoseDTO,
    StateResponse,
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
    )


async def _swap_robot(request: Request, new: RobotService, host: str) -> None:
    """Make ``new`` the live robot: repoint telemetry, then close the old one."""
    app = request.app
    old = app.state.robot
    app.state.robot = new
    app.state.active_host = host
    await app.state.telemetry_hub.swap(new)
    if old is not new:
        await old.close()


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    return _health(request)


@router.get("/pose", response_model=PoseDTO)
async def pose(request: Request) -> PoseDTO:
    return await _robot(request).get_pose()


@router.get("/state", response_model=StateResponse)
async def state(request: Request) -> StateResponse:
    robot = _robot(request)
    q = await robot.get_joints()
    p = (await robot.get_pose()).as_list()
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
