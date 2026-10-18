# Architecture & Engineering Decision Records (ADR)

This document records the foundational architectural decisions and trade-offs for the **Operations Under Pressure** system.

---

## ADR 001: Web Framework Choice — FastAPI

### Context
The application is an internal work-management system requiring strict validation, authorization, and concurrency under operational pressure.

### Decision
Adopt **FastAPI** on Python 3.11 with Starlette and Uvicorn.

### Rationale
- **Asynchronous Concurrency:** Native `async`/`await` support across endpoint handlers and database calls prevents thread starvation under high I/O workloads.
- **Type Safety & Data Validation:** Deep integration with Pydantic v2 ensures request and response schemas are strictly validated and serialized at runtime.
- **Self-Documenting API:** Automatic OpenAPI 3.1 and Swagger UI generation at `/docs` simplifies frontend integration and automated client generation.
- **Lightweight & Modular:** Avoids the heavy monolithic overhead of Django while providing greater structure and typed safety than Flask.

---

## ADR 002: Dependency Management — uv & pyproject.toml

### Context
Fast, reproducible, and deterministic dependency resolution is essential for local development, CI/CD, and Docker builds.

### Decision
Use **uv** (by Astral) as the primary package manager, using `pyproject.toml` for dependency specifications and `uv.lock` as the single source of truth.

### Rationale
- **Performance:** Package installation and resolution speeds are 10–100x faster than traditional `pip` and `pip-tools`.
- **Reproducibility:** Cross-platform `uv.lock` guarantees identical dependency trees across Windows host environments and Linux container runtimes.
- **Container Integration:** Official `ghcr.io/astral-sh/uv` multi-stage binary eliminates the need to export and synchronize duplicate `requirements.txt` files.

---

## ADR 003: Persistence & Async ORM — PostgreSQL 16 + SQLAlchemy 2.0 + asyncpg

### Context
Work items, assignments, status transitions, and audit logs require relational integrity, transactional guarantees, and concurrency controls.

### Decision
Use **PostgreSQL 16** with **SQLAlchemy 2.0 (asyncio)** and the **asyncpg** binary driver.

### Rationale
- **Relational Integrity:** Foreign keys, check constraints, and unique constraints enforce business rules at the database level.
- **Concurrency Controls:** PostgreSQL provides native support for `FOR UPDATE` row-level locking and transaction isolation levels needed to handle concurrent assignments.
- **Async Driver Performance:** `asyncpg` is the fastest PostgreSQL driver for Python, operating asynchronously without blocking the event loop.
- **Modern SQLAlchemy 2.0 API:** Uses typed `select()` constructs and clean session lifecycle management via `AsyncSession`.

---

## ADR 004: Database Migrations — Alembic with Async Template

### Context
Database schema changes must be version-controlled, repeatable, and capable of running in automated deployment pipelines.

### Decision
Adopt **Alembic** configured with the `async` environment template.

### Rationale
- **Environment-Driven Configuration:** `migrations/env.py` dynamically sources `settings.database_url` from application settings rather than hardcoding static DSNs in `alembic.ini`.
- **Asyncpg Compatibility:** The `async_engine_from_config` configuration executes migrations safely within the asyncio loop.
- **Offline & Online Execution:** Supports both live migration execution (`alembic upgrade head`) and static SQL script generation (`alembic upgrade head --sql`) for dry-runs.

---

## ADR 005: 12-Factor Configuration & Secrets Management

### Context
Secrets and environment variables must not be hardcoded in repository files, even for development.

### Decision
Use `pydantic-settings` with an explicit environment contract defined in `.env.example`.

### Rationale
- **Security:** `.env` is strictly gitignored. Real secrets and passwords are never checked into Git.
- **Documentation:** `.env.example` serves as the authoritative, version-controlled template documenting all required variables across the stack.
- **Flexible Hierarchy:** `Settings` searches `../.env` and `.env` while giving precedence to host OS or container environment variables.

---

## ADR 006: Frontend Stack & Dev Proxy

### Context
The frontend needs to be responsive, type-safe, and capable of communicating with the backend without CORS complications during local development.

### Decision
Use **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**, with a local development proxy configured in `vite.config.ts`.

### Rationale
- **Vite Proxy:** Forwarding `/api` and `/health` requests to `http://localhost:8000` eliminates browser CORS preflight friction during local development.
- **TypeScript:** Shares request/response contract interfaces with backend Pydantic schemas.
- **Tailwind CSS:** Enables rapid, design-system-consistent component styling without runtime CSS-in-JS overhead.

---

## ADR 007: Concurrency & Conflict Resolution Strategy

### Planned Approach for Core Features
1. **Optimistic Concurrency Control (implemented):**
   - Work items maintain a `version` integer column incremented on every state mutation.
   - Updates verify `WHERE id = :id AND version = :current_version`. If zero rows are updated, an `HTTP 409 Conflict` is returned to prevent lost updates.
2. **Atomic claim (implemented, supersedes the earlier `FOR UPDATE` plan):**
   - Claiming is a single conditional `UPDATE ... WHERE assignee_id IS NULL AND status = 'open' RETURNING`. PostgreSQL's row lock serializes competing claims and the loser re-evaluates the predicate against the committed row, so no explicit `SELECT ... FOR UPDATE` is needed and there is no read-then-write window.

---

## ADR 008: Authorization — one team-scoped policy, 404 for foreign resources

Roles live on `memberships` (per team). `app/services/permissions.py` holds the whole matrix; endpoints and services call
`require(action, role, ...)`. Items are loaded with a JOIN on the caller's membership, so another team's item is
indistinguishable from a missing one (`404`), while insufficient role inside the team is `403`. Approval is Lead-only
(Admin deliberately excluded). Dashboard views derive "who can approve" from the same policy.

## ADR 009: Transaction boundaries and audit history

Every mutation runs inside `async with transaction(session)`: validate -> compare-and-swap UPDATE -> stage activity
events with `record_event` (never commits itself) -> commit. A failure anywhere rolls back the mutation, its events and
the idempotency record together. Activity rows are append-only at the application level (read-only endpoint) and use
`clock_timestamp()` so events from one transaction keep their order.

## ADR 010: Idempotent creation via a unique index

`idempotency_keys` has a unique `(user_id, endpoint, key)`. The creating transaction first runs `INSERT ... ON CONFLICT DO
NOTHING RETURNING id`; a concurrent duplicate blocks on the index until the winner commits, then replays the stored
response (or gets `409` if the payload hash differs). The response is written in the same transaction as the item.

## ADR 011: Integrity enforced in the database too

CHECK constraints for enums, version, title length, status/timestamp consistency and "started work has an assignee";
a composite foreign key `(assignee_id, team_id) -> memberships(user_id, team_id)` makes "assignee belongs to the item's
team" a database guarantee behind the service-level validation; e-mails are stored lower-case with a CHECK. Indexes match
the real query shapes (keyset list by team/status, partial indexes for assigned, urgent-unassigned and awaiting-approval).

---

## ADR 012: Server-Side Keyset Pagination, Filtering, and Dashboard Accuracy

### Context
Loading unbounded collections into the browser violates memory constraints and causes stale, truncated, or inaccurate metrics when client-side filtering and counting operate only on the initial loaded page.

### Decision
1. **Keyset Cursor Pagination (`next_cursor`):**
   - The frontend requests a constrained page size (`limit=25`) and navigates through collections using `next_cursor`.
   - Backward and forward navigation maintains a cursor stack, eliminating the performance degradation and offset drift of SQL `OFFSET`.
2. **Server-Side Filtering & Search:**
   - Status, priority, item type, and text search (`q`) are processed directly by PostgreSQL via index-backed `WHERE` and `ILIKE` clauses.
3. **Database-Calculated Dashboard Metrics:**
   - Dashboard summary metrics (`open`, `in_progress`, `urgent`, `awaiting_approval`, `assigned_to_me`, and total items) are computed via aggregate SQL queries (`func.count().filter(...)`) directly in PostgreSQL across the full dataset rather than derived from loaded page items.
   - Dedicated views (`assigned_to_me`, `unassigned_urgent`, `awaiting_my_approval`) utilize the existing backend dashboard endpoints and preserve lead-only authorization rules.

