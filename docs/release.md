# Release Guide

This project currently follows a simple semver process:

- `0.1.x` for backward-compatible fixes and non-breaking improvements.
- `0.2.0` when introducing additive behavior that may require consumer adaptation.
- `1.0.0` once JSON protocol and manifest behavior are declared fully stable.

## Pre-release Checklist

1. Ensure working tree is clean.
2. Run:
   - `npm run build`
   - `npm test`
3. Verify key smoke paths:
   - `npm run cli -- validate agentdock.yml --json`
   - `npm run cli -- upgrade agentdock.yml --dry-run --json`
4. Update `CHANGELOG.md` for the target version.

## Cut a Patch Release (example: 0.1.1)

1. Bump version:
   - `npm version patch`
2. Push commits and tag:
   - `git push`
   - `git push --tags`

## Release Notes Template

- Summary:
  - What changed for users.
- Compatibility:
  - Manifest compatibility impact.
  - JSON protocol compatibility impact.
- Validation:
  - `build` / `test` result.
  - Optional smoke command output summary.
