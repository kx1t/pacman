import json
import os
from pathlib import Path
from threading import Lock

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)
score_lock = Lock()

DEFAULT_HIGH_SCORE = {
    "score": 0,
    "name": "N/A",
}


def high_score_file() -> Path:
    return Path(os.getenv("HIGH_SCORE_FILE", "/data/highscore.json"))


def read_high_score() -> dict:
    path = high_score_file()
    if not path.exists():
        return DEFAULT_HIGH_SCORE.copy()

    try:
        with path.open("r", encoding="utf-8") as fp:
            payload = json.load(fp)
    except (json.JSONDecodeError, OSError):
        return DEFAULT_HIGH_SCORE.copy()

    score = payload.get("score", 0)
    name = payload.get("name", "N/A")
    if not isinstance(score, int) or score < 0:
        score = 0
    if not isinstance(name, str) or not name.strip():
        name = "N/A"

    return {
        "score": score,
        "name": name.strip(),
    }


def write_high_score(score: int, name: str) -> dict:
    path = high_score_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "score": score,
        "name": (name.strip() or "Player"),
    }
    with path.open("w", encoding="utf-8") as fp:
        json.dump(payload, fp)
    return payload


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/highscore")
def get_high_score():
    with score_lock:
        payload = read_high_score()
    return jsonify(payload)


@app.post("/api/highscore")
def post_high_score():
    data = request.get_json(silent=True) or {}
    raw_score = data.get("score", -1)
    raw_name = data.get("name", "")

    if not isinstance(raw_score, int) or raw_score < 0:
        return jsonify({"error": "score must be a non-negative integer"}), 400
    if not isinstance(raw_name, str):
        return jsonify({"error": "name must be a string"}), 400

    with score_lock:
        current = read_high_score()
        should_update = raw_score > current["score"] or (
            raw_score == current["score"] and current["name"] in ("", "N/A")
        )

        if should_update:
            current = write_high_score(raw_score, raw_name)

    return jsonify(current)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "80")), debug=True)
