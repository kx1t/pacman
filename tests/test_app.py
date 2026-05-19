from app import app


def test_index_page_loads():
    client = app.test_client()
    response = client.get("/")

    assert response.status_code == 200
    assert b"Pacman Simulator" in response.data


def test_index_paths_respect_forwarded_prefix():
    client = app.test_client()
    response = client.get("/", headers={"X-Forwarded-Prefix": "/pacman"})

    assert response.status_code == 200
    assert b'href="/pacman/static/css/styles.css"' in response.data
    assert b'src="/pacman/static/js/game.js"' in response.data
    assert b'data-high-score-api-url="/pacman/api/highscore"' in response.data


def test_index_applies_query_field_size_overrides():
    client = app.test_client()
    response = client.get("/?rows=40&cols=52")

    assert response.status_code == 200
    assert b'&#34;rows&#34;: 39' in response.data
    assert b'&#34;cols&#34;: 51' in response.data


def test_high_score_defaults_when_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("HIGH_SCORE_FILE", str(tmp_path / "highscore.json"))
    client = app.test_client()

    response = client.get("/api/highscore")
    assert response.status_code == 200
    assert response.get_json() == {"score": 0, "name": "N/A"}


def test_high_score_persists_to_file(monkeypatch, tmp_path):
    target = tmp_path / "highscore.json"
    monkeypatch.setenv("HIGH_SCORE_FILE", str(target))
    client = app.test_client()

    post_response = client.post("/api/highscore", json={"score": 77, "name": "Ramon"})
    assert post_response.status_code == 200
    assert post_response.get_json() == {"score": 77, "name": "Ramon"}

    get_response = client.get("/api/highscore")
    assert get_response.status_code == 200
    assert get_response.get_json() == {"score": 77, "name": "Ramon"}
    assert target.exists()


def test_high_score_rejects_invalid_payload(monkeypatch, tmp_path):
    monkeypatch.setenv("HIGH_SCORE_FILE", str(tmp_path / "highscore.json"))
    client = app.test_client()

    response = client.post("/api/highscore", json={"score": -1, "name": "bad"})
    assert response.status_code == 400


def test_high_score_reset_endpoint(monkeypatch, tmp_path):
    target = tmp_path / "highscore.json"
    monkeypatch.setenv("HIGH_SCORE_FILE", str(target))
    client = app.test_client()

    update = client.post("/api/highscore", json={"score": 88, "name": "Player"})
    assert update.status_code == 200

    reset = client.post("/api/highscore/reset")
    assert reset.status_code == 200
    assert reset.get_json() == {"score": 0, "name": "N/A"}

    fetch = client.get("/api/highscore")
    assert fetch.status_code == 200
    assert fetch.get_json() == {"score": 0, "name": "N/A"}
