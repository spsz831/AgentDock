# Changelog

All notable changes to this project will be documented in this file.

## [0.4.1] - 2026-07-13

### Removed
- `init` command (generic manifest scaffolding) — the AI migration flow uses `scan` to produce manifests, so `init` is no longer needed.
- `upgrade` command (v1→v2 manifest upgrade) — superseded by the `export --from-scan` bridge, which flattens the v3 scan manifest into the v2 package format.
- Generic packager demo assets: `examples/agentdock.example.yml`, `templates/.env.example`, and the broken root `agentdock.yml`.
- Orphaned types/constants: `src/types/upgrade-report.ts`, `src/constants/upgrade-warning-codes.ts`, and the `MANIFEST_ALREADY_EXISTS` / `UNSUPPORTED_MANIFEST_VERSION` error codes.
- Suite reduced to 53 tests (the 14 `init`/`upgrade` tests were removed).

### Docs
- README, PRD, `docs/manifest.md`, `docs/release.md`, `docs/scan-design.md` no longer reference `init`/`upgrade`; product scope is now strictly the AI assistant migration flow (`scan` / `export` / `install` / `doctor` / `list` / `validate`).

> This release brings the published npm package in sync with the simplified codebase (the `0.4.0` tarball still contained the removed `init`/`upgrade` commands).

## [0.4.0] - 2026-07-12

### Release
- Published to npm as **`agentdock-cli`** (bin: `agentdock`), requires Node.js >= 18.
- Build emits `dist/`; the CLI entry carries a `#!/usr/bin/env node` shebang and runtime JSON assets (`schemas/agentdock.schema.json`, `package.json`) are copied into `dist` so the published binary runs without the source tree.
- `files` whitelist (`dist`, `README.md`, `LICENSE`) keeps `node_modules`/tests out of the tarball; `prepublishOnly` rebuilds `dist` before publish.

### Added
- `export --from-scan <scan>/agentdock.scan.yml`: build an installable package from a v3 scan manifest, closing the `scan → install` loop. The engine-layer `install` consumes the package unchanged.
- `--env <file>` flag for `export --from-scan`: re-inject real secret values (keyed by `{{AGENTDOCK_<AGENT>_<KEY>}}` placeholders) into the package at export time. Defaults to masked placeholders when omitted.
- MCP servers in a scan package are aggregated into a single `.claude.json` (mcpServers only) for restore onto a fresh/target machine.
- `doctor` command: environment health check for AI assistant configs. Three modes — live (`--agent claude [--root]`), scan-artifact audit (`--from-scan <yml>`), and install-package audit (`--package <dir>`). Reuses `scan`'s scanner and `sensitive` detection. Checks config validity, migratability inventory, secret-leak risk (flags real tokens in free-text files that `scan` copies verbatim), run-state isolation, and placeholder/`.env.example` consistency. Writes `doctor-report.md` with `--out`; machine-readable via `--json`; non-zero exit on findings.
- Error code `DOCTOR_FAILED` for doctor runtime failures.
- Unit coverage for `doctor` (5 tests in `test/doctor.test.ts`): live healthy, live free-text leak (reverse), scan run-state contamination (reverse), valid scan artifact, package token leak (reverse), bringing the suite to 53 tests.
- `scan --agent codex` is now implemented: parses `~/.codex/config.toml` (TOML) and captures the whole config as a `settings` entry plus `AGENTS.md` as memory. Secrets in `mcp_servers`/`provider` env maps are isolated into `{{AGENTDOCK_CODEX_<KEY>}}` placeholders. Run-state artifacts (`auth.json` / `logs.sqlite` / `history.sqlite` / `cache` / `projects` / `goals` / `todos` / `sessions`) are never scanned or exported.
- The scan→package bridge is now Codex-aware: it derives the home root from the `.codex` segment and masks TOML `settings` entries at the object level (re-emitting valid TOML), so `export --from-scan` produces a restorable Codex package with secrets masked.
- `doctor --agent codex` live mode inspects a Codex environment (TOML validity, migratability, secret-leak risk, run-state isolation).
- Added `smol-toml` dependency for TOML parsing/serialization.
- Unit coverage for Codex (5 tests in `test/codex-scanner.test.ts`): config.toml capture, secret isolation with `AGENTDOCK_CODEX_*` keys, run-state skip (reverse), mcp_servers enumeration, and the full `scan → export --from-scan → install` loop with `--env` re-injection. Suite now at 58 tests.
- `list` command: pure-presentation inventory of what a scan captured (or a package contains). Reads the same v3 manifest that `export --from-scan` and `install` consume. Groups captured definitions by assistant (Claude Code / Codex) — MCP / Skill / Agent / Plugin / Hook / Memory / Settings — with names and counts, plus isolated-secret summary. `--agent codex` filters to one assistant; `--from-scan <yml>` and `--package <dir>` are the two sources (`--package` additionally shows the `meta/install-plan.json` file→target mappings); `--out <dir>` writes `list-report.md`; `--json` emits the unified machine-readable protocol.
- Error code `LIST_FAILED` for list runtime failures.
- Unit coverage for `list` (7 tests in `test/list.test.ts`): multi-agent inventory with names and secret count, `--agent codex` filter, `list-report.md` generation, missing-source error, package inventory with install plan, and `runListCommand` text/JSON output. Suite now at 67 tests.

### Fixed
- Removed fragile string-level placeholder surgery in the scan→package bridge; secret masking and re-injection now happen at the parsed-JSON object level via `maskSecretsInPlace(obj, basePath, agent, secretsEnv)`, so they can never desync.
- `export --from-scan` now degrades gracefully on a malformed `config.toml` / `settings.json`: it copies the file verbatim with a warning instead of crashing. `doctor` still flags any leaked token in the resulting package.
- `doctor` no longer false-positives on the deliberately-masked secret `sample` values in a scan artifact / install package: `findSecretLeaks` skips tokens containing `*` (mask output) or `{{` (placeholder), while still catching real, unmasked tokens in live mode.

## [0.1.2] - 2026-04-09

### Added
- Added symlink-aware export behavior with manifest option `options.followSymlinks` (default `true`).
- Added export test coverage for symlink follow and skip modes.

### Changed
- `export` now follows linked directories/files by default to improve Windows compatibility for skill/plugin directories.
- When `options.followSymlinks: false`, export skips symlink entries instead of attempting to dereference them.

### Docs
- Updated manifest/README/example to document `followSymlinks` behavior.

## [0.1.1] - 2026-04-09

### Added
- Added `--verbose` for `upgrade` text mode to print full diff only when explicitly requested.
- Added release draft commit grouping script: `npm run release:commits`.
- Added `docs/releases/0.1.1-draft.md` auto-update marker block (`commits:auto:start/end`).

### Changed
- Unified `init` and `upgrade` JSON output into the same versioned envelope used by other commands.
- Moved upgrade-specific JSON payload (`diff`, `summary`, versions, warnings) into `data`.
- Standardized `upgrade` non-JSON output to summary-first format for stable human-readable consumption.

### Docs
- Added `docs/release.md` release workflow and commit-group script usage.
- Added `CHANGELOG.md` and linked release assets from `README.md`.
- Updated manifest and README docs for JSON protocol, structured errors, and `upgrade --verbose`.

### Notes
- Compatibility:
  - Manifest schema impact: none.
  - JSON protocol impact: backward compatible for `schemaVersion: 1`; upgrade-specific fields now consistently nested under `data`.

## [0.1.0] - 2026-04-09

### Added
- Initial CLI command set: `init`, `validate`, `export`, `install`, `upgrade`.
- Manifest v2 support with `sources[*].destination`.
- Backward-compatible v1 manifest loading and validation.
- Upgrade pipeline from v1 to v2 with:
  - `--dry-run`
  - `--json`
  - `--write <path>`
  - `--backup`
  - `--force`
- Structured upgrade warnings with stable warning codes.
- Versioned JSON protocol (`schemaVersion: 1`) with audit fields (`generatedAt`, `toolVersion`).
- Unified JSON envelope for all commands: `schemaVersion`, `generatedAt`, `toolVersion`, `command`, `success`, `data`, `errors`.
- Stable error code constants for machine-readable consumers.
- End-to-end workflow tests and GitHub Actions CI (`build + test`).

### Changed
- `upgrade` text output is now summary-first by default.
- `upgrade` diff output is now opt-in via `--verbose`.
