import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadManifest } from '../src/manifest/load';
import { validateManifest } from '../src/manifest/validate';

const fixturePath = path.resolve(__dirname, '../examples/agentdock.example.yml');

describe('manifest loading and validation', () => {
  it('parses a valid manifest', async () => {
    const manifest = await loadManifest(fixturePath);
    const result = validateManifest(manifest.data);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(manifest.data.project.name).toBe('agentdock-demo');
  });

  it('fails when project.name is missing', () => {
    const result = validateManifest({
      version: 1,
      project: {},
      sources: [{ id: 'a', type: 'file', path: './a.txt' }],
      outputs: { type: 'directory', path: './dist/out' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('project.name'))).toBe(true);
  });

  it('fails when source ids are duplicated', () => {
    const result = validateManifest({
      version: 1,
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
      version: 1,
      project: { name: 'demo' },
      sources: [{ id: 'a', type: 'file', path: './a.txt' }],
      outputs: { type: 'archive', path: './dist/out.zip' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('outputs/type'))).toBe(true);
  });
});
