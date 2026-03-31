# Remote PostgreSQL Migration Design

Status: Approved in brainstorming
Date: 2026-03-31

## Summary

Move this project from a locally hosted PostgreSQL database to a remotely hosted self-managed PostgreSQL 16 instance exposed through a fixed `IP:port`. The application will keep using PostgreSQL and the existing schema, while all business machines switch to a shared remote `DATABASE_URL` during a short planned downtime window.

The migration will use a full logical export/import flow (`pg_dump` and `pg_restore` or `psql`). Because the current dataset is under 1GB and the user accepts a short maintenance window, this is the simplest and lowest-risk approach.

## Goals

- Keep PostgreSQL as the database engine.
- Keep the existing database name `gstack_web2skill`.
- Move data from the current local PostgreSQL instance to a remote self-managed PostgreSQL host.
- Support multiple business machines connecting to the same remote database.
- Minimize application code changes.
- Use a short downtime cutover instead of incremental replication.
- Preserve the local database temporarily as the rollback target after cutover.

## Non-goals

- Switching to MySQL or another database engine.
- Building incremental synchronization, logical replication, or dual-write flows.
- Designing a backup platform for the remote host.
- Reworking the application schema or adding new application features.
- Introducing managed cloud database services.

## Existing Repository Constraints

Current repository behavior already assumes PostgreSQL:

- Database access uses `pg` (`package.json`).
- The app reads `process.env.DATABASE_URL` first, then falls back to a local default (`src/db/client.ts`).
- The local default points to `postgres://bytedance@localhost:5432/gstack_web2skill` (`src/db/client.ts`).
- Schema creation is handled in code by `ensureCatalogSchema()` (`src/db/schema.ts`).
- Current tables include at least:
  - `catalog_items` (`src/db/schema.ts`)
  - `team_shoes_content_templates` (`src/db/schema.ts`)
- Local bootstrap still provisions a local PostgreSQL environment (`setup.sh`).

This design should preserve the current application query behavior and schema shape while moving runtime connectivity to the remote PostgreSQL host.

## Chosen Approach

### Recommended option

Use a self-managed remote PostgreSQL 16 instance with:

- one application database: `gstack_web2skill`
- one dedicated application user, e.g. `app_user`
- one shared remote connection string used by all business machines
- one full logical export/import migration
- one short maintenance window for final cutover

### Rejected alternatives

#### Incremental sync / replication

Not chosen because the current dataset is small, the user accepts short downtime, and incremental approaches add unnecessary operational complexity.

#### Managed database service

Not chosen because the user explicitly wants a self-managed remote host exposing `IP:port`.

## Target Architecture

```text
Business machine A ----\
Business machine B -----+----> Remote PostgreSQL 16 (IP:port)
Business machine N ----/

Local PostgreSQL
  └─ kept temporarily after cutover as rollback fallback
```

## Remote Database Design

### Database version

- PostgreSQL 16

### Database objects

- database name: `gstack_web2skill`
- application role: `app_user` (or equivalent dedicated business role)
- admin/superuser: reserved for manual administration only

### Connection contract

All business machines should use an explicit remote connection string such as:

```bash
DATABASE_URL=postgresql://app_user:strong_password@<REMOTE_IP>:5432/gstack_web2skill
```

Requirements:

- all business machines use the same host, port, database name, and application user
- the production/runtime environment must provide `DATABASE_URL` explicitly
- the remote host becomes the only write target after cutover

## Network and Security Design

The remote database is self-managed and exposed through `IP:port`, but it should not be broadly public.

Requirements:

- PostgreSQL listens on the network interface required for business-machine access
- firewall rules allow only known business-machine source IPs
- the database must not be open to arbitrary internet sources
- `pg_hba.conf` allows only the intended business-machine IPs or CIDR ranges
- password authentication should use `scram-sha-256`
- the application role must not have superuser, createdb, or createrole privileges

Minimum PostgreSQL configuration expectations:

- `listen_addresses = '*'` when network exposure is required
- explicit host-based access rules in `pg_hba.conf`
- strong password for the application role

## Application-Side Design

Application code changes should be minimal.

### Required runtime behavior

- all deployed business machines connect through `process.env.DATABASE_URL`
- the remote database is the shared source of truth
- no machine should keep writing to local PostgreSQL after cutover

### Recommended code hardening

Today the app still has a local fallback URL in `src/db/client.ts`. That fallback is convenient for local development, but it is dangerous in a multi-machine remote deployment because a misconfigured machine could silently write to a local database instead of the shared remote one.

Recommended direction:

- deployment environments must always set `DATABASE_URL`
- after migration, reduce or remove reliance on the local fallback for production-like environments
- avoid a state where some machines use the remote database and others silently use local PostgreSQL

This hardening is recommended as part of rollout, but the migration does not require a schema redesign.

## Migration Flow

### Phase 1: Remote host preparation

Prepare the remote host before touching application traffic:

1. install PostgreSQL 16 on the remote host
2. initialize the database cluster
3. create database `gstack_web2skill`
4. create application role `app_user`
5. grant the minimum required privileges on the target database
6. configure PostgreSQL network access and host firewall rules
7. verify connectivity from every business machine to `<REMOTE_IP>:<PORT>`

### Phase 2: Source database inspection

Before migration, inspect the current local database and confirm:

- the active source database is `gstack_web2skill`
- schema objects exist as expected
- row counts for key tables are known
- there are no unexpected large objects or anomalies that would affect export/import

Key tables to verify:

- `catalog_items`
- `team_shoes_content_templates`

### Phase 3: Dress rehearsal migration

Before the real cutover, run a rehearsal:

1. export the local database with `pg_dump`
2. import it into the remote database
3. verify schema and row counts remotely
4. verify the application can connect to the remote database in a controlled test

The rehearsal reduces cutover risk and confirms the remote host is correctly prepared.

### Phase 4: Final cutover

During the planned downtime window:

1. stop application writes
2. confirm no background job or process is still writing locally
3. run the final local export
4. import the final export into the remote database
5. update every business machine to the remote `DATABASE_URL`
6. restart the application on all business machines
7. run post-cutover verification

### Why a final export is required

Even if a rehearsal migration has already been completed, local data may keep changing until the actual maintenance window. The final export/import ensures the remote database receives the latest state immediately before traffic switches.

## Cutover and Rollback Design

### Cutover rules

- the cutover window is write-stopped, not live-migrated
- all business machines must switch together
- partial rollout is not allowed if it creates mixed local/remote writes

### Rollback rules

If post-cutover validation fails:

1. point all business machines back to the original local `DATABASE_URL`
2. restart the application
3. resume traffic on the local database
4. investigate and fix the remote issue before a new migration window

Rollback depends on keeping the local PostgreSQL instance intact until the remote cutover has been validated.

## Validation Requirements

After cutover, validate all of the following:

1. every business machine can connect to the remote PostgreSQL instance
2. the application starts without database connection errors
3. key tables exist remotely:
   - `catalog_items`
   - `team_shoes_content_templates`
4. key table row counts match the source export expectation
5. application read flows work normally
6. application write flows work normally
7. newly written records appear in the remote database
8. no business machine continues writing to a local PostgreSQL instance
9. all business machines use the same remote `DATABASE_URL`

## Risks and Mitigations

### Risk: database port exposed too broadly

If the remote PostgreSQL port is open to the internet without source restrictions, the database becomes unnecessarily exposed.

Mitigation:

- restrict access to known business-machine IPs only
- enforce password authentication
- use a dedicated non-admin application account

### Risk: writes continue during cutover

If application or background-job writes continue after the export point, local and remote databases will diverge.

Mitigation:

- stop application writes during the maintenance window
- confirm no scheduled tasks or worker processes are still writing

### Risk: mixed configuration across business machines

If some machines keep the old local configuration while others switch to remote, the system may split writes across two databases.

Mitigation:

- standardize `DATABASE_URL` on every business machine
- restart all instances in a controlled cutover sequence
- verify the effective connection string on every machine

### Risk: remote role permissions are wrong

If the application role is overprivileged or underprivileged, it may create a security issue or cause runtime failures.

Mitigation:

- use a dedicated application account
- grant only required access to the target database
- reserve admin credentials for manual operations only

## Recommended Execution Sequence

```text
Prepare remote PostgreSQL host
-> verify network access from all business machines
-> inspect local source database
-> run rehearsal export/import
-> schedule downtime window
-> stop writes
-> run final export/import
-> switch all business machines to remote DATABASE_URL
-> restart applications
-> validate reads/writes and row counts
-> keep local database temporarily for rollback
```

## Manual Verification Checklist

- remote PostgreSQL 16 is installed and reachable
- target database `gstack_web2skill` exists
- dedicated application role exists and can authenticate remotely
- firewall/host access is restricted to business-machine IPs
- `pg_dump` export completes successfully from the local source
- remote import completes without schema or permission errors
- `catalog_items` row counts match before and after migration
- `team_shoes_content_templates` row counts match before and after migration
- every business machine uses the same remote `DATABASE_URL`
- application reads and writes succeed after restart
- local PostgreSQL remains available until rollback is no longer needed

## Final Recommendation

Use a self-managed remote PostgreSQL 16 deployment and migrate with a full logical export/import during a short maintenance window. This fits the current repository, keeps application changes minimal, and matches the user's constraints:

- continue using PostgreSQL
- self-managed remote host
- multiple business machines
- dataset under 1GB
- short downtime is acceptable

The migration should prioritize correctness and configuration consistency over automation complexity. For this scope, a simple well-controlled cutover is preferable to replication or dual-write designs.
