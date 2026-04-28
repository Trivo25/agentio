type JsonPrimitive = string | number | boolean | null;
type CanonicalJson = JsonPrimitive | readonly CanonicalJson[] | { readonly [key: string]: CanonicalJson };

/**
 * Serializes SDK values into deterministic JSON for signatures and commitments.
 *
 * Developers rely on this when two agents need to independently hash the same
 * policy or action object and agree on the result even when object keys were
 * inserted in a different order.
 */
export function serializeCanonicalJson(value: unknown): string {
  return JSON.stringify(toCanonicalJson(value));
}

function toCanonicalJson(value: unknown): CanonicalJson {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return { type: 'bigint', value: value.toString() };
  }

  if (value instanceof Date) {
    return { type: 'date', value: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return value.map((item) => toCanonicalJson(item));
  }

  if (typeof value === 'object' && value !== undefined) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, toCanonicalJson(entryValue)]),
    );
  }

  throw new TypeError(`Cannot serialize canonical JSON value of type ${typeof value}.`);
}
