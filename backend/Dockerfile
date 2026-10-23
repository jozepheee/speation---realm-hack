FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for audio analysis (libsndfile, ffmpeg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 neuronudge && \
    mkdir -p /app/private-audio /app/static && chown -R neuronudge:neuronudge /app
USER neuronudge

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
