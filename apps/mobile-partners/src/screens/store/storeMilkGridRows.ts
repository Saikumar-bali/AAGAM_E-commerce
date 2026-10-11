export function rowDisplayName(row: any): string {
  return row?.customer?.name || row?.customerName || row?.name || 'Customer';
}

/**
 * Keeps a customer's live-plan rows adjacent, ordered by customer then plan, so
 * their details can render once and only the plan column repeats.
 */
export function sortGridRows<T extends { customer?: { name?: string }; plan?: { name?: string } }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const byCustomer = rowDisplayName(a).localeCompare(rowDisplayName(b));
    if (byCustomer !== 0) return byCustomer;
    return String(a.plan?.name || '').localeCompare(String(b.plan?.name || ''));
  });
}

/**
 * For each row, gives its 1-based position within its customer's run and the
 * run length, so only the first row of a run renders the customer's details.
 */
export function groupRowsByCustomer<T extends { customer?: { id?: string; name?: string } }>(
  rows: T[],
): { index: number; count: number }[] {
  const groups: { index: number; count: number }[] = [];
  const keyOf = (r: T) => r.customer?.id || rowDisplayName(r);
  let i = 0;
  while (i < rows.length) {
    const key = keyOf(rows[i]);
    let j = i;
    while (j < rows.length && keyOf(rows[j]) === key) j++;
    for (let k = i; k < j; k++) groups.push({ index: k - i + 1, count: j - i });
    i = j;
  }
  return groups;
}
