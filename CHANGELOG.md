# Changelog

All notable changes to this project will be documented in this file.

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
