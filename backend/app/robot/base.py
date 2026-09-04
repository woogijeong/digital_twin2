"""Robot service abstraction.

Both the real IndyDCP3-backed service and the offline mock implement
:class:`RobotService`, so the rest of the app never branches on which one is live.
"""

from __future__ import annotations

import abc
from collections.abc import AsyncIterator

from app.schemas import PoseDTO, TelemetryFrame


class RobotUnavailable(RuntimeError):
    """Raised when a controller connection cannot be established."""


class IkFailed(ValueError):
    """Raised when inverse kinematics has no usable solution for a target."""


class MotionNotPermitted(RuntimeError):
    """Raised when motion is requested against a service that must not move the
    real robot. P0 only commands the offline mock."""


class RobotService(abc.ABC):
    """Read-only-plus-IK view of a 6-DOF Indy robot.

    P0 never commands real motion (no ``movej`` / ``movel``); it only reads
    state and asks the controller to solve kinematics.
    """

    mode: str  # "real" | "mock"

    @abc.abstractmethod
    async def connect(self) -> None: ...

    @abc.abstractmethod
    async def close(self) -> None: ...

    @property
    @abc.abstractmethod
    def connected(self) -> bool: ...

    @abc.abstractmethod
    async def get_pose(self) -> PoseDTO:
        """Current TCP pose (mm, deg)."""

    @abc.abstractmethod
    async def get_joints(self) -> list[float]:
        """Current joint angles, deg, in joint0..joint5 order."""

    @abc.abstractmethod
    async def solve_ik(self, tpos: list[float], init_jpos: list[float]) -> list[float]:
        """Joint solution (deg) for a target pose, seeded from ``init_jpos``.

        Raises :class:`IkFailed` when there is no usable solution.
        """

    @abc.abstractmethod
    async def forward_kin(self, jpos: list[float]) -> list[float]:
        """TCP pose (mm, deg) for a joint configuration."""

    @abc.abstractmethod
    async def home(self) -> list[float]:
        """Send the twin to its home pose; return the home joint angles (deg).

        Raises :class:`MotionNotPermitted` for services that mirror a real
        controller -- P0 only ever commands the offline mock.
        """

    @abc.abstractmethod
    def stream(self) -> AsyncIterator[TelemetryFrame]:
        """Infinite async iterator of telemetry frames at the configured rate."""
