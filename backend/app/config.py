"""Runtime configuration, sourced from environment variables (prefix ``INDY_``)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="INDY_", env_file=".env", extra="ignore")

    host: str = "192.168.3.4"
    """IndyDCP3 controller / simulator address."""

    model: str = "indy7"
    """Robot model. Only ``indy7`` is validated for P0."""

    use_mock: bool = False
    """Force the mock robot even when a controller is reachable."""

    connect_timeout_s: float = 3.0
    """Seconds to wait for the controller before falling back to mock."""

    telemetry_hz: float = 20.0
    """Telemetry broadcast rate for ``/ws/telemetry``."""


settings = Settings()
