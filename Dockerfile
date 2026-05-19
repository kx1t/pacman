FROM python:3.12.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOME=/app \
    PORT=80 \
    PIP_NO_INPUT=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR ${APP_HOME}

# Install system dependencies via apt (preferred over pip when possible)
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies using pip with --break-system-packages
# (safe in containers; prevents venv requirement)
COPY requirements.txt ./
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt

# Copy application code (last layer so source changes don't trigger dep rebuild)
COPY . .

EXPOSE 80

CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:80", "app:app"]
