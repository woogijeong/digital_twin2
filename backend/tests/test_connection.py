"""Connection control (/connect, /disconnect) and /home."""

from __future__ import annotations

import json
import sys
from unittest.mock import MagicMock


def _fake_neuromeka(monkeypatch) -> MagicMock:
    indy = MagicMock()
    indy.get_control_data.return_value = {"q": [0.0] * 6, "p": [0.0] * 6, "op_state": 5}
    indy.get_control_state.return_value = {"manipulability": 0.5}
    module = MagicMock()
    module.IndyDCP3.return_value = indy
    monkeypatch.setitem(sys.modules, "neuromeka", module)
    return indy


def test_home_on_mock_returns_the_ready_pose(client):
    r = client.post("/api/home")
    assert r.status_code == 200
    assert r.json()["jpos"] == [0.0, 0.0, -90.0, 0.0, -90.0, 0.0]


def test_disconnect_stays_on_mock(client):
    r = client.post("/api/disconnect")
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "mock" and body["connected"] is True


def test_connect_failure_reports_502(client, monkeypatch):
    fake = MagicMock()
    fake.IndyDCP3.side_effect = OSError("no route to host")
    monkeypatch.setitem(sys.modules, "neuromeka", fake)

    r = client.post("/api/connect", json={"host": "10.0.0.9"})
    assert r.status_code == 502
    assert r.json()["detail"]["error"] == "connect_failed"
    # still on the mock after a failed dial
    assert client.get("/api/health").json()["mode"] == "mock"


def test_connect_then_disconnect_round_trip(client, monkeypatch):
    indy = _fake_neuromeka(monkeypatch)

    r = client.post("/api/connect", json={"host": "10.0.0.9"})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "real"
    assert body["host"] == "10.0.0.9"
    indy.set_simulation_mode.assert_not_called()  # connecting never changes the controller mode

    # telemetry keeps flowing from the newly connected controller
    with client.websocket_connect("/ws/telemetry") as ws:
        frame = json.loads(ws.receive_text())
        assert len(frame["q"]) == 6

    r = client.post("/api/disconnect")
    assert r.status_code == 200
    assert r.json()["mode"] == "mock"
    assert client.get("/api/health").json()["host"] == "192.168.3.4"


def test_home_against_the_real_controller_is_409(client, monkeypatch):
    _fake_neuromeka(monkeypatch)
    assert client.post("/api/connect", json={"host": "10.0.0.9"}).status_code == 200

    r = client.post("/api/home")
    assert r.status_code == 409
    assert r.json()["detail"]["error"] == "motion_not_permitted"


def test_recover_clears_a_fault_on_the_real_controller(client, monkeypatch):
    indy = _fake_neuromeka(monkeypatch)
    assert client.post("/api/connect", json={"host": "10.0.0.9"}).status_code == 200

    r = client.post("/api/recover")
    assert r.status_code == 200
    indy.recover.assert_called_once()


def test_recover_on_mock_is_a_harmless_no_op(client):
    assert client.post("/api/recover").status_code == 200
