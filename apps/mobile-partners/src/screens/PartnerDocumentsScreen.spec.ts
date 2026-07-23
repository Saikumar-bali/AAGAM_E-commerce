import React from 'react';
import { act } from 'react';
import * as TestRenderer from 'react-test-renderer';

jest.mock('react-native', () => {
  const React = require('react');
  const createComponent = (name: string) => {
    const Component = React.forwardRef((props: any, ref: any) =>
      React.createElement('View', { ...props, ref, testID: props.testID, accessibilityLabel: props.accessibilityLabel }),
    );
    Component.displayName = name;
    return Component;
  };
  return {
    Alert: { alert: jest.fn() },
    View: createComponent('View'),
    Text: createComponent('Text'),
    TextInput: createComponent('TextInput'),
    TouchableOpacity: createComponent('TouchableOpacity'),
    Touchable: { Mixin: {} },
    Image: createComponent('Image'),
    ScrollView: createComponent('ScrollView'),
    KeyboardAvoidingView: createComponent('KeyboardAvoidingView'),
    ActivityIndicator: createComponent('ActivityIndicator'),
    processColor: (c: any) => c,
    StyleSheet: { create: (s: any) => s },
    Platform: { OS: 'android', select: (obj: any) => obj.android || obj.default },
    NativeModules: {},
    Keyboard: { dismiss: jest.fn() },
    BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
    Linking: { openURL: jest.fn() },
  };
});

jest.mock('lucide-react-native', () => {
  const R = require('react');
  const icon = (name: string) => {
    const C = (props: any) => R.createElement('View', props);
    C.displayName = name;
    return C;
  };
  return {
    Camera: icon('Camera'),
    CheckCircle2: icon('CheckCircle2'),
    FileCheck2: icon('FileCheck2'),
    FilePlus2: icon('FilePlus2'),
    FolderOpen: icon('FolderOpen'),
    RefreshCw: icon('RefreshCw'),
    Trash2: icon('Trash2'),
  };
});

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

jest.mock('../native/PartnerDocumentPicker', () => ({
  PartnerDocumentPicker: { captureImage: jest.fn(), pickDocument: jest.fn() },
}));

jest.mock('../onboarding/usePartnerOnboardingStore', () => ({
  usePartnerOnboardingStore: jest.fn(),
}));

jest.mock('../onboarding/types', () => ({
  editableApplication: jest.fn(() => true),
}));

import { PartnerDocumentsScreen } from './PartnerDocumentsScreen';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const navigation = { navigate: mockNavigate, goBack: mockGoBack };

function findTestID(root: TestRenderer.ReactTestInstance, testID: string): TestRenderer.ReactTestInstance | null {
  try {
    return root.findByProps({ testID });
  } catch {
    return null;
  }
}

function findByText(root: TestRenderer.ReactTestInstance, text: string): TestRenderer.ReactTestInstance | null {
  try {
    return root.findAllByProps({ children: text })[0] ?? root.findAll((node) =>
      typeof node.props?.children === 'string' && node.props.children.includes(text),
    )[0] ?? null;
  } catch {
    return null;
  }
}

function mockStore(overrides: Record<string, any> = {}) {
  const defaults = {
    response: {
      application: { status: 'DRAFT' },
      requirements: {
        allowedDocuments: ['IDENTITY', 'PROFILE_PHOTO'],
        requiredDocuments: ['IDENTITY'],
        completedRequired: [],
        completionPercent: 50,
      },
      documents: [],
    },
    uploadDocument: jest.fn().mockResolvedValue(undefined),
    removeDocument: jest.fn().mockResolvedValue(undefined),
    isLoading: false,
    uploadProgress: null,
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
      React.createElement(PartnerDocumentsScreen as any, { navigation }),
    );
  });
  return renderer.root;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PartnerDocumentsScreen', () => {
  it('renders the documents screen title', () => {
    mockStore();
    const root = renderScreen();
    expect(findByText(root, 'Documents')).toBeTruthy();
  });

  it('shows the document requirement list', () => {
    mockStore();
    const root = renderScreen();
    expect(findTestID(root, 'documents_requirement_IDENTITY')).toBeTruthy();
    expect(findTestID(root, 'documents_requirement_PROFILE_PHOTO')).toBeTruthy();
  });

  it('shows remaining required documents count', () => {
    mockStore();
    const root = renderScreen();
    expect(findByText(root, '1 required document remaining')).toBeTruthy();
  });

  it('renders camera and file buttons for uploading', () => {
    mockStore();
    const root = renderScreen();
    expect(findTestID(root, 'documents_camera_button')).toBeTruthy();
    expect(findTestID(root, 'documents_file_button')).toBeTruthy();
  });

  it('renders the upload button', () => {
    mockStore();
    const root = renderScreen();
    expect(findTestID(root, 'documents_upload_button')).toBeTruthy();
  });

  it('renders the continue button', () => {
    mockStore();
    const root = renderScreen();
    expect(findTestID(root, 'documents_continue_button')).toBeTruthy();
  });

  it('shows all required documents uploaded when completed', () => {
    mockStore({
      response: {
        application: { status: 'DRAFT' },
        requirements: {
          allowedDocuments: ['IDENTITY'],
          requiredDocuments: ['IDENTITY'],
          completedRequired: ['IDENTITY'],
          completionPercent: 100,
        },
        documents: [],
      },
    });
    const root = renderScreen();
    expect(findByText(root, 'All required documents are uploaded.')).toBeTruthy();
  });
});
