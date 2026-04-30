/** Log level for user-facing 0G progress output. */
export type OgProgressLogLevel = 0 | 1 | 'verbose';

/** Options for creating a reusable 0G progress logger. */
export type OgProgressLoggerOptions = {
  /** Amount of detail to show. Level 0 is minimal, level 1 is user-facing, verbose prints raw SDK progress. */
  readonly level?: OgProgressLogLevel;
  /** Output sink used by the logger. Defaults to console.log. */
  readonly log?: (message: string) => void;
};

/**
 * Creates an `onProgress` callback for 0G network clients.
 *
 * Use this in examples, CLIs, and apps that want readable progress without
 * exposing low-level SDK internals. Level 0 only logs major lifecycle events,
 * level 1 logs the useful user-facing flow, and `verbose` forwards every raw
 * progress message for debugging live network issues.
 */
export function createOgProgressLogger(options: OgProgressLoggerOptions = {}): (message: string) => void {
  const level = options.level ?? 1;
  const log = options.log ?? console.log;
  const loggedOnce = new Set<string>();

  return (message) => {
    const formatted = formatOgProgressMessage(message, level);
    if (formatted === undefined) {
      return;
    }

    if (formatted.once === true) {
      if (loggedOnce.has(formatted.message)) {
        return;
      }
      loggedOnce.add(formatted.message);
    }

    log(formatted.message);
  };
}

/**
 * Formats a raw 0G progress message for a specific log level.
 *
 * Use this instead of `createOgProgressLogger` when an application already owns
 * structured logging and only needs the SDK to decide which messages are useful
 * enough to surface.
 */
export function formatOgProgressMessage(
  message: string,
  level: OgProgressLogLevel = 1,
): { readonly message: string; readonly once?: boolean } | undefined {
  if (level === 'verbose') {
    return { message: `[0G] ${message}` };
  }

  if (level === 0) {
    return formatLevel0(message);
  }

  return formatLevel1(message);
}

function formatLevel0(message: string): { readonly message: string; readonly once?: boolean } | undefined {
  if (message.startsWith('Transaction submitted:')) {
    return { message: `[0G] ${message.replace('Transaction submitted: ', 'transaction submitted ')}` };
  }

  if (message.startsWith('0G KV write completed')) {
    return { message: `[0G] write complete: ${summarizeWriteComplete(message)}` };
  }

  if (message === 'Upload finalized.') {
    return { message: '[0G] upload finalized' };
  }

  return undefined;
}

function formatLevel1(message: string): { readonly message: string; readonly once?: boolean } | undefined {
  if (message.startsWith('0G KV write preparing ')) {
    return { message: `[0G] write: ${summarizeWrite(message)}` };
  }

  if (message.startsWith('0G KV selected storage nodes:')) {
    return { message: `[0G] storage replicas: ${countSelectedStorageNodes(message)} selected` };
  }

  if (message.startsWith('Transaction submitted:')) {
    return { message: `[0G] ${message.replace('Transaction submitted: ', 'transaction submitted ')}` };
  }

  if (message.startsWith('Log entry confirmed')) {
    return { message: `[0G] upload: ${message}` };
  }

  if (message === 'Segments uploaded. Waiting for finality...') {
    return { message: '[0G] upload: segments uploaded, waiting for finality' };
  }

  if (message === 'Upload finalized.') {
    return { message: '[0G] upload: finalized' };
  }

  if (message.startsWith('0G KV write completed')) {
    return { message: `[0G] write complete: ${summarizeWriteComplete(message)}` };
  }

  if (message.includes('waiting for read visibility')) {
    return { message: '[0G] read: waiting for KV read visibility...', once: true };
  }

  return undefined;
}

function summarizeWrite(message: string): string {
  const key = / key=([^ ]+)/.exec(message)?.[1] ?? '<unknown-key>';
  const bytes = / bytes=(\d+)/.exec(message)?.[1] ?? '<unknown>';
  return `${key} (${bytes} bytes)`;
}

function countSelectedStorageNodes(message: string): number {
  const [, nodes = ''] = message.split(': ');
  return nodes.split(',').filter((node) => node.trim() !== '').length;
}

function summarizeWriteComplete(message: string): string {
  const txSeq = /txSeq=([^ ]+)/.exec(message)?.[1] ?? '<unknown>';
  const txHash = /txHash=([^ ]+)/.exec(message)?.[1] ?? '<unknown>';
  return `txSeq=${txSeq}, txHash=${txHash}`;
}
