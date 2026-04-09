import Ajv2020 from 'ajv/dist/2020';
import schema from '../../schemas/agentdock.schema.json';
import type { AgentDockManifest, ValidationResult } from './types';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile<AgentDockManifest>(schema);

function formatErrorPath(error: { instancePath: string; params?: Record<string, unknown>; schemaPath: string }): string {
  if ('missingProperty' in (error.params ?? {})) {
    const missingProperty = String(error.params?.missingProperty ?? 'unknown');
    const basePath = error.instancePath.replace(/^\//, '').replace(/\//g, '.');
    return basePath ? `${basePath}.${missingProperty}` : missingProperty;
  }

  if (error.instancePath) {
    return error.instancePath.replace(/^\//, '').replace(/\//g, '/');
  }

  return error.schemaPath.replace(/^#\//, '');
}

export function validateManifest(manifest: unknown): ValidationResult {
  const valid = validateSchema(manifest);
  const errors: string[] = [];

  if (!valid) {
    for (const error of validateSchema.errors ?? []) {
      errors.push(`${formatErrorPath(error)}: ${error.message}`);
    }
    return { valid: false, errors };
  }

  const typedManifest = manifest as AgentDockManifest;
  const seenIds = new Set<string>();

  for (const source of typedManifest.sources) {
    if (seenIds.has(source.id)) {
      errors.push(`Duplicate source id: ${source.id}`);
    }
    seenIds.add(source.id);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
