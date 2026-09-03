"""Telemetry WebSocket: frame shape, rate, and multi-client fan-out."""

from __future__ import annotations

import json
import time


def test_frame_shape(client):
    with client.websocket_connect("/ws/telemetry") as ws:
        frame = json.loads(ws.receive_text())
    assert set(frame) == {"q", "p", "ts"}
    assert len(frame["q"]) == 6 and len(frame["p"]) == 6


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
