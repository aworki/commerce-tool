# Remote PostgreSQL Cutover Runbook

## Preconditions
- Remote PostgreSQL is PostgreSQL 16 and will listen on port `5432`.
- The shared remote runtime URL uses TLS and includes `sslmode=require`.
- Every deployed machine that will use the remote database has `GSTACK_REQUIRE_DATABASE_URL=1` set.
- The pre-cutover source of truth is the current machine's local PostgreSQL instance on port `5432`: `postgres://bytedance@localhost:5432/gstack_web2skill`.
- The rollback target is that same current-machine PostgreSQL instance, kept intact until remote cutover validation passes.
- A dump directory exists before any export command runs: `mkdir -p tmp`.
- Fill in these placeholders before the window starts:
  - `REMOTE_IP=<remote-postgres-ip>`
  - `BUSINESS_MACHINE_IPS=<comma-separated source IPs or CIDRs allowed to connect>`
  - `REMOTE_DATABASE_URL='postgresql://app_user:<password>@REMOTE_IP:5432/gstack_web2skill?sslmode=require'`
  - `ROLLBACK_HOST=<current-machine-routable-ip>`
  - `ROLLBACK_DATABASE_URL='postgresql://<rollback_user>:<rollback_password>@ROLLBACK_HOST:5432/gstack_web2skill?sslmode=require'`

## Remote host preparation
1. Install PostgreSQL 16 on the remote host.
2. Enable server-side PostgreSQL TLS before any remote connection attempt.
3. Create database `gstack_web2skill`.
4. Create application user `app_user`.
5. Grant runtime-compatible privileges to `app_user`, including the current schema-creation needs from `ensureCatalogSchema()`, while keeping the role non-superuser, non-createdb, and non-createrole.
6. Configure `listen_addresses`, `pg_hba.conf`, and firewall rules for the business-machine IP allowlist.
7. Use `hostssl` + `scram-sha-256` for the application connection policy.
8. Verify connectivity from every business machine to `REMOTE_IP:5432` before rehearsal starts.
9. Verify at least one TLS-backed `psql` connection succeeds with the final remote `DATABASE_URL` before rehearsal starts:
   ```bash
   psql "$REMOTE_DATABASE_URL" -c 'select version()'
   ```

## Source inspection
1. Confirm the source of truth is the current machine's PostgreSQL on port `5432`: `postgres://bytedance@localhost:5432/gstack_web2skill`.
2. Confirm schema objects exist as expected for `catalog_items` and `team_shoes_content_templates`.
3. Capture row counts before migration:
   ```bash
   psql 'postgres://bytedance@localhost:5432/gstack_web2skill' -Atqc 'SELECT COUNT(*) FROM "catalog_items"'
   psql 'postgres://bytedance@localhost:5432/gstack_web2skill' -Atqc 'SELECT COUNT(*) FROM "team_shoes_content_templates"'
   ```
4. Check for export/import blockers such as unexpected large objects or other anomalies in the source database.
5. Record the exact source connection string that will be reused for rehearsal verification.

## Rehearsal
1. Create the dump directory:
   ```bash
   mkdir -p tmp
   ```
2. Export the current machine's local database with the package script:
   ```bash
   LOCAL_DATABASE_URL='postgres://bytedance@localhost:5432/gstack_web2skill' DUMP_FILE=tmp/local.dump bun run db:migration:export-local
   ```
3. Import into the remote database with the package script:
   ```bash
   REMOTE_DATABASE_URL="$REMOTE_DATABASE_URL" DUMP_FILE=tmp/local.dump bun run db:migration:import-remote
   ```
4. Compare the required key table counts with the package script:
   ```bash
   SOURCE_DATABASE_URL='postgres://bytedance@localhost:5432/gstack_web2skill' TARGET_DATABASE_URL="$REMOTE_DATABASE_URL" bun run db:migration:verify-cutover
   ```
5. Run one controlled application start or smoke test against the remote `DATABASE_URL` before the real cutover window. Keep the test limited to startup plus one read and one write path, and set `GSTACK_REQUIRE_DATABASE_URL=1` so no deployed machine can fall back to localhost during the rehearsal.

## Rollback readiness
1. Assign one explicit rollback endpoint for the preserved current-machine PostgreSQL instance and write it into this runbook before cutover:
   - `ROLLBACK_HOST=<current-machine-routable-ip>`
   - `ROLLBACK_PORT=5432`
2. Temporarily make that PostgreSQL instance remotely reachable on `ROLLBACK_HOST:5432`.
3. Restrict inbound access to the same business-machine source IP allowlist used for the remote database.
4. Require TLS for any rollback traffic that crosses the network; the rollback URL must include `sslmode=require`.
5. Prepare and validate the explicit rollback connection string with the package script:
   ```bash
   ROLLBACK_DATABASE_URL="$ROLLBACK_DATABASE_URL" bun run db:migration:prepare-rollback
   ```
6. Confirm the rollback URL can be reached from each business machine that will switch during cutover.
7. Record and distribute that exact rollback `DATABASE_URL` to every machine that will switch during cutover.
8. Do not start cutover until the exact rollback URL is written into the runbook.

## Final cutover
1. Stop writes on the current machine.
2. Confirm no background jobs, workers, or other processes are still writing locally before the final export.
3. Re-run the local export:
   ```bash
   LOCAL_DATABASE_URL='postgres://bytedance@localhost:5432/gstack_web2skill' DUMP_FILE=tmp/local.dump bun run db:migration:export-local
   ```
4. Re-run the remote import:
   ```bash
   REMOTE_DATABASE_URL="$REMOTE_DATABASE_URL" DUMP_FILE=tmp/local.dump bun run db:migration:import-remote
   ```
5. Switch every business machine to the same remote `DATABASE_URL` and keep `GSTACK_REQUIRE_DATABASE_URL=1` set.
6. Restart the application on every switched machine.
7. Run post-cutover row-count verification:
   ```bash
   SOURCE_DATABASE_URL='postgres://bytedance@localhost:5432/gstack_web2skill' TARGET_DATABASE_URL="$REMOTE_DATABASE_URL" bun run db:migration:verify-cutover
   ```
8. Validate the application on the remote database:
   - the application starts without database connection errors
   - reads succeed
   - writes succeed
   - a new write lands in remote PostgreSQL
   - every switched machine uses the same remote `DATABASE_URL`
   - no machine continues writing to the preserved local PostgreSQL instance

## Rollback
1. Re-point every switched business machine to the prepared rollback `DATABASE_URL`.
2. Keep `GSTACK_REQUIRE_DATABASE_URL=1` set.
3. Restart the application on every rolled-back machine.
4. Confirm application startup, reads, and writes succeed against the preserved current-machine PostgreSQL instance.
5. Confirm no machine is still pointed at the failed remote database.
