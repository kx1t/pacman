from app import app


def test_index_page_loads():
    client = app.test_client()
    response = client.get("/")

    assert response.status_code == 200
    assert b"Pacman Simulator" in response.data
