# Setup on Another Machine

Use this guide when you want another machine and its agent client to use this repo with the shared remote PostgreSQL instance.

## What this setup enables

After setup, the other machine can:

- run the repo's PostgreSQL migration helpers
- verify the remote PostgreSQL TLS certificate
- connect to the shared remote PostgreSQL database with strict TLS verification
- run the repo's DB-related test suite before using the workflow

Repository:

- `https://github.com/aworki/commerce-tool`

## Prerequisites

Make sure the target machine has:

- Git
- Bun
- access to this repository
- the remote PostgreSQL password for `app_user`
- a copy of the CA certificate file used to trust the remote PostgreSQL server

## 1. Clone the repository

```bash
git clone git@github.com:aworki/commerce-tool.git
cd commerce-tool
bun install
```

## 2. Install the PostgreSQL CA certificate

Create the TLS directory:

```bash
mkdir -p /tmp/gstack-pg-tls
```

Copy the CA certificate onto the machine at this exact path:

```text
/tmp/gstack-pg-tls/internal-ca.pem
```

Do not rename it unless you also update `.env`.

## 3. Create the local `.env`

Create a `.env` file in the repository root with:

```env
DATABASE_URL=postgresql://app_user:<password>@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full
REMOTE_DATABASE_URL=postgresql://app_user:<password>@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full
DATABASE_SSL_CA_CERT_PATH=/tmp/gstack-pg-tls/internal-ca.pem
GSTACK_REQUIRE_DATABASE_URL=1
```

Notes:

- replace `<password>` with the real `app_user` password
- do not commit `.env`
- do not use `sslmode=require`; use `sslmode=verify-full`

## 4. Verify the code-level test suite

Run:

```bash
bun test src/db/client.test.ts src/db/tls.test.ts src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts
```

Expected result:

- all tests pass

## 5. Verify the remote PostgreSQL TLS certificate

Run:

```bash
POSTGRES_SERVER_IP=101.47.12.162 DATABASE_SSL_CA_CERT_PATH=/tmp/gstack-pg-tls/internal-ca.pem bash scripts/postgres-migration/verify-server-tls.sh
```

Expected result:

- output contains `IP Address:101.47.12.162`

## 6. Verify a real database connection through the repo config

Run:

```bash
bun --eval "import { Client } from 'pg'; import { buildDatabasePoolConfig } from './src/db/client'; const client = new Client(buildDatabasePoolConfig()); try { await client.connect(); const result = await client.query('select current_user, current_database()'); console.log(JSON.stringify(result.rows[0])); } finally { await client.end().catch(() => {}); }"
```

Expected result:

```json
{"current_user":"app_user","current_database":"gstack_web2skill"}
```

## 7. Prompt to give another agent client

You can paste this directly into another agent client:

```text
In this repository, set up and verify the shared remote PostgreSQL connection for this machine.

Requirements:
- Use .env from the repo root
- Use /tmp/gstack-pg-tls/internal-ca.pem as the CA file
- Use sslmode=verify-full
- Do not commit .env or any secret material
- Do not change business logic unless verification proves something is broken

Run these steps in order:
1. Check that /tmp/gstack-pg-tls/internal-ca.pem exists
2. Run:
   bun test src/db/client.test.ts src/db/tls.test.ts src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts
3. Run:
   POSTGRES_SERVER_IP=101.47.12.162 DATABASE_SSL_CA_CERT_PATH=/tmp/gstack-pg-tls/internal-ca.pem bash scripts/postgres-migration/verify-server-tls.sh
4. Run a real connection verification using buildDatabasePoolConfig() and print current_user and current_database
5. Tell me clearly whether this machine is ready to use the shared remote PostgreSQL database
```

## 8. Common failure cases

### `unable to verify the first certificate`

Usually means the CA file is missing, wrong, or not the same CA that signed the current PostgreSQL server certificate.

### `DATABASE_SSL_CA_CERT_PATH is required`

Usually means `.env` is missing the CA path or the agent is not running with the expected repo-root environment.

### `sslmode=require`

That is not the final contract for this setup. Use `sslmode=verify-full`.

## 9. What should and should not go to GitHub

Safe to push:

- code changes
- migration scripts
- tests
- runbooks
- setup docs like this one

Do not push:

- `.env`
- private keys
- `/tmp/gstack-pg-tls/*`
- machine-local dump files
