const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const sharedLogo = read('apps/admin-dashboard/src/components/AagamLogo.tsx');
assert.ok(
  sharedLogo.includes('className="block h-full w-full object-cover"'),
  'Shared Aagaam logo must fill its viewport edge-to-edge.',
);
assert.ok(
  !sharedLogo.includes('bg-white p-1'),
  'Shared Aagaam logo must not render a padded white square around the launcher artwork.',
);

const customerShell = read('apps/admin-dashboard/src/components/customer/CustomerShell.tsx');
assert.ok(
  customerShell.includes('className="block h-full w-full object-cover"'),
  'Customer header Aagaam logo must fill its viewport edge-to-edge.',
);
assert.ok(
  !customerShell.includes('bg-white p-0.5'),
  'Customer header Aagaam logo must not render a nested padded white square.',
);

const orderDetail = read('apps/admin-dashboard/src/app/(shop)/shop/orders/[id]/page.tsx');
assert.ok(
  orderDetail.includes("router.push(`/shop/support?orderId=${encodeURIComponent(order.id)}`)"),
  'Order-detail Support must navigate to the real support workspace with the affected order ID.',
);

const support = read('apps/admin-dashboard/src/app/(shop)/shop/support/page.tsx');
assert.ok(
  support.includes("new URLSearchParams(window.location.search).get('orderId')"),
  'Customer support must read the order deep-link from the URL.',
);
assert.ok(
  support.includes('items.some((order: Order) => order.id === requestedOrderId)'),
  'Customer support must accept a deep-linked order only when it belongs to the signed-in order list.',
);

console.log('Customer Support and logo-fit contracts passed.');
