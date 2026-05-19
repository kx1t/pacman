import json
import os
from pathlib import Path
from threading import Lock
import re
from typing import Optional

from flask import Flask, jsonify, render_template, request, url_for


app = Flask(__name__)
score_lock = Lock()

DEFAULT_HIGH_SCORE = {
    "score": 0,
    "name": "N/A",
}

DEFAULT_GAME_CONFIG = {
    "rows": 31,
    "cols": 28,
    "palette": {
        "wall": "#0d1047",
        "path": "#000000",
        "pacman": "#ffffff",
        "pellet": "#ff80c8",
        "superPellet": "#ff0000",
        "border": "#ffffff",
    },
}

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def forwarded_prefix() -> str:
    raw = (request.headers.get("X-Forwarded-Prefix") or "").strip()
    if not raw:
        return ""
    if not raw.startswith("/"):
        raw = f"/{raw}"
    return raw.rstrip("/")


def prefixed_path(path: str) -> str:
    prefix = forwarded_prefix()
    if not prefix:
        return path
    if path == prefix or path.startswith(f"{prefix}/"):
        return path
    if path.startswith("/"):
        return f"{prefix}{path}"
    return f"{prefix}/{path}"


def high_score_file() -> Path:
    return Path(os.getenv("HIGH_SCORE_FILE", "/data/highscore.json"))


def get_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


def get_color_env(name: str, default: str) -> str:
    value = (os.getenv(name, default) or "").strip()
    if HEX_COLOR_RE.match(value):
        return value.lower()
    return default


def normalize_dimension(raw_value: Optional[str], default: int, minimum: int, maximum: int) -> int:
    if raw_value is None:
        value = default
    else:
        try:
            value = int(raw_value)
        except ValueError:
            value = default
    clamped = max(minimum, min(maximum, value))
    if clamped % 2 == 0:
        clamped -= 1
    return max(minimum, clamped)


def game_config(rows_override: Optional[str] = None, cols_override: Optional[str] = None) -> dict:
    return {
        "rows": normalize_dimension(
            rows_override,
            get_int_env("MAZE_ROWS", DEFAULT_GAME_CONFIG["rows"], 21, 61),
            21,
            61,
        ),
        "cols": normalize_dimension(
            cols_override,
            get_int_env("MAZE_COLS", DEFAULT_GAME_CONFIG["cols"], 21, 61),
            21,
            61,
        ),
        "palette": {
            "wall": get_color_env("COLOR_WALL", DEFAULT_GAME_CONFIG["palette"]["wall"]),
            "path": get_color_env("COLOR_PATH", DEFAULT_GAME_CONFIG["palette"]["path"]),
            "pacman": get_color_env("COLOR_PACMAN", DEFAULT_GAME_CONFIG["palette"]["pacman"]),
            "pellet": get_color_env("COLOR_PELLET", DEFAULT_GAME_CONFIG["palette"]["pellet"]),
            "superPellet": get_color_env(
                "COLOR_SUPER_PELLET", DEFAULT_GAME_CONFIG["palette"]["superPellet"]
            ),
            "border": get_color_env("COLOR_BORDER", DEFAULT_GAME_CONFIG["palette"]["border"]),
        },
    }


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
    rows_override = request.args.get("rows")
    cols_override = request.args.get("cols")
    return render_template(
        "index.html",
        game_config=game_config(rows_override=rows_override, cols_override=cols_override),
        favicon_url=prefixed_path(url_for("static", filename="favicon.svg")),
        styles_url=prefixed_path(url_for("static", filename="css/styles.css")),
        game_js_url=prefixed_path(url_for("static", filename="js/game.js")),
        high_score_api_url=prefixed_path(url_for("get_high_score")),
        reset_high_score_api_url=prefixed_path(url_for("reset_high_score")),
    )


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


@app.post("/api/highscore/reset")
def reset_high_score():
    with score_lock:
        payload = write_high_score(DEFAULT_HIGH_SCORE["score"], DEFAULT_HIGH_SCORE["name"])
    return jsonify(payload)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "80")), debug=True)
