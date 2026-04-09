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
  const seenSourceIds = new Set<string>();
  const seenTemplateIds = new Set<string>();

  for (const source of typedManifest.sources) {
    if (seenSourceIds.has(source.id)) {
      errors.push(`Duplicate source id: ${source.id}`);
    }
    seenSourceIds.add(source.id);

    if (source.type === 'file' && ((source.include?.length ?? 0) > 0 || (source.exclude?.length ?? 0) > 0)) {
      errors.push(`Source ${source.id} cannot use include/exclude when type=file`);
    }
  }

  for (const template of typedManifest.templates ?? []) {
    if (seenTemplateIds.has(template.id)) {
      errors.push(`Duplicate template id: ${template.id}`);
    }
    seenTemplateIds.add(template.id);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
