/**
 * Sensitive-information detection for `scan`.
 *
 * Two-layer guard: a secret is flagged when EITHER its field name looks like a
 * credential (env / token / apiKey / secret / ...) OR its value matches a known
 * token shape (sk-..., ghp_..., xoxb-..., JWT, ...). This keeps false negatives
 * low for the AI-assistant config files we target, where tokens often sit in
 * generic `env` maps.
 */

const SECRET_KEY_PATTERN = /(token|api[_-]?key|secret|password|passwd|auth|private[_-]?key|credential|access[_-]?key)/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /^sk-[a-zA-Z0-9]/, // OpenAI
  /^sk-ant-[a-zA-Z0-9]/, // Anthropic
  /^gh[pousr]_[a-zA-Z0-9]/, // GitHub
  /^xox[baprs]-[a-zA-Z0-9]/, // Slack
  /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\./, // JWT
  /^AKIA[0-9A-Z]{16}/, // AWS
  /^glpat-[a-zA-Z0-9]/, // GitLab
  /^Bearer\s+/i,
  /^AIza[0-9A-Za-z_-]{35}/, // Google
];

export function isSecretKey(name: string): boolean {
  return SECRET_KEY_PATTERN.test(name);
}

export function looksLikeSecret(value: unknown): boolean {
  if (typeof value !== 'string' || value.length < 8) {
    return false;
  }
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Scan arbitrary text (e.g. a free-text skill/agent/memory file) for leaked
 * secret tokens. Tokenizes on whitespace and common delimiters, then tests each
 * token against the same value patterns used by `looksLikeSecret`.
 *
 * `scan` only masks JSON `settings`/`mcpServers` — it copies free-text files
 * (skills/agents/memory/hooks/plugins) verbatim. `doctor` uses this to catch
 * real tokens that would otherwise ride along on `export`.
 */
export function findSecretLeaks(text: string): string[] {
  const found = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const tokens = line.split(/[\s"'`=,:;(){}[\]<>]+/).filter(Boolean);
    for (const token of tokens) {
      if (token.length < 8) {
        continue;
      }
      // Skip tokens that are already masked/placeholder — `maskSecret` emits
      // `xxxx****yyyy` and `scan` uses `{{KEY}}` placeholders. A real secret is
      // never masked, so this avoids false positives when `doctor` audits a scan
      // artifact or install package that legitimately contains masked samples.
      if (token.includes('*') || token.includes('{{')) {
        continue;
      }
      for (const pattern of SECRET_VALUE_PATTERNS) {
        const match = pattern.exec(token);
        if (match) {
          found.add(match[0]);
          break;
        }
      }
    }
    const bearer = /Bearer\s+([A-Za-z0-9._-]+)/i.exec(line);
    if (bearer) {
      found.add(`Bearer ${bearer[1]}`);
    }
  }
  return [...found];
}

export function maskSecret(value: string): string {
  if (value.length <= 4) {
    return '****';
  }
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export interface FoundSecret {
  key: string;
  value: string;
  jsonPath: string;
}

/**
 * Recursively walk a parsed JSON value and collect every leaf that looks like a
 * secret. `seen` guards against cyclic objects (e.g. shared sub-objects).
 */
export function collectSecrets(
  node: unknown,
  basePath: string,
  accumulator: FoundSecret[],
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (node === null || typeof node !== 'object') {
    return;
  }
  if (seen.has(node)) {
    return;
  }
  seen.add(node);

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      collectSecrets(item, `${basePath}[${index}]`, accumulator, seen);
    });
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const childPath = `${basePath}.${key}`;
    if (typeof value === 'string') {
      if (isSecretKey(key) || looksLikeSecret(value)) {
        accumulator.push({ key, value, jsonPath: childPath });
      }
    } else if (typeof value === 'object' && value !== null) {
      collectSecrets(value, childPath, accumulator, seen);
    }
  }
}

export function secretKeyName(agent: string, jsonPath: string): string {
  const leaf = jsonPath.split('.').pop() ?? 'SECRET';
  const cleaned = leaf.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
  return `AGENTDOCK_${agent.toUpperCase()}_${cleaned}`;
}

/**
 * Replace every secret value in a parsed JSON object with its `{{KEY}}` placeholder,
 * mutating in place. Mirrors the detection used during `scan` so the placeholder names
 * match what `renderEnvExample` emitted. Used by the scan→package bridge.
 *
 * When `secretsEnv` is supplied (keyed by the secret placeholder name, e.g.
 * `AGENTDOCK_CLUDE_GITHUB_TOKEN`), the real value is written back directly instead of
 * the placeholder — this keeps masking and re-injection on the same object so they can
 * never desync (no fragile string placeholder matching).
 */
export function maskSecretsInPlace(
  node: unknown,
  basePath: string,
  agent: string,
  secretsEnv?: Record<string, string>,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (node === null || typeof node !== 'object') {
    return;
  }
  if (seen.has(node)) {
    return;
  }
  seen.add(node);

  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      maskSecretsInPlace(item, `${basePath}[${index}]`, agent, secretsEnv, seen);
    });
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const childPath = `${basePath}.${key}`;
    if (typeof value === 'string') {
      if (isSecretKey(key) || looksLikeSecret(value)) {
        const secretName = secretKeyName(agent, childPath);
        (node as Record<string, unknown>)[key] =
          secretsEnv && secretsEnv[secretName] !== undefined ? secretsEnv[secretName] : `{{${secretName}}}`;
      }
    } else if (typeof value === 'object' && value !== null) {
      maskSecretsInPlace(value, childPath, agent, secretsEnv, seen);
    }
  }
}

/**
 * Render a `.env.example` from isolated secrets. Only placeholder keys are
 * written — never the real values, which stay on the source machine.
 */
export function renderEnvExample(secrets: { key: string; source: string; sample?: string }[]): string {
  const lines: string[] = ['# AgentDock scan — fill these in before `agentdock install`', ''];
  if (secrets.length === 0) {
    lines.push('# (no secrets detected)');
    return lines.join('\n');
  }
  for (const secret of secrets) {
    lines.push(`# source: ${secret.source}`);
    if (secret.sample) {
      lines.push(`# sample: ${secret.sample}`);
    }
    lines.push(`${secret.key}=`);
    lines.push('');
  }
  return lines.join('\n');
}
