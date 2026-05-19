export function formatINR(amount: number): string {
  // Keep it reliable on Android even if full ICU/Intl isn’t available.
  // Prefer en-IN grouping when possible; fallback to a simple number.
  try {
    const grouped = Math.round(amount).toLocaleString('en-IN');
    return `₹${grouped}`;
  } catch {
    return `₹${Math.round(amount)}`;
  }
}

