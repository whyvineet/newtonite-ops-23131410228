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

## Backend API

All endpoints live under `/api/v1` (interactive docs at `/docs`). Errors from application logic use one JSON shape,
`{"error": {"code": "...", "message": "..."}}`; request-validation errors keep FastAPI's standard `422` body.

### First run (local)

```bash
cd backend
uv sync
uv run alembic upgrade head          # create the schema
uv run python -m app.seed            # idempotent demo data (refuses to run when ENVIRONMENT=production)
uv run uvicorn app.main:app --reload
```

With Docker Compose: `docker compose exec backend uv run alembic upgrade head` then
`docker compose exec backend uv run python -m app.seed`.

### Demo accounts (LOCAL DEVELOPMENT ONLY)

Every seeded account uses the password **`demo-password-123`**. These credentials are public; never seed a shared or
production database. Passwords are stored only as Argon2id hashes.

| Email | Platform Ops | Customer Support |
|---|---|---|
| `alice.lead@demo.test` | Lead | - |
| `bob.member@demo.test` | Member | - |
| `carol.admin@demo.test` | Admin | - |
| `dave.viewer@demo.test` | Viewer | - |
| `erin.lead@demo.test` | Member | Lead |
| `frank.member@demo.test` | - | Member |
| `grace.admin@demo.test` | - | Admin |
| `henry.disabled@demo.test` | Member (account disabled; cannot log in) | - |

### Endpoints

| Method & path | Purpose |
|---|---|
| `POST /auth/login`, `GET /auth/me` | Obtain a JWT; current user and team memberships |
| `GET /teams`, `GET /teams/{id}/members` | Teams I belong to; members of one of them (for assignment pickers) |
| `GET /items` | Filters `team_id,status,priority,assignee_id,type,q`; keyset `cursor` + `limit` (1-100) |
| `POST /items` | Create (requires `Idempotency-Key` header) |
| `GET /items/{id}`, `PATCH /items/{id}` | Detail; edit title/description/type/priority/due date (requires `expected_version`) |
| `POST /items/{id}/claim` | Atomic claim of an open, unassigned item (moves it to In Progress) |
| `POST /items/{id}/assign` | Assign / reassign (Lead, Admin); optional `expected_version` |
| `POST /items/{id}/transition` | `{to_status, expected_version}`; only the four workflow steps exist |
| `GET/POST /items/{id}/comments`, `GET /items/{id}/activity` | Comments; read-only audit timeline |
| `GET /dashboard?view=assigned_to_me\|unassigned_urgent\|awaiting_my_approval` | Server-side views with `total` |

### Permission matrix (single source of truth: `app/services/permissions.py`)

Roles are per team. Admin is a team administrator, not a global one.

| Action | Viewer | Member | Lead | Admin |
|---|---|---|---|---|
| View team items, comments, activity | yes | yes | yes | yes |
| Create items, comment, claim | no | yes | yes | yes |
| Edit basic fields | no | creator/assignee | yes | yes |
| Change priority, assign/reassign | no | no | yes | yes |
| Start work / submit for approval | no | if assignee | yes | yes |
| **Approve** (Awaiting Approval -> Resolved) | no | no | **yes** | **no** |
| Close resolved work | no | no | yes | yes |
| Manage team memberships | no | no | no | policy defined, **no endpoint yet** |

Items of teams you do not belong to answer `404` everywhere (list filters, detail, mutations, comments, activity);
a team member lacking the role gets `403`.

### Behaviour worth knowing

* **Concurrency.** Claim is one `UPDATE ... WHERE id=? AND assignee_id IS NULL AND status='open' RETURNING`; every other
  mutation is a compare-and-swap on `version`. Losers get `409` (`claim_conflict` / `version_conflict`).
* **Idempotent create.** `INSERT ... ON CONFLICT DO NOTHING` on `(user_id, endpoint, key)` inside the creating
  transaction: concurrent duplicates wait for the winner, then replay its stored response (`Idempotent-Replayed: true`).
  Same key + different payload -> `409 idempotency_key_reused`. Missing header -> `400`.
* **Transactions.** Each mutation, its activity event(s) and any idempotency record commit or roll back together
  (`app/db/session.py::transaction`).
* **Pagination.** Keyset on `(created_at, id)`; `next_cursor` is opaque, bad cursors give `400 invalid_cursor`.
* **Dashboard definitions.** `assigned_to_me` and `unassigned_urgent` exclude Closed items.
  `awaiting_my_approval` lists Awaiting-Approval items in teams where my role may approve (Lead).
* **Assign** does not change status; **claim** sets the claimer as assignee *and* moves Open -> In Progress.
  Starting an Open item via `transition` requires an assignee. Closed items cannot be edited; resolved/closed items
  cannot be reassigned. Viewers and disabled users cannot be assignees.

### Known limitations

* No endpoint to manage memberships (the `manage_memberships` policy exists, nothing uses it yet).
* `q` search is a case-insensitive substring match (`ILIKE`) without a trigram index; fine for this scale.
* A Lead who is also the assignee can approve their own work (no four-eyes rule was specified).
* No transactional outbox / background jobs (not required).

## Testing & Code Quality

### Backend
From the `backend/` directory:
```bash
# Run test suite (needs PostgreSQL; uses a dedicated database, see below)
uv run pytest

# Check formatting and linting
uv run ruff check .
uv run ruff format --check .

# Auto-fix formatting
uv run ruff format .
```

**Test database.** Tests use `TEST_DATABASE_URL` (default
`postgresql+asyncpg://postgres:postgres@localhost:5432/test_newtonite`), never `DATABASE_URL`, and refuse to run unless
the database name contains `test` because they truncate tables and exercise `alembic downgrade`. Create it once with
`docker compose exec db createdb -U postgres test_newtonite`. The suite migrates it to `head` itself.
Concurrency tests use real PostgreSQL row locks and a barrier fixture (`rendezvous`) so races are deterministic.

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
│   │   └── versions/            # Migration version scripts (0001_initial_schema.py)
│   ├── app/
│   │   ├── main.py              # FastAPI application entrypoint & root endpoints
│   │   ├── seed.py              # Idempotent development demo seeder
│   │   ├── api/                 # API router and dependencies (deps.py, v1/router.py, v1/endpoints/)
│   │   ├── core/                # 12-factor config, exceptions, security (Argon2, JWT)
│   │   ├── db/                  # Base declarative model and async session / transaction manager
│   │   ├── models/              # SQLAlchemy relational models (User, Team, Membership, WorkItem, ...)
│   │   ├── schemas/             # Strict Pydantic v2 validation models
│   │   └── services/            # Business logic, permissions, concurrency, audit, idempotency
│   └── tests/                   # Automated pytest suite (100 unit, integration, and concurrency tests)
│
└── frontend/
    ├── Dockerfile               # Node 22 Alpine development container
    ├── package.json             # React 19, TypeScript, Tailwind dependencies
    ├── vite.config.ts           # Vite bundler configuration with API proxy
    ├── index.html               # Frontend HTML shell
    └── src/
        ├── App.tsx              # Operations dashboard shell & navigation
        ├── main.tsx             # Application bootstrap & StrictMode
        ├── index.css            # Tailwind theme tokens & base styles
        ├── api/                 # API client & domain request modules (auth, teams, workItems)
        ├── components/          # Reusable operational UI components & modals
        ├── context/             # Authentication & session state management
        ├── types/               # Type-safe contract definitions matching backend schemas
        └── utils/               # Frontend role authorization & policy helpers
```

