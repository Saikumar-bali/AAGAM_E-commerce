import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('compact Rider active workspace', () => {
  const navigationPanel = read('../../components/rider/RiderNavigationPanel.tsx');
  const routeMap = read('../../components/rider/RiderRouteMap.tsx');
  const delivery = read('RiderDeliveryFlowScreen.tsx');
  const navigator = read('../../navigation/RiderNavigator.tsx');

  it('keeps the map off the main vertical flow and opens it on demand', () => {
    expect(navigationPanel).toContain('const [mapOpen, setMapOpen] = useState(false)');
    expect(navigationPanel).toContain('<Modal visible={mapOpen}');
    expect(navigationPanel).toContain('accessibilityLabel="Open live route map"');
    expect(routeMap).toContain('expanded?: boolean');
  });

  it('provides compact map and turn-by-turn actions in the navigation strip', () => {
    expect(navigationPanel).toContain('accessibilityLabel="Open turn-by-turn navigation"');
    expect(navigationPanel).toContain('google.com/maps/dir');
    expect(navigationPanel).not.toContain('\n      <RiderRouteMap\n');
  });

  it('reclaims tab-bar height and exposes essential delivery actions compactly', () => {
    expect(navigator).toContain("['RiderActiveJob', 'RiderPickup', 'RiderDelivery', 'RiderReturn']");
    expect(navigator).toContain("{ display: 'none' }");
    expect(delivery).toContain('QUICK ACTIONS');
    expect(delivery).toContain('Back to Rider jobs');
    expect(delivery).toContain('>Support</Text>');
    expect(delivery).toContain('>Safety</Text>');
  });
});
