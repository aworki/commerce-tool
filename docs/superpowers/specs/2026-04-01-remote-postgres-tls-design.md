# Remote PostgreSQL TLS Hardening Design

Status: Approved in brainstorming
Date: 2026-04-01

## Summary

Keep the existing remote PostgreSQL host and database, but replace the current self-signed server certificate setup with an internal CA-based TLS design that works safely across multiple client machines.

The server certificate will be reissued with `IP:101.47.12.162` in the SAN field. Each client machine that runs this project will trust the internal CA. Application connections will stay strict and encrypted instead of weakening TLS verification in Node or `pg`.

This design is driven by a real runtime failure in the current setup: the project can read the remote `DATABASE_URL`, but the Node `pg` client rejects the remote PostgreSQL connection because the server presents a self-signed certificate that the client does not trust.

## Goals

- Keep using the existing remote PostgreSQL host at `101.47.12.162:5432`.
- Keep using the existing database `gstack_web2skill` and role `app_user`.
- Support connections from multiple business machines over TLS.
- Preserve strict certificate validation instead of adding client-side trust bypasses.
- Make the connection model stable enough that future machines can be added with a repeatable trust setup.
- Minimize application-specific code changes.

## Non-goals

- Introducing a DNS name for the database host.
- Replacing PostgreSQL with another database.
- Introducing client certificate authentication.
- Building a full PKI management platform.
- Designing backup, failover, or replication.

## Current State

Repository and runtime findings relevant to this decision:

- The app uses `pg` and reads `process.env.DATABASE_URL` directly (`package.json`, `src/db/client.ts`).
- The app does not currently provide custom TLS options when constructing the `pg` pool (`src/db/client.ts`).
- The remote PostgreSQL host is already reachable and accepts TLS connections.
- Remote PostgreSQL has `ssl = on` and is listening on port `5432`.
- The remote role and database already exist:
  - role: `app_user`
  - database: `gstack_web2skill`
- A local verification attempt using the current `.env` failed with `self-signed certificate` from Node `pg`.

## Problem Statement

The current remote PostgreSQL deployment encrypts traffic, but the certificate trust model is not production-ready for multi-machine use.

With the current self-signed setup:

- TLS is present, but client trust is not portable.
- New machines cannot reliably connect without custom bypasses or ad hoc local exceptions.
- The project’s current `pg` usage rejects the connection by default because the certificate chain is not trusted.
- Any solution based on disabling verification would weaken security and create inconsistent machine-by-machine behavior.

The root issue is not PostgreSQL reachability or credentials. The root issue is certificate trust.

## Options Considered

### Option 1: Disable or weaken client certificate verification

Examples include client-side settings equivalent to `rejectUnauthorized: false` or other trust-bypass behavior.

**Pros**
- Fastest to make work.
- No server certificate reissue needed.

**Cons**
- Wrong long-term security model.
- Easy for different machines to drift into different TLS behavior.
- Makes MITM-style interception easier.
- Bakes insecure transport behavior into app runtime or machine setup.

**Decision:** Rejected.

### Option 2: Keep a self-signed server certificate and distribute that exact cert to every client

Each client would trust the server certificate directly.

**Pros**
- Better than disabling verification.
- Can work without DNS.

**Cons**
- Operationally clumsy.
- Server certificate rotation becomes harder.
- Blurs the boundary between CA trust and leaf cert identity.
- Less clean than using an internal CA.

**Decision:** Rejected.

### Option 3: Internal CA + server certificate with IP SAN

Create an internal CA, issue a PostgreSQL server certificate whose SAN includes `IP:101.47.12.162`, install that cert on the PostgreSQL server, and distribute the CA certificate to each client machine.

**Pros**
- Best fit for multi-machine access without DNS.
- Preserves strict TLS verification.
- Supports clean certificate rotation later.
- Keeps the trust model explicit and repeatable.

**Cons**
- Requires one-time CA distribution to client machines.
- Requires PostgreSQL server certificate replacement.

**Decision:** Chosen.

## Chosen Design

### Trust model

Use a small internal CA as the trust root.

- One internal CA certificate is created and stored securely.
- PostgreSQL receives a server certificate signed by that CA.
- The server certificate includes `IP:101.47.12.162` in SAN.
- Every client machine that connects to this PostgreSQL server installs or references the CA certificate.
- Client connections remain strict and must validate the server certificate chain and identity.

### Why IP SAN matters

The user will connect by IP, not by domain name. Because of that, the server certificate must identify the server by IP in SAN.

A certificate that only contains a CN or DNS SAN will not be sufficient for strict verification when clients connect to `101.47.12.162`.

### Server-side PostgreSQL design

The PostgreSQL server continues listening on `101.47.12.162:5432` with TLS enabled, but the certificate material changes:

- replace the current ad hoc/self-signed leaf certificate with a CA-signed server certificate
- keep PostgreSQL TLS enabled
- keep password authentication with `scram-sha-256`
- keep the existing role and database unless later hardening changes are needed

Expected PostgreSQL-side state after rollout:

- `ssl = on`
- `ssl_cert_file` points to the new CA-signed server certificate
- `ssl_key_file` points to the matching private key
- `pg_hba.conf` continues enforcing TLS-backed host access for `app_user`

### Client-side machine design

Each client machine that runs this project must trust the internal CA before it attempts application connections.

There are two acceptable trust patterns:

1. **OS trust store approach**
   - Install the internal CA into the machine trust store.
   - Let Node and other tooling rely on normal system trust.

2. **App-local CA file approach**
   - Store the CA certificate in a known local path on each machine.
   - Configure the runtime to supply that CA explicitly to the PostgreSQL client.

For this project, the preferred long-term approach is the **app-local CA file approach**, because it is more explicit, easier to document per project, and avoids machine-wide trust changes when only this application needs the CA.

### Application runtime contract

The repository should keep using explicit remote database configuration and stop relying on local fallback in deployment contexts.

Required runtime inputs per client machine:

- `DATABASE_URL=postgresql://app_user:<password>@101.47.12.162:5432/gstack_web2skill?sslmode=verify-full`
- `GSTACK_REQUIRE_DATABASE_URL=1`
- one explicit CA trust path or equivalent runtime TLS configuration

Important note: `sslmode=require` is not the target steady-state contract for this design. The steady state is strict verification against the internal CA and the server identity. The runtime contract should reflect that.

## Repository Impact

### Required code direction

The current project only passes `connectionString` into `pg` (`src/db/client.ts`). That is not enough for a custom internal CA setup unless the client machine trust store already handles the CA.

This leads to two possible implementation patterns:

1. **Project-managed TLS config**
   - Add explicit TLS options in `src/db/client.ts`.
   - Read a CA file path from environment.
   - Pass `ssl.ca` and strict verification settings into `pg`.

2. **Machine-managed trust only**
   - Leave `src/db/client.ts` mostly unchanged.
   - Require each machine to trust the CA globally.

Chosen direction: **Project-managed TLS config**.

Reason:

- It makes the project portable across machines.
- It reduces hidden machine-specific state.
- It makes onboarding a new machine clearer.
- It avoids assuming every runtime environment has the CA installed globally.

### Configuration contract to add

The project should move toward this environment contract:

- `DATABASE_URL`
- `GSTACK_REQUIRE_DATABASE_URL=1`
- `DATABASE_SSL_CA_CERT_PATH=<absolute path to internal-ca.pem>`

The application should read the CA file from `DATABASE_SSL_CA_CERT_PATH` and pass it into the `pg` client with strict verification enabled.

## Operational Flow

### Phase 1: Create trust materials

1. Create an internal CA.
2. Generate a server private key.
3. Create a server CSR whose SAN includes `IP:101.47.12.162`.
4. Sign the CSR with the internal CA.
5. Store the CA private key securely and separately from the PostgreSQL server.

### Phase 2: Replace PostgreSQL server certificate

1. Install the CA-signed server certificate and private key on the PostgreSQL host.
2. Update PostgreSQL TLS file references if needed.
3. Restart or reload PostgreSQL as required.
4. Verify the server presents the new certificate.

### Phase 3: Add explicit project TLS config

1. Update the app’s DB client logic to support CA-based TLS.
2. Add and document `DATABASE_SSL_CA_CERT_PATH`.
3. Keep requiring explicit `DATABASE_URL` in deployment-like environments.

### Phase 4: Distribute client trust material

1. Place the CA certificate on each client machine in a stable local path.
2. Update each machine’s `.env` or deployment environment with that path.
3. Verify each machine can connect using strict TLS verification.

### Phase 5: Cut over steady-state connection strings

1. Replace any temporary `sslmode=require` usage with the strict verified form used by the final runtime contract.
2. Validate application startup and query execution from each machine.
3. Confirm all machines point at the same remote server and none fall back to localhost.

## Security Requirements

- The CA private key must never live on the PostgreSQL server.
- The PostgreSQL private key must be readable only by the PostgreSQL service account.
- Client trust material distribution must include only the CA certificate, never the CA private key.
- The application must not ship with certificate verification disabled.
- The final runtime path must reject untrusted or mismatched certificates.

## Testing and Verification

The final implementation must verify all of the following:

1. The PostgreSQL server presents the CA-signed certificate.
2. The certificate SAN includes `IP:101.47.12.162`.
3. The Node `pg` client can connect successfully when given the correct CA.
4. The Node `pg` client rejects the connection when the CA is missing or wrong.
5. The application starts and can execute at least one read and one write path against the remote database.
6. A misconfigured machine without explicit `DATABASE_URL` still fails fast when `GSTACK_REQUIRE_DATABASE_URL=1` is set.

## Risks and Mitigations

### Risk: Certificate rotation becomes manual and error-prone

**Mitigation:** Keep the CA and server certificate generation steps scripted and documented.

### Risk: Machines drift in local CA path configuration

**Mitigation:** Standardize one CA file location per machine type and one environment variable name in the repo.

### Risk: Team keeps using weaker `sslmode=require` semantics by habit

**Mitigation:** Move the repo config and runbooks to the stricter verified configuration and stop documenting `sslmode=require` as the desired end state.

## Out of Scope Follow-ups

These are useful later but not required for this design:

- moving from IP-based access to a DNS name
- rotating app credentials on a schedule
- adding backup and restore automation
- tightening database privileges after schema-creation behavior changes
- adding monitoring for certificate expiry
