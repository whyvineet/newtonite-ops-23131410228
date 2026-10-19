# Operations Under Pressure — Newtonite Ops Challenge

An internal work-management system that enables operations teams to create, assign, track, and resolve operational work items under strict concurrency, accountability, and authorization requirements.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) + [Python 3.11](https://www.python.org/) | High-performance asynchronous REST API |
| **Package Manager** | [uv](https://docs.astral.sh/uv/) | Fast, deterministic Python dependency resolution with `uv.lock` |
| **ORM & Database** | [SQLAlchemy 2.0 (asyncio)](https://www.sqlalchemy.org/) + [asyncpg](https://github.com/MagicStack/asyncpg) + [PostgreSQL 16](https://www.postgresql.org/) | Fully asynchronous relational persistence with row-level locks |
| **Migrations** | [Alembic](https://alembic.sqlalchemy.org/) | Schema migration tracking with async engine support |
| **Frontend** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/) + [Tailwind CSS v4](https://tailwindcss.com/) | Responsive client application with dev proxy and robust conflict UX |
| **Orchestration** | [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/) | Reproducible multi-container stack (PostgreSQL, Backend, Frontend) |
| **Testing & Linting**| [pytest](https://pytest.org/) + [HTTPX](https://www.python-httpx.org/) + [Ruff](https://docs.astral.sh/ruff/) + [ESLint](https://eslint.org/) | Automated test fixtures, PostgreSQL concurrency barriers, and linting |
| **CI / Automation** | [GitHub Actions](https://github.com/features/actions) | Deterministic continuous integration running full test suites and lint gates |

---

## Architecture

```mermaid
flowchart LR
    Browser["Browser (React + Vite)"] -- "/api/v1 + JWT" --> API["FastAPI"]
    API -- "one transaction per change:<br/>item + activity event + idempotency record" --> DB[("PostgreSQL")]
```

All authorization, workflow and concurrency rules run in the API (`app/services/`); the UI only mirrors them for
display. There is no background worker (see Known Limitations).

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
Start all three container services (PostgreSQL, Backend, Frontend):
```bash
docker compose up --build -d
```

### 4. Database Schema and Demo Data (automatic)
The backend container runs `alembic upgrade head` on every start, so a fresh database is ready as soon as
the stack is up. With the default `.env.example` (`SEED_DEMO_DATA=true`) it also loads the demo users and
sample items described under [Demo Accounts](#demo-accounts) (idempotent, and refused unless
`ENVIRONMENT` is `development`/`dev`/`local`/`test`). To start with an empty database, set
`SEED_DEMO_DATA=false` in `.env`. Both steps can still be run by hand:
```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
```

### 5. Access Points
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

# (Optional) Seed initial development fixtures if desired
# uv run python -m app.seed

# Start development server with hot reload
uv run uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup
From the `frontend/` directory in a separate terminal:
```bash
cd frontend

# Install node dependencies deterministically
npm ci

# Start Vite development server
npm run dev
```
The frontend automatically proxies `/api` and `/health` requests to `http://localhost:8000`.

---

## Authentication, Registration, and Security Architecture

### Public Workspace Registration (Hardened)
Public registration (`POST /api/v1/auth/register`) strictly follows the **new workspace creation** security model:
1. **Forbidden Role Field:** The registration payload accepts `name`, `email`, `password`, and `team_name`. Any client attempting to supply `role` (`admin`, `lead`, etc.) is rejected with `422 Unprocessable Entity` (`extra="forbid"`).
2. **Strict Workspace Ownership:** The newly registered user receives the **Lead** role strictly within the newly created team workspace they own.
3. **No Unauthenticated Team Hijacking:** Registration never attaches a registrant to an existing team. If the requested team name already exists, the server returns an explicit `409 Conflict` (`team_already_exists`) and leaves the existing team and its memberships untouched.
4. **Database Uniqueness & Concurrency:** Case-insensitive email uniqueness (emails are stored lower-cased under a unique constraint) and exact-match team name uniqueness (team names are case-sensitive, so `Ops` and `ops` can coexist) are enforced at the PostgreSQL constraint level. Concurrent duplicate attempts are translated into clean `409 Conflict` client responses instead of unhandled 500s.
5. **Transactional Invariant:** User creation, team creation, and membership creation execute within a single atomic database transaction. Any failure results in an immediate rollback leaving zero partial state.
6. **Password Security:** Passwords require a minimum of 8 characters, are hashed using Argon2id, and password hashes are never exposed in responses or tokens.
7. **Production Secret Enforcement:** If `ENVIRONMENT=production`, application startup fails fast if the default development example secret is detected or if `SECRET_KEY` is shorter than 32 characters.

### Role Permissions & Authority Matrix

The platform enforces strict, team-scoped role-based access control (RBAC). A user's role is scoped per team:

| Capability | Lead | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| **View items, feeds, and activity** | Yes | Yes | Yes | Yes |
| **Create work items** | Yes | Yes | Yes | No |
| **Claim open unassigned items** | Yes | Yes | Yes | No |
| **Execute assigned work & submit for approval** | Yes | Yes | Assignee only | No |
| **Edit basic fields (title, description, type, due date)** | Yes | Yes | Creator/Assignee only | No |
| **Change priority** | Yes | Yes | No | No |
| **Assign / reassign work items** | Yes | Yes | No | No |
| **Close resolved items** | Yes | Yes | No | No |
| **Approve items in `AWAITING_APPROVAL`** | **Yes** | **No** (Deliberate separation) | **No** | **No** |
| **Manage team memberships** | No | **Yes** | No | No |
| **Comment on work items** | Yes | Yes | Yes | No |

> [!NOTE]
> **Separation of Duties:** Admins manage operational configuration and memberships, but **only Team Leads** possess approval authority for work items awaiting sign-off.

### Workspace Provisioning & Account Access

There are two ways to get an account:
1. **Registration (new workspace):** open [http://localhost:5173](http://localhost:5173), switch to Registration and
   provide name, email, password and a workspace name. This creates a new team with you as its **Lead**.
   Registration never joins an existing team, and there is no membership-invitation endpoint yet (see Known
   Limitations), so a self-registered workspace has exactly one user.
2. **Demo accounts (for exercising every role):** created by the local seed (`SEED_DEMO_DATA=true`, or
   `uv run python -m app.seed`). The seed is blocked when `ENVIRONMENT=production`.

#### Demo Accounts
Every demo account uses the password `demo-password-123` (local development only).

| Email | Platform Ops | Customer Support |
|---|---|---|
| `alice.lead@demo.test` | Lead | - |
| `bob.member@demo.test` | Member | - |
| `carol.admin@demo.test` | Admin | - |
| `dave.viewer@demo.test` | Viewer | - |
| `erin.lead@demo.test` | Member | Lead |
| `frank.member@demo.test` | - | Member |
| `grace.admin@demo.test` | - | Admin |
| `henry.disabled@demo.test` | Member (account disabled - login is rejected) | - |

The seed also creates 10 sample work items across both teams in different states (open, in progress,
awaiting approval, resolved, closed).

---

## Backend API Specification

All API endpoints are mounted under `/api/v1` (interactive OpenAPI documentation available at `/docs`).

| Method & Path | Purpose | Concurrency & Validation Contract |
|---|---|---|
| `POST /auth/register` | Create a new team workspace and lead account | Accepts name, email, password, team_name (no role accepted) |
| `POST /auth/login` | Authenticate and obtain JWT access token | Normalizes email; returns `401 invalid_credentials` for bad passwords or disabled accounts |
| `GET /auth/me` | Current user profile and team memberships | Requires Bearer token; includes per-team roles |
| `GET /teams` | List teams current user belongs to | Tenant-scoped |
| `GET /teams/{id}/members` | Active members of a team | For assignment pickers; requires team membership |
| `GET /items` | Keyset paginated work items | Filters: `team_id, status, priority, assignee_id, type, q`; keyset `cursor` + `limit` (1-100) |
| `POST /items` | Create work item | Requires `Idempotency-Key` header; replayed responses return `Idempotent-Replayed: true` |
| `GET /items/{id}` | Detailed work item view | Scoped to caller's team; foreign teams return `404` |
| `PATCH /items/{id}` | Edit title, description, priority, type, due date | Optimistic concurrency: requires matching `expected_version` |
| `POST /items/{id}/claim` | Atomically claim an open, unassigned item | Atomic SQL predicate: sets caller as assignee and moves status to `in_progress` |
| `POST /items/{id}/assign` | Assign or reassign to team member | Requires Lead or Admin; verifies `expected_version` |
| `POST /items/{id}/transition` | Workflow transition | Verifies valid workflow step and `expected_version` |
| `GET /items/{id}/comments` | Keyset paginated comments | Bounded cursor pagination (`limit` default 20) |
| `POST /items/{id}/comments` | Add operational comment | Recorded in audit timeline in same transaction |
| `GET /items/{id}/activity` | Immutable audit trail | Bounded keyset pagination (`(created_at, id)`) ordered by `clock_timestamp()` |
| `GET /dashboard` | Server-side constrained view pages | Views: `assigned_to_me`, `unassigned_urgent`, `awaiting_my_approval` |
| `GET /dashboard/summary` | Real-time aggregate count metrics | Database SQL `COUNT(*)` aggregates across the entire team dataset |

---

## Frontend Reliability & Request Consistency

- **Recoverable Session Management:** A confirmed `401` terminates an expired session. Transient network errors, timeouts, or 5xx server responses do not log the user out; the session token is preserved, and actionable reconnection states are presented.
- **Independent Bootstrapping:** User authentication is separated from team workspace loading. Network failures while loading teams provide a dedicated "Retry Loading Teams" action without fabricating an empty team state.
- **Race Condition Prevention & Request Cancellation:** Text search is debounced by 250ms. Filter and search updates abort in-flight `fetch` calls using `AbortController` and enforce a request sequence ID guard so older responses never overwrite newer result sets.
- **Pagination State Invariants:** Whenever the active team, view, search query, or filter parameters change, cursor pagination resets to the initial page.
- **Optimistic Concurrency UX:** When a concurrent update produces an `HTTP 409 Conflict`, the UI preserves user edits and displays a conflict banner offering:
  - **Reload Latest Version:** Overwrites local state with current server values.
  - **Preserve My Edits:** Re-syncs the `expected_version` target with the latest server version while keeping modified fields intact.
- **True Idempotent Retries:** Work item creation generates UUIDv4 idempotency keys (`crypto.randomUUID()`). Retrying a failed attempt reuses the identical key, ensuring the server replays the existing record rather than creating a duplicate. Modifying form inputs rotates the key to match the new payload fingerprint.
- **Bounded History Loading:** Detail modals fetch comments and activity logs in bounded pages (20 items) with "Load Older Comments" and "Load Older Events" actions rather than loading unbounded historical arrays.

---

## Testing & Quality Gates

### Backend Tests
From the `backend/` directory:
```bash
# Run complete test suite (unit, integration, concurrency)
uv run pytest

# Check code formatting and static analysis
uv run ruff check .
uv run ruff format --check .

# Auto-format codebase
uv run ruff format .
```

**Test Database Safeguards:** Tests execute strictly against `TEST_DATABASE_URL` (default: `postgresql+asyncpg://postgres:postgres@localhost:5432/test_newtonite`) and enforce that the database name must contain `"test"` before executing destructive `TRUNCATE` operations or migration downgrades. The test database is created automatically on the first run if it does not exist (the configured user
needs the `CREATEDB` privilege; the default `postgres` user has it). Start PostgreSQL first with
`docker compose up -d db`, then run `uv run pytest` - no manual `createdb` step is needed.
Concurrency tests leverage PostgreSQL row-level locks and barrier fixtures (`rendezvous`) to verify race conditions deterministically.

### Frontend Quality Gates
From the `frontend/` directory:
```bash
# Typecheck TypeScript and compile production bundle
npm run build

# Run ESLint validation
npm run lint
```

### Continuous Integration (CI)
A lightweight GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:
1. Spins up an isolated PostgreSQL 16 container service.
2. Installs Python 3.11 and dependencies deterministically via `uv sync --frozen`.
3. Runs `ruff check .`, `ruff format --check .`, and the full `pytest` suite against `test_newtonite`.
4. Installs Node dependencies via `npm ci` and runs `npm run lint` and `npm run build`.

---

## Known Limitations

- **Transactional Outbox & Background Worker:** Intentionally deferred in favor of synchronous transactional integrity and bounded cursor pagination. Work item mutations, audit events, and idempotency records are committed atomically in PostgreSQL without external message broker dependencies (e.g. Redis, Kafka, Celery).
- **Membership Administration Endpoints:** Role policies are defined and enforced in `app/services/permissions.py`, but administrative member invite/removal endpoints are deferred.
- **Search Indexing:** Text search (`q`) is a case-insensitive substring `ILIKE` on title and description. There is no trigram or full-text index, so PostgreSQL filters rows sequentially; this is fine for tens of thousands of items but grows linearly. A `pg_trgm` GIN index is the next step.
- **Lead Self-Approval:** A Team Lead who creates or is assigned an item can approve it; an explicit four-eyes principle was not specified.
- **Authentication Hardening:** No rate limiting or lockout on login/registration. The 60-minute HS256 access token is kept in `localStorage` and cannot be revoked server-side except by disabling the account (which is checked on every request).
- **Comment Retries:** Creating a comment is not idempotent. The UI disables the button while a request is in flight, but a retried request after a network timeout can create a duplicate comment.
- **Workflow:** There is no "send back" transition; a Lead can only approve (`awaiting_approval` -> `resolved`).
- **Optimistic UI:** Not implemented. The UI refetches after each action and shows a conflict banner on `409`; there is no optimistic update/rollback and no frontend test suite.
- **Frontend Container:** `docker compose` runs the Vite dev server (a development setup, not a production build).

## If I Had Another Week

1. Transactional outbox plus a worker (retries, attempt cap, idempotent handler) for assignee notifications.
2. Membership administration (invite, remove, change role) so multi-role teams can be built without the seed.
3. `pg_trgm` index for search; login rate limiting; cookie-based or refresh-token sessions.
4. A "send back" transition and an optional four-eyes rule for approvals.
5. Idempotency keys for comments, a cleanup job for `idempotency_keys`, and frontend tests for conflict handling.
