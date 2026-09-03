"""Pick a robot service at startup: real controller if reachable, else mock."""

from __future__ import annotations

import logging

from app.config import settings
from app.robot.base import RobotService, RobotUnavailable
from app.robot.indy import IndyDCP3Robot
from app.robot.mock import MockRobot

log = logging.getLogger("indy_twin.robot")


async def create_robot() -> RobotService:
    if settings.use_mock:
        log.info("INDY_USE_MOCK set - starting in mock mode")
        robot: RobotService = MockRobot()
        await robot.connect()
        return robot

    real = IndyDCP3Robot(settings.host)
    try:
        await real.connect()
        log.info("connected to controller %s (simulation mode)", settings.host)
        return real
    except RobotUnavailable as exc:
        log.warning("controller unavailable (%s) - falling back to mock mode", exc)
        mock = MockRobot()
        await mock.connect()
        return mock
