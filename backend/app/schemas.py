"""Wire schemas shared by the REST and WebSocket layers."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ToolId = Literal["none", "suction", "gripper"]


class HealthResponse(BaseModel):
    status: str = "ok"
    mode: str = Field(description='"real" or "mock"')
    connected: bool
    model: str
    host: str = Field(description="controller address (informational; not dialled in mock mode)")
    tool: ToolId = Field(default="none", description="selected end-effector")


class PoseDTO(BaseModel):
    """TCP pose in controller-native units: mm for X/Y/Z, deg for Rx/Ry/Rz."""

    x: float
    y: float
    z: float
    rx: float
    ry: float
    rz: float

    def as_list(self) -> list[float]:
        return [self.x, self.y, self.z, self.rx, self.ry, self.rz]

    @classmethod
    def from_list(cls, p: list[float]) -> "PoseDTO":
        return cls(x=p[0], y=p[1], z=p[2], rx=p[3], ry=p[4], rz=p[5])


class IkRequest(BaseModel):
    tpos: list[float] = Field(min_length=6, max_length=6)
    init_jpos: list[float] = Field(min_length=6, max_length=6)


class IkResponse(BaseModel):
    jpos: list[float]


class ConnectRequest(BaseModel):
    host: str | None = Field(
        default=None, description="controller address to dial; defaults to INDY_HOST"
    )


class ToolRequest(BaseModel):
    tool: ToolId


class GripperRequest(BaseModel):
    open: bool


class SuctionRequest(BaseModel):
    on: bool


class StateResponse(BaseModel):
    q: list[float]
    p: list[float]


class TelemetryFrame(BaseModel):
    q: list[float]
    p: list[float]
    ts: float
    manipulability: float = Field(description="Yoshikawa index |det(J)| -- ~0 near a singularity")
    error: str | None = Field(
        default=None,
        description="active controller fault or link problem the operator should see, if any",
    )
    link_ok: bool = Field(
        default=True,
        description="telemetry is live from its source (real controller reachable); "
        "false while the twin has lost the controller and is reconnecting",
    )
    robot_connected: bool = Field(
        default=True,
        description="controller reports the physical arm attached (real mode only; "
        "always true for the mock)",
    )
    gripper_open: bool | None = Field(
        default=None,
        description="live gripper state from the controller's digital output DO0 "
        "(real mode); null when unknown or not wired, or in mock mode",
    )
    suction_on: bool | None = Field(
        default=None,
        description="live suction state from the controller's digital output DO2 "
        "(real mode); null when unknown or not wired, or in mock mode",
    )
    simulation: bool | None = Field(
        default=None,
        description="controller's own simulation-mode flag as reported by the "
        "controller (the twin never changes it); null in mock mode or while the "
        "link is down",
    )
