# Setup on Another Machine

Use this guide when you want another machine and its agent client to use this repo with the shared remote PostgreSQL instance.

## What this setup enables

After setup, the other machine can:

- run the repo's PostgreSQL migration helpers
- verify the remote PostgreSQL TLS certificate
- connect to the shared remote PostgreSQL database with strict TLS verification
- run the repo's DB-related test suite before using the workflow
- call the repo's shared skills from the target machine's global Claude skills directory

Repository:

- `https://github.com/aworki/commerce-tool`

## Prerequisites

Make sure the target machine has:

- Git
- Bun
- Claude Code
- access to this repository
- the remote PostgreSQL password for `app_user`
- access to the repository's tracked CA certificate at `ca/internal-ca.pem`

## 1. Clone the repository

```bash
git clone git@github.com:aworki/commerce-tool.git
cd commerce-tool
bun install
```

## 2. Install the repo skills into Claude global skills

The target machine should expose the repo's shared skills through Claude Code's global skills directory so they are callable from any session on that machine.

Currently, link these repo skills into `~/.claude/skills`:

- `catalog-ingestion`
- `shoes-transformer`
- `shoes-transformer-with-team-content`

Run:

```bash
mkdir -p ~/.claude/skills
ln -sfn "$PWD/skills/catalog-ingestion" ~/.claude/skills/catalog-ingestion
ln -sfn "$PWD/skills/shoes-transformer" ~/.claude/skills/shoes-transformer
ln -sfn "$PWD/skills/shoes-transformer-with-team-content" ~/.claude/skills/shoes-transformer-with-team-content
```

After linking them, start a new Claude Code session on that machine so the skills are loaded.

## 3. Use the repository CA certificate

After cloning the repository, the CA certificate is already available here:

```text
./ca/internal-ca.pem
```

Do not commit any of the other generated files that may sit beside it in `ca/`, especially private keys.

Only `ca/internal-ca.pem` is safe to share across machines.

## 4. Create the local `.env`

Create a `.env` file in the repository root with:

```env
DATABASE_URL=postgresql://app_user:<password>@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full
REMOTE_DATABASE_URL=postgresql://app_user:<password>@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full
DATABASE_SSL_CA_CERT_PATH=./ca/internal-ca.pem
GSTACK_REQUIRE_DATABASE_URL=1
```

Notes:

- replace `<password>` with the real `app_user` password
- do not commit `.env`
- do not use `sslmode=require`; use `sslmode=verify-full`

## 5. Verify the code-level test suite

Run:

```bash
bun test src/db/client.test.ts src/db/tls.test.ts src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts
```

Expected result:

- all tests pass

## 6. Verify the remote PostgreSQL TLS certificate

Run:

```bash
POSTGRES_SERVER_IP=101.47.12.162 DATABASE_SSL_CA_CERT_PATH=./ca/internal-ca.pem bash scripts/postgres-migration/verify-server-tls.sh
```

Expected result:

- output contains `IP Address:101.47.12.162`

## 7. Verify a real database connection through the repo config

Run:

```bash
bun --eval "import { Client } from 'pg'; import { buildDatabasePoolConfig } from './src/db/client'; const client = new Client(buildDatabasePoolConfig()); try { await client.connect(); const result = await client.query('select current_user, current_database()'); console.log(JSON.stringify(result.rows[0])); } finally { await client.end().catch(() => {}); }"
```

Expected result:

```json
{"current_user":"app_user","current_database":"gstack_web2skill"}
```

## 8. Prompt to give another agent client

You can paste this directly into another agent client:

```text
In this repository, set up and verify the shared remote PostgreSQL connection for this machine.

Requirements:
- Use .env from the repo root
- Use ./ca/internal-ca.pem as the CA file
- Use sslmode=verify-full
- Ensure these repo skills are callable from Claude global skills via ~/.claude/skills:
  - catalog-ingestion
  - shoes-transformer
  - shoes-transformer-with-team-content
- Do not commit .env or any secret material
- Do not change business logic unless verification proves something is broken

Run these steps in order:
1. Check that ./ca/internal-ca.pem exists
2. Ensure ~/.claude/skills contains callable links for:
   - catalog-ingestion
   - shoes-transformer
   - shoes-transformer-with-team-content
3. Run:
   bun test src/db/client.test.ts src/db/tls.test.ts src/postgresMigration/common.test.ts src/postgresMigration/scripts.test.ts
4. Run:
   POSTGRES_SERVER_IP=101.47.12.162 DATABASE_SSL_CA_CERT_PATH=./ca/internal-ca.pem bash scripts/postgres-migration/verify-server-tls.sh
5. Run a real connection verification using buildDatabasePoolConfig() and print current_user and current_database
6. Tell me clearly whether this machine is ready to use the shared remote PostgreSQL database and whether the shared skills are callable
```

## 9. Common failure cases

### `unable to verify the first certificate`

Usually means the CA file is missing, wrong, or not the same CA that signed the current PostgreSQL server certificate.

### `DATABASE_SSL_CA_CERT_PATH is required`

Usually means `.env` is missing the CA path or the agent is not running with the expected repo-root environment.

### `sslmode=require`

That is not the final contract for this setup. Use `sslmode=verify-full`.

### skill not found

Usually means the repo skill directory was not linked into `~/.claude/skills`, the link target is wrong, or Claude Code needs a fresh session to load newly added skills.

## 10. What should and should not go to GitHub

Safe to push:

- code changes
- migration scripts
- tests
- runbooks
- setup docs like this one

Do not push:

- `.env`
- `ca/internal-ca.key`
- `ca/server.key`
- `ca/server.crt`
- `ca/server.csr`
- `ca/internal-ca.srl`
- machine-local dump files
