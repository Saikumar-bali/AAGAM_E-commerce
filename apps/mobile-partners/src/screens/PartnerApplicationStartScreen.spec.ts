import React from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

const mockApiGet = jest.fn();
const mockState: any = {
  applicationId: null,
  accessToken: null,
  isLoading: false,
  start: jest.fn(),
};

jest.mock('@aagam/mobile-shared', () => ({
  apiClient: { get: mockApiGet },
}));

jest.mock('lucide-react-native', () => ({
  Mail: () => null,
  Phone: () => null,
}));

jest.mock('../onboarding/usePartnerOnboardingStore', () => {
  const hook: any = (selector: any) => selector(mockState);
  hook.getState = () => mockState;
  return { usePartnerOnboardingStore: hook };
});

jest.mock('../components/PartnerOnboardingUI', () => ({
  palette: { teal: '#0F766E', muted: '#64748B' },
  OnboardingShell: ({ children }: any) => React.createElement(View, null, children),
  Section: ({ children }: any) => React.createElement(View, null, children),
  FormField: (props: any) => React.createElement(TextInput, props),
  PrimaryButton: ({ label, onPress }: any) =>
    React.createElement(
      Pressable,
      { testID: `button-${label}`, onPress },
      React.createElement(Text, null, label),
    ),
}));

import { PartnerApplicationStartScreen } from './PartnerApplicationStartScreen';

async function renderScreen(startImplementation: () => Promise<void>) {
  mockState.applicationId = null;
  mockState.accessToken = null;
  mockState.start = jest.fn(startImplementation);
  mockApiGet.mockResolvedValue({
    data: { mode: 'EMAIL_ONLY', phone: { available: false } },
  });

  const navigation = { reset: jest.fn(), goBack: jest.fn() };
  let renderer: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(PartnerApplicationStartScreen, {
        navigation,
        route: { params: { type: 'RIDER' } },
      }),
    );
    await Promise.resolve();
  });

  const root = renderer!.root;
  const name = root.findByProps({ placeholder: 'Enter full name' });
  const email = root.findByProps({ placeholder: 'name@example.com' });
  act(() => {
    name.props.onChangeText('Test Rider');
    email.props.onChangeText('rider@example.com');
  });

  const button = root.findByProps({ testID: 'button-Create protected application' });
  await act(async () => {
    await button.props.onPress();
  });

  return { navigation };
}

describe('PartnerApplicationStartScreen OTP transition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens OTP entry after application creation succeeds', async () => {
    const { navigation } = await renderScreen(async () => {
      mockState.applicationId = 'application-1';
      mockState.accessToken = 'access-token-1';
    });

    expect(mockState.start).toHaveBeenCalledWith({
      type: 'RIDER',
      applicantName: 'Test Rider',
      email: 'rider@example.com',
      phoneE164: undefined,
      verificationChannel: 'EMAIL',
    });
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'VerifyApplication' }],
    });
  });

  it('still opens OTP entry when creation succeeded but the immediate refresh failed', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const { navigation } = await renderScreen(async () => {
      mockState.applicationId = 'application-2';
      mockState.accessToken = 'access-token-2';
      throw new Error('Application refresh failed after OTP delivery');
    });

    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'VerifyApplication' }],
    });
    expect(alert).not.toHaveBeenCalledWith(
      'Application could not be started',
      expect.anything(),
    );
  });
});
