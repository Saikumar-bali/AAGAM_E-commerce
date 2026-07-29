export type PickupChecklistItem = {
  orderItemId: string;
  productId?: string;
  name?: string;
  expectedQuantity: number;
  checkedQuantity?: number;
  verified?: boolean;
};

export type RiderPickupTask = {
  status: 'PENDING' | 'VERIFIED' | 'PROBLEM_REPORTED';
  checklist: PickupChecklistItem[];
  parcelCode?: string | null;
  problemType?: string | null;
  problemNote?: string | null;
  verifiedAt?: string | null;
  updatedAt?: string | null;
};

export function checkedStateFromTask(task?: RiderPickupTask | null) {
  const checklist = task?.checklist || [];

  // A reported problem invalidates the previous physical inspection. Even when
  // the backend retains the prior checklist for audit history, the rider must
  // actively re-check every corrected item before verification can be restored.
  if (task?.status === 'PROBLEM_REPORTED') {
    return Object.fromEntries(
      checklist.map((item) => [item.orderItemId, false]),
    ) as Record<string, boolean>;
  }

  return Object.fromEntries(
    checklist.map((item) => [
      item.orderItemId,
      task?.status === 'VERIFIED' ||
        item.verified === true ||
        Number(item.checkedQuantity || 0) === Number(item.expectedQuantity || 0),
    ]),
  ) as Record<string, boolean>;
}

export function allPickupItemsChecked(items: PickupChecklistItem[], checked: Record<string, boolean>) {
  return items.length > 0 && items.every((item) => Boolean(checked[item.orderItemId]));
}

export function buildPickupChecklistLines(items: PickupChecklistItem[], checked: Record<string, boolean>) {
  return items.map((item) => ({
    orderItemId: item.orderItemId,
    checkedQuantity: checked[item.orderItemId] ? Number(item.expectedQuantity || 0) : 0,
  }));
}

export function normalizeParcelCount(value: string | number | null | undefined) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(100, parsed);
}

export function pickupReadinessLabel(status?: string | null) {
  if (status === 'VERIFIED') return 'Rider checklist verified';
  if (status === 'PROBLEM_REPORTED') return 'Rider reported a pickup problem';
  return 'Waiting for rider checklist';
}
