# Architecture & Engineering Decisions (ADR)

This document records the foundational architectural decisions, alternatives evaluated, trade-offs, and verification strategies for the **Operations Under Pressure** system.

---

## Decision 1: Team-Scoped Server-Side Authorization & Strict Workspace Ownership

### Context
In operational work-management systems, team members collaborate on incidents, tickets, and maintenance items. Unchecked horizontal privilege escalation (e.g. an operator in Alpha viewing or updating tickets in Beta) or vertical privilege escalation (e.g. an anonymous public registrant self-assigning `Lead` or `Admin` authority over an existing workspace) would violate operational integrity.

### Alternatives Considered
1. **Global User Roles:** Storing a single `role` column on the `users` table (e.g. system-wide Lead/Member).
   - *Why rejected:* Real-world cross-functional operators hold different responsibilities across different teams (e.g. Lead in Customer Support, but standard Member in Platform Ops).
2. **Client-Supplied Identity & Role Headers:** Allowing frontend clients or upstream proxies to pass `X-Role` or `X-Team-Id`.
   - *Why rejected:* Public API clients can forge HTTP headers, creating severe security vulnerabilities.
3. **Open Team Self-Registration:** Allowing public registrants to join any team by supplying a matching name and requested role.
   - *Why rejected:* Created privilege escalation where an attacker could take over existing teams or claim unearned approval authority.

### Choice (Implemented & Tested)
- **Database Model:** Roles (`lead`, `admin`, `member`, `viewer`) are strictly defined on the `memberships` join table (`(user_id, team_id)` composite primary key).
- **Public Registration Contract:** Registration (`POST /api/v1/auth/register`) strictly models **workspace creation**. It accepts `name`, `email`, `password`, and `team_name`, but **forbids** a `role` field (`extra="forbid"`, returning 422 if supplied).
- **Creator Ownership:** The registrant receives the `Lead` role exclusively within the newly created team they instantiate.
- **Conflict Isolation:** If the requested team name already exists, the server returns `409 Conflict` (`team_already_exists`) and leaves the existing team and all existing memberships untouched.
- **Tenant Privacy (404 over 403):** Querying or mutating items belonging to a team the user does not belong to returns `404 Not Found`, rendering foreign items indistinguishable from non-existent resources to prevent enumeration attacks. Inside the team, unauthorized actions return `403 Forbidden`.
- **Approval Exclusivity:** Only `Lead` has approval authority (`awaiting_approval` -> `resolved`). `Admin` is intentionally excluded from sign-off.

### Trade-offs
- An anonymous operator cannot browse or request to join existing teams without a future administrative invitation flow.
- Every team query requires joining the `memberships` table, which is indexed on `(user_id, team_id)` and `(team_id)`.

---

## Decision 2: Atomic Claim & Predicate-Locked Optimistic Concurrency

### Context
When high-priority operational items enter the queue, multiple operators may concurrently attempt to claim the ticket or mutate its status, assignments, or due dates. Uncontrolled concurrent writes lead to lost updates, duplicate claims, and desynchronized operational handoffs.

### Alternatives Considered
1. **Pessimistic Locking (`SELECT ... FOR UPDATE`):** Acquiring a row-level lock on read before writing.
   - *Why rejected for claims:* Requires holding open locks across multiple queries, introducing connection pool starvation and deadlock risk under high concurrency.
2. **Distributed Locks (Redis/Redlock):** Coordinating locks through an external key-value store.
   - *Why rejected:* Adds unnecessary operational complexity, external network hops, and failure modes when PostgreSQL's native row locks already provide ACID atomicity.
3. **Last-Write-Wins (Unconditional `UPDATE`):** Overwriting database records without version checks.
   - *Why rejected:* Silently clobbers concurrent edits made by peer operators.

### Choice (Implemented & Tested)
- **Atomic Claim (Single SQL Predicate):**
  Claiming is executed as a single atomic statement:
  ```sql
  UPDATE work_items
  SET assignee_id = :user_id, status = 'in_progress', version = version + 1
  WHERE id = :id AND assignee_id IS NULL AND status = 'open'
  RETURNING *;
  ```
  PostgreSQL serializes concurrent claims on the row lock. The winner claims the item; any losing concurrent transactions re-evaluate the predicate against the winner's committed row, fail the `assignee_id IS NULL AND status = 'open'` check, return zero rows, and raise `409 Conflict` (`claim_conflict`).
- **Optimistic Concurrency Control (Version Compare-and-Swap):**
  All other mutations (detail updates, reassignments, status transitions) increment an integer `version` column and enforce `WHERE id = :id AND version = :expected_version`.
- **Conflict-Aware Frontend UX:**
  When `409 Conflict` (`version_conflict`) is received, the frontend preserves the operator's active edits and displays a clear conflict resolution banner offering:
  1. *Reload Latest Version:* Overwrites local state with current server values.
  2. *Preserve My Edits:* Re-syncs the `expected_version` target with the server's newest version while keeping dirty form edits intact.

### Trade-offs
- Operators encountering a conflict must acknowledge that a concurrent update occurred rather than having their changes silently merged or overwritten.
- Clients must track and submit `expected_version` with every mutation payload.

---

## Decision 3: Database-Backed Idempotency & Safe Network Retries

### Context
Unreliable networks, browser timeouts, and connection dropouts can cause the client to lose the server's HTTP response even after a work item has been successfully committed to the database. If the user clicks "Create" or "Retry", standard APIs risk duplicating the ticket.

### Alternatives Considered
1. **Client-Side Button Disabling Alone:** Disabling the submit button while a request is in flight.
   - *Why rejected:* Fails if the network connection drops mid-flight and the user clicks retry, or if the page is refreshed.
2. **In-Memory / Redis Key Cache:** Caching idempotency keys with short TTLs in memory.
   - *Why rejected:* A cache eviction or node restart allows duplicate creates; furthermore, in-memory keys cannot participate in the ACID database transaction.

### Choice (Implemented & Tested)
- **Relational Idempotency Table:** `idempotency_keys` table stores `(user_id, endpoint, key, request_hash, response_status, response_body)`.
- **Concurrent Atomic Reservation:**
  The creating transaction executes an `INSERT ... ON CONFLICT DO NOTHING` on the unique index `(user_id, endpoint, key)`. Concurrent identical requests block on the PostgreSQL index until the primary transaction commits, then detect the existing row and replay the stored response with the `Idempotent-Replayed: true` header.
- **Payload Fingerprinting:**
  Incoming payloads are canonically serialized and hashed with SHA-256. If a client attempts to reuse an existing idempotency key with an altered payload, the server returns `409 Conflict` (`idempotency_key_reused`).
- **Frontend Key Lifecycle:**
  The frontend generates idempotency keys using `crypto.randomUUID()`. When a submission fails due to a network dropout or 5xx error, the client reuses the exact same key for the retry. If the operator alters form inputs (changing the payload), a fresh UUIDv4 key is generated to prevent payload conflict.

### Trade-offs
- Creation transactions incur the write cost of one extra row in `idempotency_keys`.
- Requires periodic cleanup of expired idempotency keys in high-volume production deployments.

---

## Decision 4: Transactional Audit History, Persistence Invariants, & Session Recovery

### Context
High-reliability operations demand an immutable audit trail of who changed what, when, and why. Incomplete transactions that persist work items without corresponding audit events (or vice versa) create audit blind spots and data corruption.

### Alternatives Considered
1. **Asynchronous Audit Logging:** Publishing audit events to a message broker (RabbitMQ/Kafka) or background thread after committing the mutation.
   - *Why rejected:* If the message broker is unavailable or the process crashes between commit and publish, the audit record is lost permanently.
2. **Database Triggers:** Writing audit rows via PostgreSQL procedural triggers (`PL/pgSQL`).
   - *Why rejected:* Triggers hide business logic from application code, complicate testing and migrations, and make it difficult to attribute actor identities from JWT tokens.

### Choice (Implemented & Tested)
- **Single Unit-of-Work Boundary:**
  Every state mutation executes inside an explicit transaction context (`async with transaction(session)`). The entity update, staged activity log rows (`record_event`), and idempotency response commit or roll back together.
- **Append-Only Immutability:**
  The `/items/{id}/activity` endpoint is strictly read-only. No `POST`, `PATCH`, or `DELETE` endpoints exist for activity events.
- **Chronological Ordering via `clock_timestamp()`:**
  Activity timestamps use PostgreSQL's `clock_timestamp()`, ensuring that sequential events generated within the same transaction reflect exact microsecond ordering.
- **Database Invariants:**
  - Foreign keys enforce that an assigned user must be a member of the work item's team: `FOREIGN KEY (assignee_id, team_id) REFERENCES memberships(user_id, team_id)`.
  - Check constraints ensure `email = lower(email)` and enforce valid statuses, priorities, and workflow rules.
- **Frontend Session Recoverability:**
  A confirmed `401 Unauthorized` clears the session. Transient network dropouts (status 0) and 5xx errors preserve the user's stored token and display actionable retry states instead of prematurely logging the user out.

### Trade-offs
- Mutations take slightly longer to commit because activity rows are written synchronously within the transaction.
- Activity rows cannot be edited or erased by operators, requiring compensatory workflow actions instead of retroactive edits.

---

## Decision 5: Keyset Cursor Pagination, Server-Side Aggregation, & Scope Boundaries

### Context
As operations teams resolve hundreds or thousands of work items, loading unbounded arrays into the client degrades browser responsiveness and consumes excessive memory. Furthermore, traditional SQL `OFFSET / LIMIT` pagination suffers from $O(N)$ scanning degradation and page drift when items are added or deleted between page requests.

### Alternatives Considered
1. **Unbounded List Fetching:** Fetching all items and filtering/paginating in React memory.
   - *Why rejected:* Scales poorly, causes significant initial load latency, and exhausts mobile browser memory.
2. **SQL `OFFSET / LIMIT`:** Standard page-number pagination (`OFFSET 25 LIMIT 25`).
   - *Why rejected:* If a new item is created on page 1 while the operator views page 2, rows shift and items appear duplicated or skipped.
3. **Transactional Outbox with Dedicated Background Worker:**
   - *Status:* Evaluated and intentionally deferred for this iteration. Core requirements demand rock-solid synchronous transactional integrity, bounded keyset pagination, and zero external dependency failure modes. Adding background worker queues (Redis/Celery) introduces out-of-order delivery, poll latency, and connection bloat without delivering value required by the challenge.

### Choice (Implemented & Tested)
- **Keyset Cursor Pagination (`(created_at, id)`):**
  Work item, activity, and comment lists use opaque base64-encoded keyset cursors. PostgreSQL executes cursor queries in $O(1)$ time via composite indexes:
  ```sql
  WHERE tuple(created_at, id) < tuple(:cursor_created_at, :cursor_id)
  ORDER BY created_at DESC, id DESC
  LIMIT 25;
  ```
- **Authoritative Server-Side Dashboard Metrics:**
  Summary metrics (`unassigned_urgent`, `awaiting_approval`, `in_progress`, `assigned_to_me`, and total items) are computed via server-side SQL `COUNT(*)` aggregates across the entire team dataset, never calculated from loaded client pages.
- **Bounded Detail Feeds:**
  Comments and activity logs load in bounded pages (20 items) with dedicated "Load Older Comments" and "Load Older Events" actions.
- **Search Debouncing & Request Sequence Guard:**
  Filter changes and searches are debounced by 250ms and monitored by request sequence counters and `AbortController` cancellation, preventing stale in-flight responses from overwriting newer query states.

### Trade-offs
- Keyset cursor pagination does not support jumping directly to an arbitrary page number (e.g. "Jump to page 12"); navigation is forward/backward via cursor stack.
