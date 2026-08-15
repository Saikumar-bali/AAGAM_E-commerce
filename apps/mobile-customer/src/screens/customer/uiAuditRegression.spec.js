const fs = require('fs');
const path = require('path');

const source = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('customer mobile UI audit regressions', () => {
  it('does not present fake product ratings, nutrition, favourites, or gallery actions', () => {
    const text = source('ProductDetailScreen.tsx');
    expect(text).not.toContain("'4.8'");
    expect(text).not.toContain("'2,342'");
    expect(text).not.toContain('Add to favourites');
    expect(text).not.toContain('View Gallery');
    expect(text).not.toContain("['67','Calories']");
    expect(text).toContain('product.description');
  });

  it('guards notification navigation and preserves cached alerts on refresh errors', () => {
    const text = source('NotificationsScreen.tsx');
    expect(text).toContain('if (item.orderId)');
    expect(text).toContain('Alerts unavailable');
    expect(text).toContain('isError && items.length === 0');
    expect(text).toContain('Showing your last loaded notifications.');
  });

  it('shows initial order failures without hiding cached history on refresh errors', () => {
    const text = source('OrdersScreen.tsx');
    expect(text).toContain('Orders unavailable');
    expect(text).toContain('isError && orderItems.length === 0');
    expect(text).toContain('Showing your last loaded order history.');
  });

  it('keeps refresh and actions truthful on saved addresses', () => {
    const text = source('SavedAddressesScreen.tsx');
    expect(text).toContain('refreshing={isRefetching}');
    expect(text).toContain('accessibilityRole="image"');
    expect(text).not.toContain('MoreVertical');
  });

  it('provides an explicit review back path and validates order context', () => {
    const text = source('ReviewScreen.tsx');
    expect(text).toContain('accessibilityLabel="Go back"');
    expect(text).toContain('if (!orderId)');
    expect(text).toContain('review_star_');
  });

  it('does not promise unavailable customer actions', () => {
    expect(source('CartScreen.tsx')).not.toContain('Choose your slot at checkout');
  });

  it('exposes complete customer account recovery and registration paths', () => {
    const login = source('../LoginScreen.tsx');
    const navigator = source('../../navigation/RootNavigator.tsx');
    const reset = source('../ResetPasswordScreen.tsx');
    expect(login).toContain('Forgot password?');
    expect(login).toContain('Create account');
    expect(login).toContain("navigation.navigate('ResetPassword')");
    expect(login).toContain("navigation.navigate('SignUp')");
    expect(navigator).toContain('name="ResetPassword"');
    expect(reset).toContain("apiClient.post('/auth/password/forgot'");
    expect(reset).toContain("apiClient.post('/auth/password/reset'");
  });
});
