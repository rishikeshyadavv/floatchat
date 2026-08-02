FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for psycopg2, NetCDF parsing, and Parquet/Snappy
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libsnappy-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code, frontend, and entrypoint
COPY src/ ./src/
COPY frontend/ ./frontend/
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# FIX H5: Run as non-root user to limit blast radius of any container escape
RUN useradd --uid 1001 --no-create-home --shell /bin/false appuser \
    && chown -R appuser:appuser /app
USER appuser

# FIX H5: HEALTHCHECK so orchestrators can detect unhealthy containers
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["uvicorn", "src.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
