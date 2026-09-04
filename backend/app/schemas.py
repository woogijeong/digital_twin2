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


class StateResponse(BaseModel):
    q: list[float]
    p: list[float]


class TelemetryFrame(BaseModel):
    q: list[float]
    p: list[float]
    ts: float
