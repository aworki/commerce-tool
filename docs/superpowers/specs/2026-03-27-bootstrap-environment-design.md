# Bootstrap Environment Design

Status: Approved in brainstorming
Date: 2026-03-27

## Summary

Add a single-entry bootstrap flow so this repository can prepare a new machine automatically on macOS and Ubuntu/Debian Linux. Running `./setup.sh` should install any missing prerequisite package manager support when required, install Bun and PostgreSQL, start PostgreSQL, ensure a local PostgreSQL role matching the invoking OS user exists, create the default database, install project dependencies, write global shell configuration, and verify that `DATABASE_URL` can connect.

The flow must be non-interactive where possible, safe to re-run, and easy to diagnose when a step fails. To keep the connection model reliable on fresh machines, bootstrap will make `DATABASE_URL` the source of truth and will write an explicit socket-based local connection string into the user's shell profile. Bun shell configuration will only be written if bootstrap installed Bun into a user-local location that needs profile persistence.

## Goals

- Support macOS and Ubuntu/Debian Linux.
- Keep a single user entrypoint: `./setup.sh`.
- Install required system dependencies for this repo.
- On macOS, install Homebrew first if it is missing, because the rest of the macOS dependency flow depends on it.
- Initialize PostgreSQL and create the default database `gstack_web2skill`.
- Ensure the invoking OS user has a matching PostgreSQL login role for local development.
- Install project dependencies with `bun install`.
- Persist shell configuration so a new terminal can use Bun and `DATABASE_URL` without extra steps.
- Verify the environment after setup.
- Make the script idempotent so repeated runs are safe.

## Non-goals

- Windows support.
- RedHat/CentOS/Fedora support.
- PostgreSQL authentication policy changes.
- Complex database role management beyond ensuring a local dev role for the invoking user.
- General machine provisioning beyond what this repository needs.
- Introducing a new task runner such as `make` or `just`.

## Existing Repository Constraints

Current behavior already assumes:

- Database name: `gstack_web2skill` (`setup.sh`)
- The app reads `process.env.DATABASE_URL` first, then falls back to a hardcoded local URL (`src/db/client.ts`)
- Dependency install command: `bun install` (`setup.sh`)
- Basic test command: `bun test` (`package.json`)

The new design should preserve the existing database name and developer workflow, but bootstrap should stop relying on the hardcoded fallback by always writing and verifying an explicit `DATABASE_URL`.

## Connection Contract

Bootstrap will define one explicit supported connection contract and use it consistently everywhere:

- connection type: Unix socket, not passwordless TCP to `localhost`
- database: `gstack_web2skill`
- PostgreSQL role: same name as the invoking OS user
- ownership: the created database is owned by that user role
- environment source of truth: `DATABASE_URL`

Bootstrap must discover the actual socket directory after PostgreSQL is running by querying the server, then write a concrete value such as:

```sh
export DATABASE_URL="postgresql://$USER@/gstack_web2skill?host=/var/run/postgresql"
```

or the macOS-equivalent socket directory if different.

This avoids assuming that fresh machines allow passwordless TCP auth on `localhost`, and it avoids guessing the socket path in advance.

## Invocation and Privilege Model

`./setup.sh` is designed to be invoked by a normal user, not by `root`.

Rules:

- if `EUID == 0`, fail early and instruct the user to rerun as a normal user
- macOS package installation uses Homebrew as the invoking user
- Ubuntu/Debian package installation and service control may use `sudo`
- on Linux, the script should check `sudo -n true` before any privileged step
- if non-interactive `sudo` is unavailable, fail early with a message explaining that cached or passwordless sudo is required for this bootstrap mode
- all profile writes target the invoking user's home directory
- PostgreSQL role and database creation should be executed with the minimum privilege needed for the active platform, but the resulting role/db must belong to the invoking user

This keeps the flow compatible with the approved requirement of being fully automatic once started, while avoiding accidental writes into root-owned shell files.

## Proposed Structure

```text
setup.sh
scripts/bootstrap/lib/os.sh
scripts/bootstrap/lib/install.sh
scripts/bootstrap/lib/init.sh
scripts/bootstrap/lib/profile.sh
scripts/bootstrap/lib/verify.sh
```

### Responsibilities

- `setup.sh`
  - single public entrypoint
  - validates invocation mode
  - loads bootstrap modules
  - orchestrates the full flow
  - prints final summary and next steps
- `scripts/bootstrap/lib/os.sh`
  - detect supported OS and distro
  - choose package manager, service manager, and profile target rules
- `scripts/bootstrap/lib/install.sh`
  - install Homebrew on macOS if missing
  - install Bun, PostgreSQL server, PostgreSQL client tools, and required system helpers
  - distinguish between client-only and full server availability
  - detect Bun provenance so profile writes only add Bun-specific exports when needed
- `scripts/bootstrap/lib/init.sh`
  - start PostgreSQL
  - ensure the data directory / cluster is initialized
  - discover the effective local socket directory and port
  - ensure a PostgreSQL role exists for the invoking OS user
  - create the default database if needed
  - install project dependencies
- `scripts/bootstrap/lib/profile.sh`
  - update the target shell profile with a managed block
  - always persist the discovered `DATABASE_URL`
  - only persist Bun path variables when bootstrap installed Bun into `~/.bun`
  - export the same variables into the current shell process before verification
- `scripts/bootstrap/lib/verify.sh`
  - verify commands, DB service, DB existence, and DB connectivity using the chosen socket/port

## Execution Flow

`setup.sh` should execute the following ordered steps:

```text
validate_invocation
-> detect_os
-> ensure_prerequisites
-> install_bun
-> install_postgres
-> start_postgres
-> discover_postgres_runtime
-> ensure_database_role
-> ensure_database
-> ensure_project_dependencies
-> ensure_shell_profile
-> verify_environment
```

## Platform Strategy

### macOS

- if Homebrew is missing, bootstrap installs it first
- Package manager: Homebrew
- Service management: `brew services`
- Service discovery must handle versioned names such as `postgresql@<major>` as well as unversioned `postgresql`

### Ubuntu/Debian

- Package manager: `apt-get`
- Service management: prefer `systemctl`, fallback to `service` if needed
- package install must ensure both server and client tools are present, not just `psql`
- PostgreSQL cluster management should use the distro-native tooling (`pg_lsclusters`, `pg_createcluster`, `pg_ctlcluster`) when available

### Unsupported platforms

Fail early with a clear error message that names the detected platform and the supported matrix.

## PostgreSQL State Handling

The bootstrap must distinguish these cases explicitly:

1. client tools exist but no server is installed
2. server is installed but the service is stopped
3. service exists but the local cluster/data directory is not initialized
4. PostgreSQL is already running, but on a non-default port or socket path
5. more than one local PostgreSQL install exists

Behavior requirements:

- installation checks must confirm server availability, not only `psql`
- readiness checks must use the exact socket directory and port chosen by the bootstrap, not a bare `pg_isready`
- verification must target the same runtime values that were written to `DATABASE_URL`
- if an existing local PostgreSQL install is already running, bootstrap should use that instance only if it can prove it supports the required role/db contract; otherwise it must fail with a clear conflict message rather than mutating an unknown instance implicitly

### Ubuntu/Debian cluster algorithm

On Ubuntu/Debian, bootstrap should use a deterministic cluster-selection flow:

1. inspect local clusters with `pg_lsclusters`
2. if exactly one cluster exists for the installed major version, target that cluster
3. if no cluster exists for the installed major version, create one with `pg_createcluster`
4. start the chosen cluster with `pg_ctlcluster`
5. if multiple clusters or versions are present and bootstrap cannot identify one safe target unambiguously, fail with a conflict message instead of guessing

This keeps bootstrap predictable on Debian-family systems where package installation and cluster initialization are separate concerns.

## Bun Handling

Bootstrap must treat Bun installation and Bun profile persistence as separate decisions.

Rules:

- if `bun` is missing, install Bun using the project's supported install path
- if Bun is present, detect its actual location and provenance
- only write `BUN_INSTALL` and prepend `~/.bun/bin` if bootstrap installed Bun into `~/.bun`
- if Bun already works from Homebrew, asdf, or another managed path, do not overwrite the user's shell with a fake `BUN_INSTALL="$HOME/.bun"`
- verification only requires that `bun` resolves correctly in the current process and in a fresh terminal after profile persistence rules have been applied

## Shell Profile Strategy

The bootstrap must select the persistence target from the user's login shell, not from whatever wrapper shell happened to execute `./setup.sh`.

Rules:

- determine the login shell from the account configuration / `$SHELL`, with an optional explicit override env var if future implementation wants one
- if the login shell is zsh, write the managed block to `~/.zshrc`
- if the login shell is bash, write the managed block to `~/.bashrc`
- for bash, also ensure `~/.bash_profile` or `~/.profile` sources `~/.bashrc`; if neither exists, create the minimal sourcing file needed for a fresh login shell to pick up the managed block
- if the target file does not exist, create it
- if the login shell is neither bash nor zsh, fail with a clear unsupported-shell error because persistent global configuration is in scope
- after writing the file(s), export the same variables in the running setup process so verification does not depend on opening a new shell

Managed block shape:

```sh
# >>> gstack-web2skill bootstrap >>>
export DATABASE_URL="postgresql://$USER@/gstack_web2skill?host=/detected/socket/dir"
# optional, only when Bun was installed into ~/.bun by bootstrap:
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
# <<< gstack-web2skill bootstrap <<<
```

Requirements:

- never append duplicate blocks
- replace the managed block if values need refresh
- avoid touching unrelated user profile content
- keep both the current shell process and future shells usable

## Idempotency Rules

Each step should check whether work is already done before changing the machine.

Examples:

- if `bun` exists, skip Bun install
- if PostgreSQL client tools exist but no server is present, do not skip server install
- if PostgreSQL is already running with the intended instance, skip restart attempts
- if the user role exists, skip role creation
- if the database exists and is owned by the intended user role, skip creation
- if `bun install` is already satisfied, running it again is acceptable
- if the managed profile block already exists, replace or keep it rather than append another copy

Expected behavior:

- first run performs installation and initialization
- second and later runs mostly report `already installed` / `already configured` / `skipped`
- repeated runs never create duplicate profile entries or fail because the DB already exists
- reruns after a partial failure should resume safely from the first unmet step

## Failure Handling

The bootstrap should stop at clear boundaries and emit actionable errors.

Examples:

- unsupported OS: exit immediately
- unsupported shell: exit immediately
- running as root: exit immediately
- Homebrew install failure on macOS: stop before dependency installation
- missing package manager on Linux: exit immediately with install guidance
- non-interactive `sudo` unavailable on Linux: exit before install/start steps
- PostgreSQL install failure: stop before DB init
- PostgreSQL readiness failure: stop before role/database creation
- ambiguous or conflicting existing PostgreSQL instance: stop before mutation
- profile write failure: treat as a hard failure because the approved scope includes global configuration persistence
- DB connectivity verification failure: stop and report the exact verification step

Output should identify both the stage and the underlying command failure so the user can diagnose quickly.

## Verification Requirements

The bootstrap must verify all of the following before declaring success:

1. `bun` is executable
2. project dependencies have been installed
3. PostgreSQL is running on the chosen local instance
4. PostgreSQL role matching the invoking OS user exists
5. database `gstack_web2skill` exists and is owned by that role
6. `DATABASE_URL` can connect successfully using the chosen socket directory
7. the managed shell profile block exists in the correct target file(s)
8. a fresh terminal for the login shell would resolve the expected env setup

Suggested checks:

- `command -v bun`
- `command -v psql`
- instance-specific readiness check, e.g. `pg_isready -h "$PGHOST" -p "$PGPORT"`
- role check against the chosen instance
- `psql` query confirming database existence and owner
- `psql "$DATABASE_URL" -c "select 1"`
- shell profile grep confirming the managed block markers
- login-shell startup-file check for bash when `.bash_profile` / `.profile` sourcing is required
- optional repo validation: `bun test`

## Final Output

On success, print a compact summary such as:

```text
[ok] bun available
[ok] project dependencies installed
[ok] PostgreSQL running on configured local instance
[ok] role <user> exists
[ok] database gstack_web2skill exists and is owned by <user>
[ok] DATABASE_URL connection verified
[ok] shell profile updated
```

Then show the most relevant next steps, for example:

- open a new shell if desired, though the current setup process already used the exported values
- run `bun test`
- run the repo CLI commands

## Manual Test Matrix

The implementation should be checked manually against at least the following cases.

| Case | Expected exit | Evidence |
| --- | --- | --- |
| macOS clean first run with zsh | 0 | Homebrew present or installed, Bun available, PostgreSQL running, role/db created, `~/.zshrc` contains one managed block, `DATABASE_URL` connects |
| macOS second run/idempotency | 0 | No duplicate block, no duplicate DB create, verification still passes |
| macOS without Homebrew | 0 | Homebrew installed first, remaining bootstrap succeeds |
| Ubuntu/Debian clean first run with bash and non-interactive sudo available | 0 | Bun available, PostgreSQL running, role/db created, `~/.bashrc` contains one managed block, login-shell sourcing is in place, `DATABASE_URL` connects |
| Ubuntu/Debian second run/idempotency | 0 | No duplicate block, no duplicate DB create, verification still passes |
| Ubuntu/Debian packages installed but no initialized cluster | 0 | Cluster created, started, role/db created, verification passes |
| Ubuntu/Debian with multiple local clusters present | non-zero | Conflict identified before mutation, clear guidance printed |
| unsupported platform | non-zero | Early failure names detected OS and supported matrix |
| Linux without non-interactive sudo | non-zero | Early failure before package/service mutation, clear sudo requirement message |
| PostgreSQL preinstalled and already running on intended instance | 0 | Install steps skipped, role/db checks still pass |
| PostgreSQL preinstalled but conflicting local instance | non-zero | Conflict identified before mutation, no profile update claiming success |
| database already exists | 0 | DB creation skipped, owner verified, overall verification passes |
| target shell profile file missing | 0 | File created and contains one managed block |
| wrapper-shell invocation (for example `bash ./setup.sh` from a zsh account) | 0 | Login-shell profile target still selected correctly and fresh terminal picks up config |
| rerun after interrupted failure mid-bootstrap | 0 on rerun | Previously completed steps skipped, remaining steps complete successfully |
| login shell unsupported | non-zero | Early failure before profile write |

## Recommended Implementation Direction

Refactor the existing `setup.sh` into a stable orchestrator and move platform-specific and phase-specific logic into `scripts/bootstrap/lib/*`. This keeps the user experience unchanged while making the bootstrap maintainable and safe to extend.
