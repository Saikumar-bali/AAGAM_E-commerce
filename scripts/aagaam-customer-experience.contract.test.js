const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const contains = (source, expected, message) => assert.ok(source.includes(expected), `${message}\nMissing: ${expected}`);
const excludes = (source, expected, message) => assert.ok(!source.includes(expected), `${message}\nUnexpected: ${expected}`);

const webLogin = read('apps/admin-dashboard/src/app/(auth)/login/page.tsx');
contains(webLogin, 'Sign in to Aagaam', 'The web login heading must use the double-A presentation brand.');
excludes(webLogin, 'Sign in to AAGAM', 'The legacy uppercase login heading must not remain visible.');
contains(webLogin, ".replace(/\\D/g, '').slice(0, 10)", 'The React phone state must sanitize and cap input to ten digits.');
contains(webLogin, 'maxLength={10}', 'The web phone field must reject an eleventh character at the DOM level.');
contains(webLogin, 'inputMode="numeric"', 'The web phone field must use a numeric keyboard.');
contains(webLogin, 'autoComplete="tel-national"', 'The web phone field must request the national ten-digit value.');
contains(webLogin, "if (!/^\\d{10}$/.test(phone))", 'OTP submission must be blocked unless React state contains exactly ten digits.');
excludes(webLogin, 'international number with country code', 'The web login must not advertise unsupported overlong or international input.');
const returnPathHelper = read('apps/admin-dashboard/src/lib/customer-return-path.ts');
contains(returnPathHelper, "requested === '/shop' || requested?.startsWith('/shop/')", 'Customer authentication must allow only safe relative shop return paths.');
contains(webLogin, "safeCustomerReturnPath(searchParams.get('returnTo'))", 'All customer login methods must honor the safe return destination.');
contains(webLogin, "customerAuthHref('/signup', customerReturnPath)", 'The login create-account link must preserve the validated customer destination.');
contains(webLogin, '<LoginPageContent />', 'The login search-parameter client content must be wrapped in Suspense.');
const signup = read('apps/admin-dashboard/src/app/(auth)/signup/page.tsx');
contains(signup, "safeCustomerReturnPath(searchParams.get('returnTo'))", 'Customer signup must validate the requested return path.');
contains(signup, 'router.push(returnTo)', 'Successful signup must return the customer to the validated destination.');
contains(signup, "customerAuthHref('/login', returnTo)", 'Signup must preserve the destination when returning to login.');
contains(signup, '<SignupPageContent />', 'The signup search-parameter client content must be wrapped in Suspense.');

const dashboardLayout = read('apps/admin-dashboard/src/components/DashboardLayout.tsx');
contains(dashboardLayout, 'returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}', 'Protected routes must preserve their destination through authentication.');

const webPhoneGuard = read('apps/admin-dashboard/src/components/TenDigitPhoneGuard.tsx');
contains(webPhoneGuard, 'input.maxLength = 10', 'The runtime phone guard must enforce ten characters.');
contains(webPhoneGuard, ".replace(/\\D/g, '').slice(0, 10)", 'The runtime phone guard must sanitize and cap the actual browser value.');
excludes(webPhoneGuard, 'input.maxLength = 13', 'The runtime phone guard must not override the JSX field back to thirteen characters.');

const customerShell = read('apps/admin-dashboard/src/components/customer/CustomerShell.tsx');
contains(customerShell, 'aria-label="Aagaam shop home"', 'The customer header accessible label must use Aagaam.');
contains(customerShell, 'alt="Aagaam"', 'The customer header logo alt text must use Aagaam.');
contains(customerShell, '>Aagaam</span>', 'The visible customer header wordmark must use Aagaam.');
excludes(customerShell, '>Aagam</span>', 'The visible single-A customer wordmark must be removed.');

const account = read('apps/admin-dashboard/src/app/(shop)/shop/account/page.tsx');
contains(account, "href: '/shop/support'", 'The account quick links must include a real Customer Support destination.');
contains(account, 'Customer Support', 'The account page must expose customer support clearly.');
excludes(account, 'overflow-hidden rounded-3xl', 'The account hero must not clip the overlapping avatar and profile content.');
excludes(account, '-mt-12', 'The account page must not use the clipped negative-margin profile layout shown in production.');
contains(account, 'max-w-4xl', 'The account page must use a responsive professional workspace width.');

const webSupportPath = 'apps/admin-dashboard/src/app/(shop)/shop/support/page.tsx';
assert.ok(existsSync(resolve(root, webSupportPath)), 'A dedicated /shop/support page must be implemented.');
const webSupport = read(webSupportPath);
contains(webSupport, "apiClient.get('/orders/my')", 'Web support must load the signed-in customer orders.');
contains(webSupport, 'apiClient.post(`/orders/post-delivery/${orderId}/support`', 'Web support must POST a real backend support ticket for the selected order.');
contains(webSupport, 'historyRequestVersion', 'Web support must version ticket-history requests.');
contains(webSupport, "const [ordersError, setOrdersError] = useState('')", 'Web support must track order-loading failures separately.');
contains(webSupport, 'Could not load your orders', 'Web support must render a distinct loading-error state.');
contains(webSupport, 'onClick={() => void loadOrders()}', 'Web support must offer an explicit retry action.');
contains(webSupport, 'if (selectedOrderRef.current === orderId) await loadTicketHistory(orderId)', 'Web support must not refresh history for an order that is no longer active.');
contains(webSupport, 'selectedOrderRef.current !== orderId', 'Web support must ignore history for a previously selected order.');
contains(webSupport, 'Support ticket opened', 'Web support must confirm successful ticket creation.');
contains(webSupport, 'Issue category', 'Web support must offer an issue category selector.');
contains(webSupport, 'Describe what happened', 'Web support must collect useful issue details.');

for (const path of [
  'apps/mobile-customer/src/screens/LoginScreen.tsx',
  'apps/mobile-partners/src/screens/LoginScreen.tsx',
]) {
  const source = read(path);
  contains(source, ".replace(/\\D/g, '').slice(0, 10)", `${path} must keep only ten numeric characters in state.`);
  contains(source, 'maxLength={10}', `${path} must reject an eleventh character at the native input level.`);
  excludes(source, 'maxLength={13}', `${path} must not allow prefixed or overlong values in the national-number field.`);
  contains(source, 'phone.length !== 10', `${path} must keep OTP submission disabled unless ten digits are present.`);
}

const customerProfile = read('apps/mobile-customer/src/screens/customer/CustomerProfileScreen.tsx');
contains(customerProfile, "navigation.navigate('Support')", 'The Customer Support row must open a dedicated support screen.');
excludes(customerProfile, 'title="Customer Support" subtitle="Open support from delivered order details" onPress={() => navigation.navigate(\'Orders\')}', 'Customer Support must not redirect back to Orders.');
contains(customerProfile, 'Aagaam uses your location', 'Visible customer mobile permission copy must use Aagaam.');
contains(customerProfile, 'Aagaam updates', 'Visible customer mobile notification copy must use Aagaam.');
excludes(customerProfile, "'AAGAM uses your location", 'Legacy customer mobile location branding must be removed.');
excludes(customerProfile, 'receive AAGAM updates', 'Legacy customer mobile notification branding must be removed.');

const mobileSupportPath = 'apps/mobile-customer/src/screens/customer/CustomerSupportScreen.tsx';
assert.ok(existsSync(resolve(root, mobileSupportPath)), 'A dedicated mobile CustomerSupportScreen must be implemented.');
const mobileSupport = read(mobileSupportPath);
contains(mobileSupport, "apiClient.get('/orders/my')", 'Mobile support must load the customer order history.');
contains(mobileSupport, "queryKey: ['customer-support-orders', customerId]", 'Mobile support order caching must be scoped to the authenticated customer.');
contains(mobileSupport, 'orders.some((order) => order.id === current)', 'Mobile support must discard a selection absent from refreshed orders.');
contains(mobileSupport, 'historyRequestVersion', 'Mobile support must version ticket-history requests.');
contains(mobileSupport, 'if (selectedOrderRef.current === orderId) await loadTicketHistory(orderId)', 'Mobile support must not refresh history for an order that is no longer active.');
contains(mobileSupport, 'selectedOrderRef.current !== orderId', 'Mobile support must ignore history for a previously selected order.');
contains(mobileSupport, 'isError', 'Mobile support must distinguish loading failures from an empty order history.');
contains(mobileSupport, 'Could not load your orders', 'Mobile support must render an explicit order-loading failure state.');
contains(mobileSupport, 'onPress={() => void refetch()}', 'Mobile support must offer an explicit retry action.');
contains(mobileSupport, 'apiClient.post(`/orders/post-delivery/${orderId}/support`', 'Mobile support must POST a real backend support ticket.');
contains(mobileSupport, 'Support ticket opened', 'Mobile support must confirm successful ticket creation.');
contains(mobileSupport, 'Select an order', 'Mobile support must let the customer select the affected order.');
contains(mobileSupport, 'Describe what happened', 'Mobile support must collect issue details.');

const customerNavigator = read('apps/mobile-customer/src/navigation/CustomerNavigator.tsx');
assert.match(customerNavigator, /<Stack\.Screen\s+name="Support"\s+component=\{CustomerSupportScreen\}/, 'The Support route must map directly to CustomerSupportScreen.');

for (const path of [
  'apps/admin-dashboard/src/components/customer/CustomerShell.tsx',
  'apps/admin-dashboard/src/app/(auth)/login/page.tsx',
  'apps/admin-dashboard/src/app/(shop)/shop/account/page.tsx',
  'apps/admin-dashboard/src/app/(shop)/shop/support/page.tsx',
  'apps/mobile-customer/src/screens/customer/CustomerProfileScreen.tsx',
  'apps/mobile-customer/src/screens/customer/CustomerSupportScreen.tsx',
]) {
  const source = read(path);
  assert.doesNotMatch(source, /(['"`])[^\n]*\bAAGAM\b[^\n]*\1/, `${path} still contains a visible uppercase single-A brand literal.`);
  assert.doesNotMatch(source, /(['"`])[^\n]*\bAagam\b[^\n]*\1/, `${path} still contains a visible title-case single-A brand literal.`);
}

console.log('Aagaam customer experience contracts passed.');
