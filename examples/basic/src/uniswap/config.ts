import { existsSync, readFileSync } from 'node:fs';

export type LiveQuoteOptions = {
  readonly apiKey?: string;
  readonly permitSignature?: string;
  readonly orderSignature?: string;
  readonly baseUrl: string;
  readonly universalRouterVersion: string;
  readonly erc20EthEnabled: boolean;
  readonly permit2Disabled: boolean;
  readonly runNetworkRequest: boolean;
  readonly runSwapNetworkRequest: boolean;
  readonly runOrderNetworkRequest: boolean;
  readonly replyTimeoutMs: number;
};

/**
 * Reads Uniswap example configuration from environment variables.
 *
 * The demo keeps live API, swap, and order submission behind explicit flags so
 * developers can inspect the proof-gated flow before enabling credentialed
 * Uniswap calls.
 */
export function readLiveQuoteOptions(): LiveQuoteOptions {
  loadEnvFile();

  return {
    apiKey: readOptionalEnv('AGENTIO_UNISWAP_API_KEY'),
    permitSignature: readOptionalEnv('AGENTIO_UNISWAP_PERMIT_SIGNATURE'),
    orderSignature: readOptionalEnv('AGENTIO_UNISWAP_ORDER_SIGNATURE') ??
      readOptionalEnv('AGENTIO_UNISWAP_PERMIT_SIGNATURE'),
    baseUrl: process.env.AGENTIO_UNISWAP_API_BASE_URL ?? 'https://trade-api.gateway.uniswap.org/v1',
    universalRouterVersion: process.env.AGENTIO_UNISWAP_UNIVERSAL_ROUTER_VERSION ?? '2.0',
    erc20EthEnabled: process.env.AGENTIO_UNISWAP_ERC20_ETH_ENABLED === '1',
    permit2Disabled: process.env.AGENTIO_UNISWAP_PERMIT2_DISABLED === '1',
    runNetworkRequest: process.env.AGENTIO_UNISWAP_RUN_LIVE_API === '1' ||
      process.env.AGENTIO_UNISWAP_RUN_LIVE_QUOTE === '1',
    runSwapNetworkRequest: process.env.AGENTIO_UNISWAP_RUN_LIVE_SWAP === '1',
    runOrderNetworkRequest: process.env.AGENTIO_UNISWAP_RUN_LIVE_ORDER === '1',
    replyTimeoutMs: readPositiveIntegerEnv('AGENTIO_UNISWAP_REPLY_TIMEOUT_MS') ?? 15_000,
  };
}

function readOptionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value === undefined || value === '' ? undefined : value;
}

function readPositiveIntegerEnv(key: string): number | undefined {
  const value = readOptionalEnv(key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function loadEnvFile(path = '.env'): void {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (entry !== undefined && process.env[entry.key] === undefined) {
      process.env[entry.key] = entry.value;
    }
  }
}

function parseEnvLine(
  line: string,
): { readonly key: string; readonly value: string } | undefined {
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
