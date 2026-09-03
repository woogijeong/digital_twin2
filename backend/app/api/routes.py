"""REST endpoints: health, current pose, inverse kinematics, full state."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.robot.base import IkFailed, RobotService
from app.schemas import (
    HealthResponse,
    IkRequest,
    IkResponse,
    PoseDTO,
    StateResponse,
)

router = APIRouter(prefix="/api")


def _robot(request: Request) -> RobotService:
    return request.app.state.robot


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    robot = _robot(request)
    return HealthResponse(
        mode=robot.mode,
        connected=robot.connected,
        model=settings.model,
    )


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
