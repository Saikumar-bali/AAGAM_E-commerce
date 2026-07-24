import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'StoreOrderDetailsScreen.tsx'), 'utf8');
const navigatorSource = fs.readFileSync(path.join(__dirname, '../../navigation/StoreOrdersNavigator.tsx'), 'utf8');
const operationsSource = fs.readFileSync(path.join(__dirname, 'StoreDeliveryOperationsScreen.tsx'), 'utf8');

describe('Store order fulfillment details contracts', () => {
  it('uses a real stack so Android back returns to the order queue', () => {
    expect(navigatorSource).toContain('createNativeStackNavigator');
    expect(navigatorSource).toContain('name="OrderQueue"');
    expect(navigatorSource).toContain('name="OrderDetails"');
    expect(source).toContain('store_order_details_back');
    expect(source).toContain('navigation?.goBack?.()');
  });

  it('shows every ordered product, quantity and pricing line', () => {
    expect(source).toContain('(order.items || []).map');
    expect(source).toContain("item.product?.name || 'Product'");
    expect(source).toContain('item.unitPricePaise');
    expect(source).toContain('item.lineTotalPaise');
    expect(source).toContain('Number(item.quantity || 0)');
  });

  it('supports the same fulfillment actions as the enterprise web queue', () => {
    expect(source).toContain("{ status: 'CONFIRMED', label: 'Accept order' }");
    expect(source).toContain("{ status: 'PICKING', label: 'Start preparing' }");
    expect(source).toContain("{ status: 'PACKED', label: 'Ready for pickup' }");
    expect(source).toContain('markOrderItemUnavailable');
    expect(source).toContain('getOrderItemSubstitutes');
    expect(source).toContain('applyOrderItemSubstitute');
  });

  it('keeps Returns and COD as a separate exception workflow', () => {
    expect(source).not.toContain('StoreDeliveryOperationsScreen');
    expect(operationsSource).toContain('Returns & COD');
    expect(operationsSource).toContain('Returned parcels and unsettled COD collections');
  });
});
