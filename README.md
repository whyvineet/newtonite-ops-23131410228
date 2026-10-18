# Operations Under Pressure — Newtonite Ops Challenge

An internal work-management system that enables teams to create, assign, track, and resolve operational work items under strict concurrency, accountability, and authorization requirements.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) + [Python 3.11](https://www.python.org/) | High-performance asynchronous REST API |
| **Package Manager** | [uv](https://docs.astral.sh/uv/) | Fast, deterministic Python dependency resolution |
| **ORM & Database** | [SQLAlchemy 2.0 (asyncio)](https://www.sqlalchemy.org/) + [asyncpg](https://github.com/MagicStack/asyncpg) + [PostgreSQL 16](https://www.postgresql.org/) | Fully asynchronous relational persistence |
| **Migrations** | [Alembic](https://alembic.sqlalchemy.org/) | Schema migration tracking with async engine support |
| **Frontend** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/) + [Tailwind CSS](https://tailwindcss.com/) | Responsive client application with dev proxy |
| **Orchestration** | [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/) | Reproducible multi-container stack (DB, Backend, Frontend) |
| **Testing & Linting**| [pytest](https://pytest.org/) + [HTTPX](https://www.python-httpx.org/) + [Ruff](https://docs.astral.sh/ruff/) | Automated test fixtures and high-speed linting |

---

## Quickstart with Docker Compose (Recommended)

### 1. Prerequisites
- [Docker](https://docs.docker.com/get-docker/) (v24+)
- [Docker Compose](https://docs.docker.com/compose/) (v2+)

### 2. Configure Environment
Copy the template configuration into your local `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

### 3. Launch Services
Start all three services (PostgreSQL, Backend, Frontend):
```bash
docker compose up --build
```

### 4. Access Points
- **Frontend App:** [http://localhost:5173](http://localhost:5173)
- **Backend API Root:** [http://localhost:8000/](http://localhost:8000/)
- **Interactive OpenAPI Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check Endpoint:** [http://localhost:8000/health](http://localhost:8000/health)
- **PostgreSQL Database:** `localhost:5432` (credentials in `.env`)

To shut down the containers:
```bash
docker compose down
```

---

## Local Development Setup

If you prefer running services directly on your host:

### 1. Start Only PostgreSQL
```bash
docker compose up -d db
```

### 2. Backend Setup
From the `backend/` directory:
```bash
cd backend

# Install dependencies into virtual environment using uv
uv sync

# Run database migrations
uv run alembic upgrade head

# Start development server with hot reload
uv run uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup
From the `frontend/` directory in a new terminal:
```bash
cd frontend

# Install node modules
npm install

# Start Vite development server
npm run dev
```
The frontend automatically proxies `/api` and `/health` requests to `http://localhost:8000`.

---

## Testing & Code Quality

### Backend
From the `backend/` directory:
```bash
# Run test suite
uv run pytest

# Check formatting and linting
uv run ruff check .
uv run ruff format --check .

# Auto-fix formatting
uv run ruff format .
```

### Frontend
From the `frontend/` directory:
```bash
# Typecheck and production bundle build
npm run build

# Lint frontend code
npm run lint
```

---

## Repository Structure

```
newtonite-ops-23131410228/
├── .env.example                 # Environment configuration template
├── .gitignore                   # Ignore rules (protects .env while tracking .env.example)
├── docker-compose.yml           # Multi-container orchestration (db, backend, frontend)
├── README.md                    # Project documentation
├── ENGINEERING_DECISIONS.md     # Architectural and design decision records
│
├── backend/
│   ├── Dockerfile               # Lean uv-powered Python 3.11 image
│   ├── pyproject.toml           # Backend dependencies and pytest configuration
│   ├── uv.lock                  # Deterministic dependency lockfile
│   ├── alembic.ini              # Alembic migration runner configuration
│   ├── migrations/              # Database schema migrations
│   │   ├── env.py               # Dynamic asyncpg migration engine setup
│   │   └── versions/            # Migration version scripts
│   ├── app/
│   │   ├── main.py              # FastAPI application entrypoint & root endpoints
│   │   └── core/
│   │       └── config.py        # Pydantic BaseSettings loading from environment
│   └── tests/
│       ├── conftest.py          # Pytest ASGI test fixtures
│       └── test_health.py       # Health and root endpoint assertions
│
└── frontend/
    ├── Dockerfile               # Node 22 Alpine development container
    ├── package.json             # React 19, TypeScript, Tailwind dependencies
    ├── vite.config.ts           # Vite bundler configuration with API proxy
    ├── index.html               # Frontend HTML shell
    └── src/                     # React application source code
```
