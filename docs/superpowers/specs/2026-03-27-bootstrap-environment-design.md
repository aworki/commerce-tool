# Bootstrap Environment Design

Status: Approved in brainstorming
Date: 2026-03-27

## Summary

Add a single-entry bootstrap flow so this repository can prepare a new machine automatically on macOS and Ubuntu/Debian Linux. Running `./setup.sh` should install missing prerequisites, install Bun and PostgreSQL, start PostgreSQL, ensure a local PostgreSQL role matching the invoking OS user exists, create the default database, install project dependencies, write shell configuration, and verify that the persisted `DATABASE_URL` works in a clean login shell.

The flow must be non-interactive where possible, safe to re-run, and easy to diagnose when a step fails.

## Goals

- Support macOS and Ubuntu/Debian Linux.
- Keep a single user entrypoint: `./setup.sh`.
- Install required system dependencies for this repo.
- On macOS, install Homebrew first if it is missing.
- Initialize PostgreSQL and create the default database `gstack_web2skill`.
- Ensure the invoking OS user has a matching PostgreSQL login role for local development.
- Install project dependencies with `bun install`.
- Persist shell configuration so a new terminal can use Bun and `DATABASE_URL` without extra steps.
- Verify the environment after setup.
- Make the script idempotent so repeated runs are safe.

## Non-goals

- Windows support.
- RedHat/CentOS/Fedora support.
- Adding PGDG or any extra apt repository.
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
- persisted URL must include the resolved username, detected socket directory, and detected port

Example persisted value:

```sh
export DATABASE_URL="postgresql://resolved-username@/gstack_web2skill?host=/resolved/socket/dir&port=5432"
```

Bootstrap must discover the actual socket directory and effective port after PostgreSQL is running, then persist that exact value.

## Invocation and Privilege Model

`./setup.sh` is designed to be invoked by a normal user, not by `root`.

Rules:

- if `EUID == 0`, fail early and instruct the user to rerun as a normal user
- all profile writes target the invoking user's home directory
- on Linux, `sudo -n true` is checked only immediately before a privileged step that is actually required for the current run
- if a privileged Linux step is required and non-interactive `sudo` is unavailable, fail at that point with clear guidance
- reruns that require no privileged step must succeed without `sudo -n true`

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
  - install Bun, PostgreSQL server, PostgreSQL client tools, and required helpers
  - detect Bun provenance so profile writes only add Bun-specific exports when needed
- `scripts/bootstrap/lib/init.sh`
  - start PostgreSQL
  - ensure the selected data directory / cluster is initialized
  - discover the effective local socket directory and port
  - ensure a PostgreSQL role exists for the invoking OS user
  - create the default database if needed
  - install project dependencies
- `scripts/bootstrap/lib/profile.sh`
  - update the target shell profile with a managed block
  - persist the exact discovered `DATABASE_URL`
  - persist Bun path variables only when bootstrap installed Bun into `~/.bun`
- `scripts/bootstrap/lib/verify.sh`
  - verify commands, DB service, DB existence, and DB connectivity using the chosen socket/port
  - verify the exact persisted value in a clean login shell

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

## PostgreSQL Support Contract

Bootstrap should target one explicit PostgreSQL major version for fresh installs across both supported platforms.

- supported major: PostgreSQL 16
- macOS default formula: Homebrew `postgresql@16`
- Ubuntu/Debian support is limited to releases whose default apt repositories provide PostgreSQL 16
- Ubuntu/Debian default package set: PostgreSQL 16 server/client plus `postgresql-common`
- bootstrap must not add PGDG or any other apt repository
- if PostgreSQL 16 is unavailable from the default apt repositories on the detected Ubuntu/Debian release, fail with guidance that the release is unsupported
- only PostgreSQL 16 candidates are eligible for selection or reuse; other majors are conflicts, even if already running

## Bun Support Contract

Bootstrap does not lock a Bun major/minor, but it requires that the final clean-shell verification resolves a working `bun` binary.

## Shell Detection Contract

Shell-target detection is strict:

1. use the account login shell as the authoritative source
2. if that cannot be resolved, fall back to `$SHELL`
3. do not support extra shell-override environment variables in this bootstrap spec

## Profile Rollback Contract

On post-write verification failure, bootstrap should use a bounded rollback policy:

- always remove or restore the managed block written by this bootstrap run
- if the run created a brand-new profile file only for this bootstrap, delete that file on rollback
- if the run added a bash sourcing line or sourcing file and that change is identifiable as having been added by this bootstrap run, remove that specific sourcing change on rollback
- bootstrap does not need to snapshot and restore the full previous contents of every touched file

## Platform Strategy

### macOS

- if Homebrew is missing, bootstrap installs it first
- immediately after Homebrew installation, bootstrap must load the detected Homebrew environment into the current process via the equivalent of `brew shellenv`
- bootstrap must verify `command -v brew` succeeds before continuing
- package manager: Homebrew
- service management: `brew services`

### macOS PostgreSQL selection/init algorithm

1. inspect installed Homebrew PostgreSQL formulas and active `brew services` entries
2. consider only `postgresql@16` formulas/services as supported candidates
3. if exactly one safe `postgresql@16` candidate exists, target it
4. if no `postgresql@16` candidate exists, install `postgresql@16` and target it
5. if multiple `postgresql@16` candidates appear viable, fail instead of guessing
6. if an unsupported PostgreSQL major is the currently running Homebrew instance, treat it as a conflict rather than reusing it
7. if the chosen formula is installed but its data directory is not initialized, initialize it using the formula's supported initialization path before starting the service
8. start the chosen service and discover the effective socket directory and port from the running server

### Ubuntu/Debian

- package manager: `apt-get`
- service management: prefer `systemctl`, fallback to `service` if needed
- package install must ensure both server and client tools are present, not just `psql`
- package install must ensure `postgresql-common` is present so `pg_lsclusters`, `pg_createcluster`, and `pg_ctlcluster` are available
- if those cluster-management commands still cannot be resolved after package installation, fail instead of guessing cluster state

### Ubuntu/Debian cluster algorithm

1. verify that PostgreSQL 16 is available from the default apt repositories for the detected release; otherwise fail as unsupported
2. inspect local clusters with `pg_lsclusters`
3. consider only PostgreSQL 16 clusters as supported candidates
4. if exactly one PostgreSQL 16 cluster exists, target it
5. if no PostgreSQL 16 cluster exists, create one with `pg_createcluster`
6. start the chosen PostgreSQL 16 cluster with `pg_ctlcluster`
7. if multiple PostgreSQL 16 clusters are present, fail instead of guessing
8. if an unsupported PostgreSQL major is running locally and creates an ambiguous/conflicting environment, fail before mutation

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
- if an existing local PostgreSQL install is already running, bootstrap may use it only if it is the single selected PostgreSQL 16 candidate for this platform; on that safe selected instance, bootstrap may create the missing role and database as needed
- hard-fail behavior is reserved for ambiguous/conflicting instances, unsupported majors, insufficient privileges, a non-login matching role, or a target database owned by the wrong role
- if bootstrap cannot inspect required PostgreSQL metadata or lacks sufficient privilege to create the required role/database on the chosen instance, fail before profile writes or verification
- if the PostgreSQL role matching the invoking OS user already exists but does not have `LOGIN`, fail before profile writes or verification
- if the target database already exists but is owned by a different role, fail before profile writes or verification

### Role and database privilege path

Role creation, database creation, and ownership verification must use explicit per-platform privilege paths:

- Ubuntu/Debian: use `sudo -n -u postgres ...` for PostgreSQL role/database mutation and inspection steps that require the PostgreSQL superuser
- macOS: use the selected Homebrew PostgreSQL 16 local instance's postgres-superuser path for mutation and inspection steps
- if the required platform-specific privilege path is unavailable or denied, fail before profile writes or verification

## Bun Handling

Bootstrap must treat Bun installation and Bun profile persistence as separate decisions.

Rules:

- if `bun` is missing, install Bun using the supported install path
- if Bun is present, detect its actual location and provenance
- only write `BUN_INSTALL` and prepend `~/.bun/bin` if bootstrap installed Bun into `~/.bun`
- if Bun already works from Homebrew, asdf, or another managed path, do not overwrite the user's shell with a fake `BUN_INSTALL="$HOME/.bun"`
- if Bun works only in the current transient shell environment but cannot be proven available in a clean login shell after persistence rules are applied, fail with guidance instead of claiming success

## Shell Profile Strategy

The bootstrap must select the persistence target from the user's login shell, not from whatever wrapper shell happened to execute `./setup.sh`.

Rules:

- determine the login shell according to the Shell Detection Contract
- resolve the invoking username once during bootstrap and persist that literal username inside `DATABASE_URL`; do not leave `$USER` for future shells to expand
- if the login shell is zsh, write the managed block to `~/.zshrc`
- if the login shell is bash, write the managed block to `~/.bashrc`
- for bash, also ensure `~/.bash_profile` or `~/.profile` sources `~/.bashrc`; if neither exists, create the minimal sourcing file needed for a fresh login shell to pick up the managed block
- if the target file does not exist, create it
- if the login shell is neither bash nor zsh, fail with a clear unsupported-shell error
- if post-write verification fails, apply the Profile Rollback Contract before exiting non-zero

Managed block shape:

```sh
# >>> gstack-web2skill bootstrap >>>
export DATABASE_URL="postgresql://resolved-username@/gstack_web2skill?host=/resolved/socket/dir&port=/resolved/port"
# optional, only when Bun was installed into ~/.bun by bootstrap:
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
# <<< gstack-web2skill bootstrap <<<
```

Requirements:

- never append duplicate blocks
- replace the managed block if values need refresh
- avoid touching unrelated user profile content
- the persisted `DATABASE_URL` must exactly match the resolved username, socket path, and port selected by bootstrap

## Idempotency Rules

Each step should check whether work is already done before changing the machine.

Examples:

- if `bun` exists, skip Bun install
- if PostgreSQL client tools exist but no server is present, do not skip server install
- if PostgreSQL is already running with the intended PostgreSQL 16 instance, skip restart attempts
- if the user role exists, skip role creation
- if the database exists and is owned by the intended user role, skip creation
- if `bun install` is already satisfied, running it again is acceptable
- if the managed profile block already exists, replace or keep it rather than append another copy

Expected behavior:

- first run performs installation and initialization
- second and later runs mostly report `already installed` / `already configured` / `skipped`
- repeated runs never create duplicate profile entries or fail because the DB already exists
- reruns after a partial failure should resume safely from the first unmet step
- on a uniquely selected safe PostgreSQL 16 local instance, missing role/database state may be created during bootstrap as part of normal setup
- pre-existing hard conflicts such as a non-login matching role, wrong database owner, or unsupported PostgreSQL major are not auto-repaired; they must fail clearly and require user intervention
- if verification fails after profile mutation, bootstrap must apply the Profile Rollback Contract before exiting

## Failure Handling

The bootstrap should stop at clear boundaries and emit actionable errors. Verification should be split into pre-persist checks and post-persist clean-shell checks so the script can avoid persisting bad config; if a post-persist check still fails, the Profile Rollback Contract must be applied before exit.

Examples:

- unsupported OS: exit immediately
- unsupported shell: exit immediately
- running as root: exit immediately
- Homebrew install failure on macOS: stop before dependency installation
- failure to load `brew shellenv` or resolve `brew` after installation: stop before dependency installation
- PostgreSQL 16 unavailable from default Ubuntu/Debian apt repositories: stop and report the release as unsupported
- a privileged Linux step is required but non-interactive `sudo` is unavailable: stop before that step
- PostgreSQL install failure: stop before DB init
- PostgreSQL readiness failure: stop before role/database creation
- insufficient PostgreSQL privilege to inspect ownership or create the required role/database: stop before profile writes or verification and print guidance
- ambiguous or conflicting existing PostgreSQL 16 instance selection: stop before mutation
- unsupported PostgreSQL major is the only running candidate: stop before mutation
- matching PostgreSQL role exists without `LOGIN`: stop before profile writes or verification
- target database exists with the wrong owner: stop before profile writes or verification
- profile write failure: treat as a hard failure because persistent global configuration is in scope
- clean login shell cannot resolve `bun` or cannot use the exact persisted `DATABASE_URL`: stop and report the exact verification step
- DB connectivity verification failure: stop and report the exact verification step

## Verification Requirements

The bootstrap must verify all of the following before declaring success:

1. `bun` is executable
2. project dependencies have been installed
3. PostgreSQL is running on the chosen PostgreSQL 16 local instance
4. PostgreSQL role matching the invoking OS user exists
5. database `gstack_web2skill` exists and is owned by that role
6. `DATABASE_URL` can connect successfully using the chosen socket directory and detected port
7. the persisted `DATABASE_URL` value exactly matches the resolved socket directory, detected port, and invoking username chosen by bootstrap
8. the managed shell profile block exists in the correct target file(s)
9. a fresh terminal for the login shell resolves the expected environment

Suggested checks:

- `command -v bun`
- `command -v psql`
- instance-specific readiness check, e.g. `pg_isready -h "$PGHOST" -p "$PGPORT"`
- role check against the chosen instance
- `psql` query confirming database existence and owner
- `psql "$DATABASE_URL" -c "select 1"`
- exact-value check that the persisted `DATABASE_URL` string equals the resolved username/socket/port contract computed by bootstrap
- shell profile grep confirming the managed block markers
- login-shell startup-file check for bash when `.bash_profile` / `.profile` sourcing is required
- explicit clean-shell verification command for the login shell that asserts the exact persisted `DATABASE_URL`, checks `bun`, and performs a real DB connection, for example:
  - zsh: `zsh -lic 'test "$DATABASE_URL" = "$EXPECTED_DATABASE_URL" && command -v bun && psql "$DATABASE_URL" -c "select 1"'`
  - bash: `bash -lic 'test "$DATABASE_URL" = "$EXPECTED_DATABASE_URL" && command -v bun && psql "$DATABASE_URL" -c "select 1"'`
- optional repo validation: `bun test`

## Final Output

On success, print a compact summary such as:

```text
[ok] bun available
[ok] project dependencies installed
[ok] PostgreSQL 16 running on configured local instance
[ok] role <user> exists
[ok] database gstack_web2skill exists and is owned by <user>
[ok] DATABASE_URL connection verified
[ok] shell profile updated
```

Then show the most relevant next steps, for example:

- open a new shell if desired
- run `bun test`
- run the repo CLI commands

## Manual Test Matrix

The implementation should be checked manually against at least the following cases.

| Case | Expected exit | Evidence |
| --- | --- | --- |
| macOS clean first run with zsh | 0 | Homebrew present or installed, `brew shellenv` loaded in-process, Bun available, PostgreSQL 16 running, role/db created, `~/.zshrc` contains one managed block, clean-shell verification command passes, `DATABASE_URL` exactly matches resolved username/socket/port |
| macOS second run/idempotency | 0 | No duplicate block, no duplicate DB create, clean-shell verification command still passes |
| macOS first run with bash login shell | 0 | Correct bash startup files are updated, clean-shell verification command passes, `DATABASE_URL` exactly matches resolved username/socket/port |
| macOS second run/idempotency with bash login shell | 0 | No duplicate block, no duplicate DB create, clean-shell verification command still passes |
| macOS without Homebrew | 0 | Homebrew installed first, `brew shellenv` loaded, remaining bootstrap succeeds |
| macOS with multiple Homebrew PostgreSQL formulas/services and no single safe PG16 target | non-zero | Conflict identified before mutation, clear macOS formula-selection guidance printed |
| macOS with unsupported running PostgreSQL major and supported PG16 installed | non-zero | Unsupported running major treated as conflict before mutation |
| macOS with non-default PostgreSQL port/socket | 0 | Persisted `DATABASE_URL` exactly matches the resolved socket path and port, and clean-shell verification command passes |
| Ubuntu/Debian clean first run with bash and non-interactive sudo available | 0 | Bun available, PostgreSQL 16 running, role/db created, `~/.bashrc` contains one managed block, login-shell sourcing is in place, clean-shell verification command passes, `DATABASE_URL` exactly matches resolved username/socket/port |
| Ubuntu/Debian first run with zsh login shell | 0 | Correct zsh startup file is updated, clean-shell verification command passes, `DATABASE_URL` exactly matches resolved username/socket/port |
| Ubuntu/Debian second run/idempotency | 0 | No duplicate block, no duplicate DB create, clean-shell verification command still passes |
| Ubuntu/Debian rerun with everything already configured and no privileged step needed | 0 | Bootstrap succeeds without requiring `sudo -n true` |
| Ubuntu/Debian packages installed but no initialized PostgreSQL 16 cluster | 0 | Cluster created, started, role/db created, clean-shell verification command passes |
| Ubuntu/Debian with multiple PostgreSQL 16 clusters present | non-zero | Conflict identified before mutation, clear guidance printed |
| Ubuntu/Debian with unsupported running PostgreSQL major and supported PG16 installed | non-zero | Unsupported running major treated as conflict before mutation |
| Ubuntu/Debian release whose default apt repos do not provide `postgresql-16` | non-zero | Early unsupported-release failure without PGDG setup |
| unsupported platform | non-zero | Early failure names detected OS and supported matrix |
| Linux without non-interactive sudo when a privileged step is required | non-zero | Early failure before that mutation step, clear sudo requirement message |
| PostgreSQL 16 preinstalled and already running on intended instance | 0 | Install steps skipped, role/db checks still pass |
| PostgreSQL preinstalled but conflicting local instance | non-zero | Conflict identified before mutation, no profile update claiming success |
| inability to inspect PostgreSQL server metadata on an otherwise running instance | non-zero | Hard failure reported before profile write or verification |
| insufficient PostgreSQL privilege on the chosen instance | non-zero | Hard failure reported before profile write or verification, with privilege guidance |
| matching PostgreSQL role exists without `LOGIN` | non-zero | Hard conflict reported before profile write or verification |
| database already exists with wrong owner | non-zero | Hard conflict reported before profile write or verification |
| database already exists with correct owner | 0 | DB creation skipped, owner verified, overall verification passes |
| target shell profile file missing | 0 | File created and contains one managed block |
| wrapper-shell invocation (for example `bash ./setup.sh` from a zsh account) | 0 | Login-shell profile target still selected correctly and fresh terminal picks up config |
| existing managed block with stale values | 0 | Managed block refreshed exactly once with no duplication |
| Bun available only in transient current shell | non-zero | Clean-shell verification fails because the exact persisted environment is not usable |
| post-write clean-shell verification failure after managed block replacement | non-zero | Managed block is restored/removed according to the rollback contract |
| post-write clean-shell verification failure after bash sourcing change added by this run | non-zero | The added sourcing change is removed if attributable to this run |
| rerun after interrupted failure mid-bootstrap | 0 on rerun | Previously completed steps skipped, remaining steps complete successfully |
| login shell unsupported | non-zero | Early failure before profile write |

## Recommended Implementation Direction

Refactor the existing `setup.sh` into a stable orchestrator and move platform-specific and phase-specific logic into `scripts/bootstrap/lib/*`. This keeps the user experience unchanged while making the bootstrap maintainable and safe to extend.
