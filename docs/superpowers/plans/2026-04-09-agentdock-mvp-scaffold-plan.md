# AgentDock MVP Scaffold + Manifest V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable AgentDock repository skeleton, define `agentdock.yml` manifest v1, and ship a minimal CLI with `init`, `validate`, and `export`.

**Architecture:** Use a small Node.js + TypeScript CLI app. Keep manifest handling isolated in `src/manifest`, CLI entrypoints in `src/commands`, and export behavior in `src/core`. Use YAML as the user-facing format, TypeScript types as the internal model, and JSON Schema plus custom checks for validation.

**Tech Stack:** Node.js, TypeScript, YAML parser, JSON Schema validation, Vitest or Jest, npm scripts

---

## File Structure Map

### Create
- `README.md` — project overview, quickstart, MVP scope
- `.gitignore` — Node/TS ignore rules
- `package.json` — scripts, dependencies, CLI entry
- `tsconfig.json` — TypeScript compiler config
- `agentdock.yml` — local example/default manifest
- `docs/manifest.md` — manifest v1 spec for humans
- `examples/agentdock.example.yml` — canonical example manifest
- `schemas/agentdock.schema.json` — JSON Schema for structural validation
- `src/cli.ts` — CLI bootstrap and command routing
- `src/commands/init.ts` — `init` command
- `src/commands/validate.ts` — `validate` command
- `src/commands/export.ts` — `export` command
- `src/manifest/types.ts` — manifest TypeScript types
- `src/manifest/load.ts` — manifest file loading and parsing
- `src/manifest/validate.ts` — schema + semantic validation
- `src/core/exporter.ts` — export logic
- `src/utils/fs.ts` — focused filesystem helpers
- `test/manifest.test.ts` — manifest parsing/validation tests
- `test/export.test.ts` — export flow tests

### Reuse / Keep
- `MVP_边界文档.md` — existing scope boundary doc
- `docs/superpowers/specs/2026-04-09-agentdock-design.md` — approved design spec

## Proposed Manifest V1 Scope

`agentdock.yml` v1 should cover only what the MVP needs:
- `version` — manifest version, fixed initially to `1`
- `project.name` — logical project name
- `project.description` — optional short description
- `sources` — declarative source items to export from local environment
- `outputs` — export destination description
- `options` — MVP-safe flags for export behavior

Recommended source item kinds for v1:
- `file`
- `directory`
- `template` (optional placeholder, may validate but not fully execute yet)

Recommended non-goals for v1:
- plugin execution
- remote sync transport details
- WebDAV binding
- multi-manifest composition
- OS-specific imperative install scripts

### Suggested Manifest Example

```yaml
version: 1
project:
  name: agentdock-demo
  description: Minimal demo manifest
sources:
  - id: dotfiles
    type: directory
    path: ./workspace/dotfiles
  - id: settings
    type: file
    path: ./workspace/settings.json
outputs:
  type: directory
  path: ./dist/exported
options:
  includeHidden: true
  overwrite: false
```

### Semantic Rules
- `version` must equal `1`
- `project.name` is required and non-empty
- every `sources[*].id` must be unique
- every `sources[*].type` must be one of the allowed enum values
- every `sources[*].path` must be present and non-empty
- `outputs.type` for v1 must be `directory`
- `outputs.path` must be present and non-empty

### Export Behavior V1
- load manifest
- validate structure and semantics
- resolve all paths relative to the manifest file directory
- create export target directory if missing
- copy file/directory sources into an output payload tree
- write a normalized manifest snapshot into the export result for traceability

---

### Task 1: Bootstrap repository metadata and toolchain

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Write the failing repository smoke test checklist in README draft**

Add a short “Definition of Done” section stating that `npm run build`, `npm test`, and `npm run validate -- agentdock.yml` must eventually work.

- [ ] **Step 2: Create `package.json` with minimal scripts**

Include scripts like:
- `build`
- `dev`
- `test`
- `lint` (optional placeholder)
- `agentdock` or `cli`

Include dependencies for:
- TypeScript runtime/build
- YAML parsing
- JSON Schema validation
- test runner

- [ ] **Step 3: Create `tsconfig.json`**

Set CommonJS or NodeNext consistently, enable strict mode, set `rootDir` and `outDir`, and include `src` + `test`.

- [ ] **Step 4: Create `.gitignore`**

Ignore at least:
- `node_modules/`
- `dist/`
- coverage/temp output

- [ ] **Step 5: Run install/build bootstrap check**

Run: `npm install`
Expected: dependencies install successfully

Run: `npm run build`
Expected: may fail until source files exist, but package/toolchain should be recognized

- [ ] **Step 6: Commit**

```bash
git add README.md .gitignore package.json tsconfig.json
git commit -m "chore: bootstrap agentdock typescript cli"
```

### Task 2: Define manifest v1 documentation, schema, and example

**Files:**
- Create: `docs/manifest.md`
- Create: `examples/agentdock.example.yml`
- Create: `schemas/agentdock.schema.json`
- Create: `agentdock.yml`

- [ ] **Step 1: Write manifest v1 doc**

Document:
- allowed top-level fields
- each field meaning
- validation rules
- one valid example
- known non-goals

- [ ] **Step 2: Create example manifest**

Use the agreed single-file structure and only v1-safe fields.

- [ ] **Step 3: Create local default `agentdock.yml`**

Start from the example manifest and tune paths for local repo-safe testing.

- [ ] **Step 4: Write JSON Schema**

Encode required fields, enums, object shapes, and basic string/path constraints.

- [ ] **Step 5: Manually cross-check schema vs doc**

Verify the example manifest passes the schema mentally or via later validation tests.

- [ ] **Step 6: Commit**

```bash
git add docs/manifest.md examples/agentdock.example.yml schemas/agentdock.schema.json agentdock.yml
git commit -m "docs: define agentdock manifest v1"
```

### Task 3: Implement manifest types, loading, and validation

**Files:**
- Create: `src/manifest/types.ts`
- Create: `src/manifest/load.ts`
- Create: `src/manifest/validate.ts`
- Test: `test/manifest.test.ts`

- [ ] **Step 1: Write failing manifest tests**

Cover at least:
- valid manifest parses
- missing `project.name` fails
- duplicate source ids fail
- invalid `outputs.type` fails

- [ ] **Step 2: Run manifest tests to verify failure**

Run: `npm test -- manifest`
Expected: FAIL because manifest modules do not exist yet

- [ ] **Step 3: Implement `types.ts`**

Define focused types/interfaces for:
- manifest root
- project block
- source item
- output block
- options block

- [ ] **Step 4: Implement `load.ts`**

Responsibilities:
- read YAML from disk
- parse safely
- return typed raw object plus manifest directory metadata if needed

- [ ] **Step 5: Implement `validate.ts`**

Responsibilities:
- schema validation
- semantic validation
- normalized error output

- [ ] **Step 6: Re-run targeted tests**

Run: `npm test -- manifest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/manifest/types.ts src/manifest/load.ts src/manifest/validate.ts test/manifest.test.ts
git commit -m "feat: add manifest loading and validation"
```

### Task 4: Build CLI shell and validate command

**Files:**
- Create: `src/cli.ts`
- Create: `src/commands/validate.ts`
- Modify: `package.json`
- Test: `test/manifest.test.ts`

- [ ] **Step 1: Write failing CLI validation invocation test**

Test that invoking the validate command on a valid manifest exits successfully and prints a success message.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- validate`
Expected: FAIL because CLI command wiring is missing

- [ ] **Step 3: Implement `src/cli.ts`**

Support command parsing for:
- `init`
- `validate`
- `export`

A lightweight manual parser is acceptable for v1 if kept clean.

- [ ] **Step 4: Implement `src/commands/validate.ts`**

Behavior:
- locate manifest path from CLI arg or default to `./agentdock.yml`
- load manifest
- validate manifest
- print concise result
- return non-zero exit code on failure

- [ ] **Step 5: Re-run targeted tests**

Run: `npm test -- validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts src/commands/validate.ts package.json test/manifest.test.ts
git commit -m "feat: add validate cli command"
```

### Task 5: Add export core and export command

**Files:**
- Create: `src/core/exporter.ts`
- Create: `src/commands/export.ts`
- Create: `src/utils/fs.ts`
- Test: `test/export.test.ts`

- [ ] **Step 1: Write failing export tests**

Cover at least:
- exports file source into target tree
- exports directory source into target tree
- writes normalized manifest snapshot
- refuses invalid manifest

- [ ] **Step 2: Run export tests to verify failure**

Run: `npm test -- export`
Expected: FAIL because exporter modules do not exist yet

- [ ] **Step 3: Implement focused fs helpers**

Provide small helpers for:
- path resolution
- directory creation
- file copy
- directory copy

- [ ] **Step 4: Implement `src/core/exporter.ts`**

Behavior:
- accept validated manifest + base path
- resolve relative paths
- create output directory
- copy declared sources
- write normalized manifest snapshot (for example `manifest.resolved.json`)

- [ ] **Step 5: Implement `src/commands/export.ts`**

Behavior:
- load and validate manifest
- call exporter
- report destination summary

- [ ] **Step 6: Re-run targeted tests**

Run: `npm test -- export`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/exporter.ts src/commands/export.ts src/utils/fs.ts test/export.test.ts
git commit -m "feat: add manifest export workflow"
```

### Task 6: Add init command and template generation

**Files:**
- Create: `src/commands/init.ts`
- Modify: `examples/agentdock.example.yml`
- Modify: `README.md`
- Test: `test/manifest.test.ts` or add `test/init.test.ts`

- [ ] **Step 1: Write failing init test**

Test that running `init` in an empty temp directory creates `agentdock.yml` from the example template without overwriting existing files by default.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- init`
Expected: FAIL because init command is not implemented yet

- [ ] **Step 3: Implement `src/commands/init.ts`**

Behavior:
- create default `agentdock.yml`
- optionally create safe starter directories if the manifest references them
- refuse overwrite unless explicitly allowed

- [ ] **Step 4: Re-run targeted tests**

Run: `npm test -- init`
Expected: PASS

- [ ] **Step 5: Update README quickstart**

Document:
- `init`
- `validate`
- `export`
- manifest location

- [ ] **Step 6: Commit**

```bash
git add src/commands/init.ts examples/agentdock.example.yml README.md test
/git commit -m "feat: add init command"
```

### Task 7: Final verification and cleanup

**Files:**
- Modify: any touched files as needed

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS and output generated in `dist/`

- [ ] **Step 3: Run manual CLI checks**

Run:
- `node dist/cli.js validate agentdock.yml`
- `node dist/cli.js export agentdock.yml`

Expected:
- validate reports success
- export creates expected output directory and manifest snapshot

- [ ] **Step 4: Do a docs pass**

Ensure README, manifest doc, and example manifest all match actual CLI behavior.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: finish agentdock mvp scaffold"
```

## Notes / Constraints

- Keep v1 strictly small; do not pull plugin runtime or WebDAV into the implementation.
- Prefer clear error messages over abstraction-heavy architecture.
- Avoid introducing extra config files unless the CLI actually needs them.
- If a command parser library feels heavy, keep v1 parser manual.
- If `template` sources add complexity, allow the manifest type in docs as reserved-but-not-executed, or defer it explicitly before coding.

## Review Status

- Spec source: `docs/superpowers/specs/2026-04-09-agentdock-design.md`
- Plan review subagent: skipped in this session because delegation was not explicitly requested by the user.
