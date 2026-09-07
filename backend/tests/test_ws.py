"""Telemetry WebSocket: frame shape, rate, and multi-client fan-out."""

from __future__ import annotations

import json
import time


def test_frame_shape(client):
    with client.websocket_connect("/ws/telemetry") as ws:
        frame = json.loads(ws.receive_text())
    assert set(frame) == {
        "q",
        "p",
        "ts",
        "manipulability",
        "error",
        "link_ok",
        "robot_connected",
        "gripper_open",
        "suction_on",
    }
    assert len(frame["q"]) == 6 and len(frame["p"]) == 6
    assert frame["link_ok"] is True and frame["robot_connected"] is True


def test_rate_is_about_20hz(client):
    with client.websocket_connect("/ws/telemetry") as ws:
        ws.receive_text()  # prime
        start = time.time()
        n = 0
        while time.time() - start < 1.0:
            ws.receive_text()
            n += 1
    assert 15 <= n <= 25, f"expected ~20 frames/s, got {n}"


def test_two_clients_both_receive(client):
    with client.websocket_connect("/ws/telemetry") as a, client.websocket_connect(
        "/ws/telemetry"
    ) as b:
        fa = json.loads(a.receive_text())
        fb = json.loads(b.receive_text())
    assert len(fa["q"]) == 6 and len(fb["q"]) == 6


def test_one_disconnect_does_not_break_the_other(client):
    with client.websocket_connect("/ws/telemetry") as a:
        with client.websocket_connect("/ws/telemetry") as b:
            b.receive_text()
        # b closed; a keeps streaming
        for _ in range(5):
            json.loads(a.receive_text())


def test_stream_error_does_not_freeze_telemetry(monkeypatch):
    """A transient stream error must not permanently kill the hub (D1)."""
    import app.api.telemetry_ws as tw
    from app.main import app
    from app.robot.mock import MockRobot

    monkeypatch.setattr(tw, "_STREAM_RETRY_BACKOFF_S", 0.05)

    calls = {"n": 0}
    real_stream = MockRobot.stream

    def flaky_stream(self):
        calls["n"] += 1
        if calls["n"] == 1:
            async def boom():
                raise RuntimeError("simulated gRPC hiccup")
                yield  # pragma: no cover
            return boom()
        return real_stream(self)

    monkeypatch.setattr(MockRobot, "stream", flaky_stream)

    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        with c.websocket_connect("/ws/telemetry") as ws:
            # first stream() raised; after the backoff the hub re-opens it
            frame = json.loads(ws.receive_text())
            assert len(frame["q"]) == 6
    assert calls["n"] >= 2
