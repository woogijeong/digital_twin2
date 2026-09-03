"""REST endpoint contract, exercised against MockRobot."""

from __future__ import annotations


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["mode"] == "mock"
    assert body["connected"] is True
    assert body["model"] == "indy7"
    assert "host" in body  # informational; not dialled in mock mode


def test_pose_returns_six_numbers(client):
    r = client.get("/api/pose")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"x", "y", "z", "rx", "ry", "rz"}
    assert all(isinstance(v, (int, float)) for v in body.values())


def test_state_shape(client):
    r = client.get("/api/state")
    assert r.status_code == 200
    body = r.json()
    assert len(body["q"]) == 6
    assert len(body["p"]) == 6


def test_ik_reachable_target_returns_six_joints(client):
    tpos = [350.2, -12.8, 520.0, 178.4, 1.2, -90.0]
    r = client.post("/api/ik", json={"tpos": tpos, "init_jpos": [0, -20, 90, 0, 70, 0]})
    assert r.status_code == 200
    jpos = r.json()["jpos"]
    assert len(jpos) == 6
    assert all(abs(v) < 180 for v in jpos)


def test_ik_unreachable_target_is_422(client):
    r = client.post(
        "/api/ik", json={"tpos": [5000, 0, 0, 0, 0, 0], "init_jpos": [0, 0, 0, 0, 0, 0]}
    )
    assert r.status_code == 422
    assert r.json()["detail"]["error"] == "ik_failed"


def test_ik_rejects_wrong_length(client):
    r = client.post("/api/ik", json={"tpos": [1, 2, 3], "init_jpos": [0, 0, 0, 0, 0, 0]})
    assert r.status_code == 422
