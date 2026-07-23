import React from 'react';
import { act } from 'react';
import * as TestRenderer from 'react-test-renderer';

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Alert.alert = jest.fn();
  RN.BackHandler = { addEventListener: jest.fn(() => ({ remove: jest.fn() })) };
  return RN;
});

jest.mock('@aagam/mobile-shared', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('../components/PartnerOnboardingUI', () => {
  const R = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    OnboardingShell: ({ children, title }: any) =>
      R.createElement(View, { testID: 'onboarding_shell' },
        R.createElement(Text, null, title),
        children,
      ),
    palette: { teal: '#14B8A6', ink: '#0F172A', muted: '#64748B', red: '#EF4444', green: '#22C55E', amber: '#F59E0B' },
    PrimaryButton: ({ label, testID, disabled }: any) =>
      R.createElement(TouchableOpacity, { testID, disabled },
        R.createElement(Text, null, label),
      ),
    Section: ({ children, title }: any) =>
      R.createElement(View, null,
        R.createElement(Text, null, title),
        children,
      ),
    StatusPill: () => null,
    ProgressBar: () => null,
    FormField: () => null,
  };
});

jest.mock('../native/FirebasePnv', () => ({
  FirebasePnv: { isPnvSupported: jest.fn().mockResolvedValue({ supported: false }), startPnvVerification: jest.fn() },
}));

jest.mock('../onboarding/partnerVerificationPresentation', () => ({
  createVerificationHardwareBackHandler: jest.fn(() => jest.fn()),
  resetVerificationToPartnerHome: jest.fn(),
  resolveVerificationDelivery: jest.fn(() => ({ state: 'PENDING' })),
}));

jest.mock('../onboarding/usePartnerOnboardingStore', () => ({
  usePartnerOnboardingStore: jest.fn(),
}));

import { PartnerVerificationScreen } from './PartnerVerificationScreen';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const mockNavigate = jest.fn();
const navigation = { navigate: mockNavigate, replace: jest.fn() };

function findTestID(root: TestRenderer.ReactTestInstance, testID: string): TestRenderer.ReactTestInstance | null {
  try {
    return root.findByProps({ testID });
  } catch {
    return null;
  }
}

function findByText(root: TestRenderer.ReactTestInstance, text: string): TestRenderer.ReactTestInstance | null {
  try {
    return root.findAllByProps({ children: text })[0] ?? null;
  } catch {
    return null;
  }
}

function mockStore(overrides: Record<string, any> = {}) {
  const defaults = {
    applicationId: 'app-1',
    accessToken: 'token-1',
    response: { application: { type: 'RIDER', verificationChannel: 'EMAIL', email: 'test@example.com' } },
    events: [],
    type: null,
    verify: jest.fn(),
    requestVerification: jest.fn(),
    refresh: jest.fn().mockResolvedValue(undefined),
    loadEvents: jest.fn().mockResolvedValue(undefined),
    isLoading: false,
    testVerificationCode: null,
  };
  const store = { ...defaults, ...overrides };
  (usePartnerOnboardingStore as unknown as jest.Mock).mockImplementation((selector?: any) =>
    typeof selector === 'function' ? selector(store) : store,
  );
}

function renderScreen(): TestRenderer.ReactTestInstance {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(PartnerVerificationScreen as any, { navigation }),
    );
  });
  return renderer.root;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PartnerVerificationScreen', () => {
  it('renders the verification screen title when session exists', () => {
    mockStore();
    const root = renderScreen();
    expect(findByText(root, 'Verify your email')).toBeTruthy();
  });

  it('shows the six-digit code input', () => {
    mockStore();
    const root = renderScreen();
    expect(findTestID(root, 'verification_code_input')).toBeTruthy();
  });

  it('renders the verify button', () => {
    mockStore();
    const root = renderScreen();
    expect(findTestID(root, 'verification_verify_button')).toBeTruthy();
  });

  it('renders the resend button', () => {
    mockStore();
    const root = renderScreen();
    expect(findTestID(root, 'verification_resend_button')).toBeTruthy();
  });

  it('shows session unavailable when no application id', () => {
    mockStore({ applicationId: null, accessToken: null });
    const root = renderScreen();
    expect(findByText(root, 'Application session unavailable')).toBeTruthy();
  });
});
