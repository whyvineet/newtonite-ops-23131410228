FROM python:3.11-slim

# Install uv from the official astral-sh binary image
COPY --from=ghcr.io/astral-sh/uv:0.11.17 /uv /uvx /bin/

WORKDIR /app

# Enable bytecode compilation and copy link mode for reliability
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Copy dependency specifications first for optimal Docker layer caching
COPY pyproject.toml uv.lock ./

# Install runtime dependencies directly without dev dependencies
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code, migrations, and alembic configuration
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
