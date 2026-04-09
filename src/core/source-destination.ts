import path from 'node:path';
import type { AgentDockSource } from '../manifest/types';

export function resolveSourceDestination(source: AgentDockSource): string {
  if (source.destination && source.destination.trim().length > 0) {
    return source.destination;
  }

  if (source.type === 'file') {
    return `./${path.basename(source.path)}`;
  }

  return `./${source.id}`;
}
