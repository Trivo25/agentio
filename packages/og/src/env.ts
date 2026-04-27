import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads simple KEY=value pairs from an env file without overwriting existing process variables.
 *
 * Tests use this so developers can keep live 0G credentials in a local `.env`
 * file while CI and shell sessions can still provide safer explicit variables.
 */
export function loadEnvFile(path = '.env'): void {
  const envPath = resolve(process.cwd(), path);
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (entry === undefined || process.env[entry.key] !== undefined) {
      continue;
    }

    process.env[entry.key] = entry.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) {
    return undefined;
  }

  const separator = trimmed.indexOf('=');
  if (separator === -1) {
    return undefined;
  }

  const key = trimmed.slice(0, separator).trim();
  if (!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(key)) {
    return undefined;
  }

  return { key, value: unquoteEnvValue(trimmed.slice(separator + 1).trim()) };
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
