import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadManifest } from '../src/manifest/load';
import { validateManifest } from '../src/manifest/validate';

const fixturePath = path.resolve(__dirname, '../examples/agentdock.example.yml');

describe('manifest loading and validation', () => {
  it('parses a valid manifest with v2 destination fields', async () => {
    const manifest = await loadManifest(fixturePath);
    const result = validateManifest(manifest.data);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(manifest.data.version).toBe(2);
    expect(manifest.data.sources[0]?.destination).toBe('./restored/workspace');
    expect(manifest.data.sources[1]?.destination).toBe('./restored/config/settings.json');
    expect(manifest.data.templates?.[0]?.id).toBe('env-template');
    expect(manifest.data.install?.mode).toBe('package');
  });

  it('accepts a v1 manifest and allows compatibility mode', () => {
    const result = validateManifest({
      version: 1,
      project: { name: 'legacy' },
      sources: [{ id: 'workspace', type: 'directory', path: './workspace' }],
      outputs: { type: 'directory', path: './dist/out' },
    });

    expect(result.valid).toBe(true);
  });

  it('fails when project.name is missing', () => {
    const result = validateManifest({
      version: 2,
      project: {},
      sources: [{ id: 'a', type: 'file', path: './a.txt' }],
      outputs: { type: 'directory', path: './dist/out' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('project.name'))).toBe(true);
  });

  it('fails when source ids are duplicated', () => {
    const result = validateManifest({
      version: 2,
      project: { name: 'demo' },
      sources: [
        { id: 'same', type: 'file', path: './a.txt' },
        { id: 'same', type: 'directory', path: './dir' },
      ],
      outputs: { type: 'directory', path: './dist/out' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Duplicate source id'))).toBe(true);
  });

  it('fails when outputs.type is invalid', () => {
    const result = validateManifest({
      version: 2,
      project: { name: 'demo' },
      sources: [{ id: 'a', type: 'file', path: './a.txt' }],
      outputs: { type: 'archive', path: './dist/out.zip' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('outputs/type'))).toBe(true);
  });

  it('fails when include or exclude is used on a file source', () => {
    const result = validateManifest({
      version: 2,
      project: { name: 'demo' },
      sources: [
        { id: 'single', type: 'file', path: './a.txt', include: ['**/*.txt'] },
      ],
      outputs: { type: 'directory', path: './dist/out' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('include/exclude'))).toBe(true);
  });

  it('fails when template ids are duplicated', () => {
    const result = validateManifest({
      version: 2,
      project: { name: 'demo' },
      sources: [{ id: 'a', type: 'directory', path: './a' }],
      templates: [
        { id: 'tpl', source: './tpl/a.txt', destination: './a.txt' },
        { id: 'tpl', source: './tpl/b.txt', destination: './b.txt' },
      ],
      outputs: { type: 'directory', path: './dist/out' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Duplicate template id'))).toBe(true);
  });
});
