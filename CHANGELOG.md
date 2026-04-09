# Changelog

All notable changes to this project will be documented in this file.

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
