/**
 * Deliberately small logger. It never receives payloads, tokens, proofs, tool
 * arguments or session content; call sites log endpoint names, directions,
 * byte counts, client names and error codes only.
 */

const scopePrefix = '[private-remote]';

function formatValue(value) {
  if (value instanceof Error) {
    const code = typeof value.code === 'string' ? value.code : 'error';
    return `${code}: ${value.message}`;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === undefined || value === null) {
    return String(value);
  }
  return '[object]';
}

export function createLogger(scope = 'host') {
  const prefix = `${scopePrefix}[${scope}]`;
  return {
    info(...args) {
      console.info(prefix, ...args.map(formatValue));
    },
    warn(...args) {
      console.warn(prefix, ...args.map(formatValue));
    },
    error(...args) {
      console.error(prefix, ...args.map(formatValue));
    },
  };
}

/** Never print a token; this helper exists to make accidental logging obvious. */
export function maskSecret(value) {
  if (typeof value !== 'string' || value === '') return '<empty>';
  return `<redacted:${value.length}>`;
}
