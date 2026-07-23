import { riderService } from '../../api/riderService';
import { normalizeRiderWorkspace } from '../../domain/riderWorkspace';

jest.mock('../../api/riderService', () => ({
  riderService: {
    getWorkspace: jest.fn(),
    acceptOffer: jest.fn(),
    rejectOffer: jest.fn(),
    transitionJob: jest.fn(),
    updateMyStatus: jest.fn(),
    sendLocationPing: jest.fn(),
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
  },
}));

jest.mock('../../utils/notifications', () => ({
  setupBackgroundMessageHandler: jest.fn(),
  startMobilePushLifecycle: jest.fn().mockResolvedValue(jest.fn()),
}));

jest.mock('../../services/RiderTrackingManager', () => ({
  RiderTrackingManager: jest.fn().mockImplementation(() => ({
    subscribe: jest.fn(() => jest.fn()),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    getSnapshot: jest.fn().mockReturnValue({
      active: false, orderId: null, deliveryJobId: null, status: null,
      lastSentAt: null, lastAccuracy: null, queuedCount: 0, error: null,
    }),
  })),
}));

jest.mock('@aagam/mobile-shared', () => ({
  useAuthStore: jest.fn(() => ({
    user: { name: 'Test Rider', email: 'rider@test.com' },
  })),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  default: () => ({
    onMessage: jest.fn(),
    onNotificationOpenedApp: jest.fn(),
    getInitialNotification: jest.fn().mockResolvedValue(null),
  }),
}));

jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: { getCurrentPosition: jest.fn() },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

describe('RiderDashboard data layer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads workspace from rider service', async () => {
    const workspace = {
      rider: { status: 'ONLINE' },
      activeJob: null,
      pendingOffers: [],
      assignmentHistory: [],
    };
    (riderService.getWorkspace as jest.Mock).mockResolvedValue(workspace);
    const result = await riderService.getWorkspace();
    expect(result).toEqual(workspace);
    expect(riderService.getWorkspace).toHaveBeenCalledTimes(1);
  });

  it('can accept an offer', async () => {
    (riderService.acceptOffer as jest.Mock).mockResolvedValue({ id: 'a1', status: 'ACCEPTED' });
    const result = await riderService.acceptOffer('a1');
    expect(result).toEqual({ id: 'a1', status: 'ACCEPTED' });
    expect(riderService.acceptOffer).toHaveBeenCalledWith('a1');
  });

  it('can reject an offer', async () => {
    (riderService.rejectOffer as jest.Mock).mockResolvedValue(undefined);
    await riderService.rejectOffer('a1', 'RIDER_DECLINED');
    expect(riderService.rejectOffer).toHaveBeenCalledWith('a1', 'RIDER_DECLINED');
  });

  it('can transition a delivery job', async () => {
    (riderService.transitionJob as jest.Mock).mockResolvedValue(undefined);
    await riderService.transitionJob('j1', 'EN_ROUTE_TO_STORE');
    expect(riderService.transitionJob).toHaveBeenCalledWith('j1', 'EN_ROUTE_TO_STORE');
  });

  it('can update rider online status', async () => {
    (riderService.updateMyStatus as jest.Mock).mockResolvedValue(undefined);
    await riderService.updateMyStatus('ONLINE', { latitude: 12.9, longitude: 77.5 });
    expect(riderService.updateMyStatus).toHaveBeenCalledWith('ONLINE', { latitude: 12.9, longitude: 77.5 });
  });
});
