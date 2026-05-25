/* eslint-disable no-console */
/**
 * Simulation test for Admin Orders Console logic:
 * - search across id/store/customer/phones
 * - queue filters (ALL / AT_RISK / UNASSIGNED)
 * - SLA risk calculation thresholds
 * - visible selection behavior for bulk operations
 */

const NOW = new Date('2026-05-25T10:00:00.000Z').getTime();

function ageMinutes(createdAt) {
  return Math.floor((NOW - new Date(createdAt).getTime()) / 60000);
}

function isUnassigned(order) {
  return !order.riderId && ['CONFIRMED', 'PICKING', 'PACKED'].includes(order.status);
}

function isAtRisk(order) {
  const age = ageMinutes(order.createdAt);
  return (
    (order.status === 'PENDING' && age > 10) ||
    (order.status === 'CONFIRMED' && age > 20) ||
    (order.status === 'OUT_FOR_DELIVERY' && age > 45)
  );
}

function matchesSearch(order, term) {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return (
    String(order.id || '').toLowerCase().includes(q) ||
    String(order.store?.name || '').toLowerCase().includes(q) ||
    String(order.customer?.name || '').toLowerCase().includes(q) ||
    String(order.customer?.phone || '').toLowerCase().includes(q) ||
    String(order.addressSnapshot?.phoneE164 || '').toLowerCase().includes(q)
  );
}

function filterOrders(orders, { searchTerm = '', statusFilter = 'All', queueFilter = 'ALL' }) {
  return orders.filter((order) => {
    const statusOk = statusFilter === 'All' ? true : order.status === statusFilter;
    const queueOk =
      queueFilter === 'ALL' ? true : queueFilter === 'AT_RISK' ? isAtRisk(order) : isUnassigned(order);
    return statusOk && queueOk && matchesSearch(order, searchTerm);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function run() {
  const orders = [
    {
      id: 'ORD-PENDING-RISK',
      status: 'PENDING',
      createdAt: '2026-05-25T09:40:00.000Z', // 20m -> at risk
      riderId: null,
      customer: { name: 'Sai Kumar', phone: '9990011223' },
      store: { name: 'Madhurawada Store' },
      addressSnapshot: { phoneE164: '+919990011223' },
    },
    {
      id: 'ORD-CONFIRM-OK',
      status: 'CONFIRMED',
      createdAt: '2026-05-25T09:50:00.000Z', // 10m -> healthy
      riderId: null,
      customer: { name: 'Anita', phone: '8880011223' },
      store: { name: 'Beach Road Store' },
      addressSnapshot: { phoneE164: '+918880011223' },
    },
    {
      id: 'ORD-CONFIRM-RISK',
      status: 'CONFIRMED',
      createdAt: '2026-05-25T09:30:00.000Z', // 30m -> at risk
      riderId: null,
      customer: { name: 'Rahul', phone: '7770011223' },
      store: { name: 'OneTown Store' },
      addressSnapshot: { phoneE164: '+917770011223' },
    },
    {
      id: 'ORD-DELIVERY-RISK',
      status: 'OUT_FOR_DELIVERY',
      createdAt: '2026-05-25T09:00:00.000Z', // 60m -> at risk
      riderId: 'rider-1',
      customer: { name: 'Meena', phone: '6660011223' },
      store: { name: 'Gajuwaka Store' },
      addressSnapshot: { phoneE164: '+916660011223' },
    },
    {
      id: 'ORD-PACKED-UNASSIGNED',
      status: 'PACKED',
      createdAt: '2026-05-25T09:57:00.000Z',
      riderId: null,
      customer: { name: 'John', phone: '5550011223' },
      store: { name: 'Vizag Store' },
      addressSnapshot: { phoneE164: '+915550011223' },
    },
  ];

  // SLA assertions
  assert(isAtRisk(orders[0]) === true, 'PENDING > 10m should be at risk');
  assert(isAtRisk(orders[1]) === false, 'CONFIRMED <= 20m should be healthy');
  assert(isAtRisk(orders[2]) === true, 'CONFIRMED > 20m should be at risk');
  assert(isAtRisk(orders[3]) === true, 'OUT_FOR_DELIVERY > 45m should be at risk');

  // Queue filters
  const atRisk = filterOrders(orders, { queueFilter: 'AT_RISK' });
  assert(atRisk.length === 3, `Expected 3 at-risk orders, got ${atRisk.length}`);

  const unassigned = filterOrders(orders, { queueFilter: 'UNASSIGNED' });
  assert(unassigned.length === 3, `Expected 3 unassigned queue orders, got ${unassigned.length}`);

  // Search fields
  assert(filterOrders(orders, { searchTerm: 'Madhurawada' }).length === 1, 'Store name search failed');
  assert(filterOrders(orders, { searchTerm: 'Sai Kumar' }).length === 1, 'Customer name search failed');
  assert(filterOrders(orders, { searchTerm: '+916660011223' }).length === 1, 'Address phone search failed');
  assert(filterOrders(orders, { searchTerm: '7770011223' }).length === 1, 'Customer phone search failed');

  // Combined filters
  const combined = filterOrders(orders, { queueFilter: 'AT_RISK', statusFilter: 'CONFIRMED' });
  assert(combined.length === 1 && combined[0].id === 'ORD-CONFIRM-RISK', 'Combined filter logic failed');

  // Bulk selection simulation for visible rows
  const visible = filterOrders(orders, { queueFilter: 'UNASSIGNED' }).map((o) => o.id);
  let selected = [];
  const allSelectedInitially = visible.length > 0 && visible.every((id) => selected.includes(id));
  assert(allSelectedInitially === false, 'Initial selection state should be false');
  selected = [...new Set([...selected, ...visible])];
  const allSelectedAfterToggle = visible.every((id) => selected.includes(id));
  assert(allSelectedAfterToggle === true, 'Select-all visible rows failed');
  selected = selected.filter((id) => !visible.includes(id));
  assert(selected.length === 0, 'Deselect-all visible rows failed');

  console.log('Admin Orders Console simulation passed.');
  console.log(`At-risk=${atRisk.length}, Unassigned=${unassigned.length}, Search/Bulk assertions OK.`);
}

try {
  run();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
