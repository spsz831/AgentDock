import fs from 'node:fs/promises';
import path from 'node:path';
import type { AgentDockTemplate } from '../manifest/types';

const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;

export async function renderTemplateFile(template: AgentDockTemplate, manifestDirectory: string): Promise<{ fileName: string; content: string }> {
  const templatePath = path.resolve(manifestDirectory, template.source);
  const rawContent = await fs.readFile(templatePath, 'utf8');
  const variables = template.variables ?? {};
  const missingVariables = new Set<string>();

  const content = rawContent.replace(TEMPLATE_VARIABLE_PATTERN, (_match, variableName: string) => {
    const value = variables[variableName];
    if (value === undefined) {
      missingVariables.add(variableName);
      return _match;
    }
    return value;
  });

  if (missingVariables.size > 0) {
    throw new Error(`Missing template variable(s) for ${template.id}: ${Array.from(missingVariables).join(', ')}`);
  }

  return {
    fileName: path.basename(template.source),
    content,
  };
}
