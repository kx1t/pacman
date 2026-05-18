# Pacman Web Simulator

Browser-based Pacman game simulation built with Flask and vanilla JavaScript.

## Features

- Randomly generated connected 28x31 maze.
- Reachable corridors rendered in white and non-reachable space rendered in dark blue.
- Two left/right side gates with wrap-around teleport for Pacman.
- Regular pellets on reachable cells with 10 random super-pellets.
- Ghost house in the center with top and bottom exits.
- Pacman movement with keyboard controls:
  - Left: `a`
  - Right: `s`
  - Up: `w`
  - Down: `z`
- Up to 6 ghosts that emerge from the center, chase Pacman with randomness, and cannot use gates.
- Super-pellet effect: ghosts flash for about 20 seconds and become edible.
- Score tracking:
  - Pellet: 1 point
  - Super-pellet: 10 points
  - Ghost eaten while flashing: 25 points
- Persistent high score and high scorer name stored in browser local storage.

## Run Locally

1. Create and activate a Python virtual environment.
2. Install dependencies into the venv.
3. Start the Flask app.

```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open <http://localhost:8000> (or the port specified in the dev server output).

**Note:** Local development always uses venv for isolation. Never run pip outside a venv on your machine.

## Docker

Build and run with Docker Compose (no venv used inside container):

```bash
cp .env.example .env
docker compose up --build
```

The app is exposed on `APP_PORT` from `.env` (default: 19999 maps to container port 80).

High scores persist via the `pacman_data` Docker volume at `/data/highscore.json`.

## Test

Ensure the venv is activated, then run tests:

```bash
source .venv/bin/activate
pytest -q
```

## Container Publishing

GitHub Actions workflow at `.github/workflows/container-ghcr.yml` builds multi-arch images for:

- `linux/amd64`
- `linux/arm64`

and publishes to:

- `ghcr.io/<owner>/<repo>`
