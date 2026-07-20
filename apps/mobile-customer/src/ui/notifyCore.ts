const MAX_USER_MESSAGE_LENGTH = 500;
const UNSAFE_DETAIL_PATTERN = /(?:\bprisma\b|\bsqlstate\b|\bstack trace\b|\baxios(?:error)?\b|\baccess[_ -]?token\b|\bbearer\s+[a-z0-9._-]+|\bat\s+[\w$.<>]+\s*\([^\n]+:\d+:\d+\))/i;

const normalizeString = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().slice(0, MAX_USER_MESSAGE_LENGTH);

const safeMessage = (value: unknown): string | null => {
  const strings = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? [value]
      : [];

  const message = normalizeString(strings.join(', '));
  if (!message || UNSAFE_DETAIL_PATTERN.test(message)) return null;
  return message;
};

export const getUserSafeError = (error: unknown, fallback: string): string => {
  const safeFallback = safeMessage(fallback) || 'Something went wrong. Please try again.';
  if (!error || typeof error !== 'object') return safeFallback;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
    response?: {
      status?: unknown;
      data?: { message?: unknown; error?: unknown } | unknown;
    };
  };

  const code = typeof candidate.code === 'string' ? candidate.code.toUpperCase() : '';
  const status = typeof candidate.status === 'number'
    ? candidate.status
    : typeof candidate.response?.status === 'number'
      ? candidate.response.status
      : undefined;

  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return code === 'ERR_NETWORK'
      ? 'Network unavailable. Check your internet connection and try again.'
      : 'The request timed out. Please try again.';
  }

  const responseData = candidate.response?.data;
  const responseMessage = responseData && typeof responseData === 'object'
    ? safeMessage((responseData as { message?: unknown }).message)
    : null;
  if (responseMessage) return responseMessage;

  const directMessage = safeMessage(candidate.message);
  if (directMessage && directMessage.toLowerCase() !== 'network error') return directMessage;
  if (directMessage?.toLowerCase() === 'network error') {
    return 'Network unavailable. Check your internet connection and try again.';
  }

  return safeFallback;
};
