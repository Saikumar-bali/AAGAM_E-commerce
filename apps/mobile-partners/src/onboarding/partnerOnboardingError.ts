export type PartnerOnboardingError = Error & {
  safeCode?: string;
  correlationId?: string;
};

function errorMessage(error: any, fallback: string): string {
  const raw = error?.response?.data?.message || error?.message || fallback;
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'object') return raw.message || JSON.stringify(raw);
  return String(raw);
}

export function toPartnerOnboardingError(
  error: any,
  fallback: string,
): PartnerOnboardingError {
  const normalized = new Error(errorMessage(error, fallback)) as PartnerOnboardingError;
  const response = error?.response?.data;
  const safeCode = response?.code || error?.safeCode || error?.code;
  const correlationId = response?.correlationId || error?.correlationId;

  if (safeCode) normalized.safeCode = String(safeCode);
  if (correlationId) normalized.correlationId = String(correlationId);

  return normalized;
}
