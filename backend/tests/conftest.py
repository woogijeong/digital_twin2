import os

os.environ.setdefault("INDY_USE_MOCK", "1")

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c
