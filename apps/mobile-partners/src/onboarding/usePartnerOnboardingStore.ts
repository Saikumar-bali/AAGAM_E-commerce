import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { apiClient } from '@aagam/mobile-shared';
import {
  PartnerApplicationEvent,
  PartnerApplicationResponse,
  PartnerApplicationType,
} from './types';
import { toPartnerOnboardingError } from './partnerOnboardingError';

const STORAGE_KEY = 'aagam_partner_application_session_v1';

type StartInput = {
  type: PartnerApplicationType;
  applicantName: string;
  email?: string;
  phoneE164?: string;
  verificationChannel: 'EMAIL' | 'PHONE';
};

type UpdateInput = {
  applicantName?: string;
  email?: string;
  phoneE164?: string;
  payload?: Record<string, any>;
};

type UploadInput = {
  type: string;
  uri: string;
  filename: string;
  mimeType: string;
  fileSize?: number;
  documentNumber?: string;
  expiresAt?: string;
};

type State = {
  applicationId: string | null;
  accessToken: string | null;
  type: PartnerApplicationType | null;
  response: PartnerApplicationResponse | null;
  events: PartnerApplicationEvent[];
  testVerificationCode: string | null;
  activationToken: string | null;
  uploadProgress: number | null;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  restore: () => Promise<void>;
  start: (input: StartInput) => Promise<void>;
  resume: (applicationId: string, accessToken: string) => Promise<void>;
  refresh: () => Promise<void>;
  requestVerification: (channel: 'EMAIL' | 'PHONE') => Promise<void>;
  verify: (code: string) => Promise<void>;
  update: (input: UpdateInput) => Promise<void>;
  uploadDocument: (input: UploadInput) => Promise<void>;
  removeDocument: (documentId: string) => Promise<void>;
  submit: () => Promise<void>;
  withdraw: () => Promise<void>;
  loadEvents: () => Promise<void>;
  claimActivation: () => Promise<string>;
  activate: (password: string) => Promise<void>;
  clear: () => Promise<void>;
};

function message(error: any, fallback: string) {
  const raw = error?.response?.data?.message || error?.message || fallback;
  if (Array.isArray(raw)) return raw.join(', ');
  if (typeof raw === 'object') return raw.message || JSON.stringify(raw);
  return String(raw);
}

function applicationHeaders(token: string) {
  return { Authorization: `Application ${token}` };
}

function idempotencyKey() {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function saveSession(
  applicationId: string,
  accessToken: string,
  type?: PartnerApplicationType | null,
) {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ applicationId, accessToken, type: type || null }),
  );
}

export const usePartnerOnboardingStore = create<State>((set, get) => ({
  applicationId: null,
  accessToken: null,
  type: null,
  response: null,
  events: [],
  testVerificationCode: null,
  activationToken: null,
  uploadProgress: null,
  isLoading: false,
  isHydrated: false,
  error: null,

  restore: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) {
        set({ isHydrated: true });
        return;
      }
      const parsed = JSON.parse(stored);
      set({
        applicationId: parsed.applicationId,
        accessToken: parsed.accessToken,
        type: parsed.type || null,
      });
      await get().refresh();
    } catch {
      await AsyncStorage.removeItem(STORAGE_KEY);
      set({ applicationId: null, accessToken: null, response: null });
    } finally {
      set({ isHydrated: true });
    }
  },

  start: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.post('/partner-onboarding/applications', input);
      await saveSession(data.applicationId, data.accessToken, input.type);
      set({
        applicationId: data.applicationId,
        accessToken: data.accessToken,
        type: input.type,
        testVerificationCode: data.verification?.code || null,
      });
      await get().refresh();
    } catch (error) {
      const text = message(error, 'Could not start partner application');
      set({ error: text });
      throw new Error(text);
    } finally {
      set({ isLoading: false });
    }
  },

  resume: async (applicationId, accessToken) => {
    set({ applicationId, accessToken, isLoading: true, error: null });
    try {
      await get().refresh();
      const type = get().response?.application.type || null;
      await saveSession(applicationId, accessToken, type);
      set({ type });
    } catch (error) {
      const text = message(error, 'Application could not be restored');
      set({ error: text });
      throw new Error(text);
    } finally {
      set({ isLoading: false });
    }
  },

  refresh: async () => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) return;
    const { data } = await apiClient.get(
      `/partner-onboarding/applications/${applicationId}`,
      { headers: applicationHeaders(accessToken) },
    );
    set({ response: data, type: data.application?.type || get().type, error: null });
  },

  requestVerification: async (channel) => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) throw new Error('Application session missing');
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.post(
        `/partner-onboarding/applications/${applicationId}/contact-code`,
        { channel },
        { headers: applicationHeaders(accessToken) },
      );
      set({ testVerificationCode: data.code || null });
    } catch (error) {
      const normalized = toPartnerOnboardingError(
        error,
        'Could not send verification code',
      );
      set({ error: normalized.message });
      throw normalized;
    } finally {
      set({ isLoading: false });
    }
  },

  verify: async (code) => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) throw new Error('Application session missing');
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.post(
        `/partner-onboarding/applications/${applicationId}/verify-contact`,
        { code },
        { headers: applicationHeaders(accessToken) },
      );
      set({ response: data, testVerificationCode: null });
    } catch (error) {
      const text = message(error, 'Verification failed');
      set({ error: text });
      throw new Error(text);
    } finally {
      set({ isLoading: false });
    }
  },

  update: async (input) => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) throw new Error('Application session missing');
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.patch(
        `/partner-onboarding/applications/${applicationId}`,
        input,
        { headers: applicationHeaders(accessToken) },
      );
      set({ response: data });
    } catch (error) {
      const text = message(error, 'Application could not be saved');
      set({ error: text });
      throw new Error(text);
    } finally {
      set({ isLoading: false });
    }
  },

  uploadDocument: async (input) => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) throw new Error('Application session missing');
    if (input.fileSize && input.fileSize > 10 * 1024 * 1024) {
      throw new Error('Document exceeds the 10 MB limit');
    }
    set({ isLoading: true, error: null, uploadProgress: 0 });
    try {
      const form = new FormData();
      form.append('type', input.type);
      if (input.documentNumber) form.append('documentNumber', input.documentNumber);
      if (input.expiresAt) form.append('expiresAt', input.expiresAt);
      form.append('file', {
        uri: input.uri,
        name: input.filename,
        type: input.mimeType,
      } as any);
      const { data } = await apiClient.post(
        `/partner-onboarding/applications/${applicationId}/documents`,
        form,
        {
          headers: {
            ...applicationHeaders(accessToken),
            'Content-Type': 'multipart/form-data',
          },
          timeout: 90000,
          onUploadProgress: (event) => {
            const total = event.total || input.fileSize || 0;
            if (total > 0) {
              set({ uploadProgress: Math.min(100, Math.round((event.loaded / total) * 100)) });
            }
          },
        },
      );
      set({ response: data, uploadProgress: 100 });
    } catch (error) {
      const text = message(error, 'Document upload failed');
      set({ error: text });
      throw new Error(text);
    } finally {
      set({ isLoading: false, uploadProgress: null });
    }
  },

  removeDocument: async (documentId) => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) throw new Error('Application session missing');
    const { data } = await apiClient.delete(
      `/partner-onboarding/applications/${applicationId}/documents/${documentId}`,
      { headers: applicationHeaders(accessToken) },
    );
    set({ response: data });
  },

  submit: async () => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) throw new Error('Application session missing');
    set({ isLoading: true, error: null });
    try {
      const { data } = await apiClient.post(
        `/partner-onboarding/applications/${applicationId}/submit`,
        {},
        {
          headers: {
            ...applicationHeaders(accessToken),
            'Idempotency-Key': idempotencyKey(),
          },
        },
      );
      set({ response: data });
      await get().loadEvents();
    } catch (error) {
      const text = message(error, 'Application could not be submitted');
      set({ error: text });
      throw new Error(text);
    } finally {
      set({ isLoading: false });
    }
  },

  withdraw: async () => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) throw new Error('Application session missing');
    const { data } = await apiClient.post(
      `/partner-onboarding/applications/${applicationId}/withdraw`,
      {},
      { headers: applicationHeaders(accessToken) },
    );
    set({ response: data });
  },

  loadEvents: async () => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) return;
    const { data } = await apiClient.get(
      `/partner-onboarding/applications/${applicationId}/events`,
      { headers: applicationHeaders(accessToken) },
    );
    set({ events: Array.isArray(data) ? data : [] });
  },

  claimActivation: async () => {
    const { applicationId, accessToken } = get();
    if (!applicationId || !accessToken) throw new Error('Application session missing');
    const { data } = await apiClient.post(
      `/partner-onboarding/applications/${applicationId}/activation`,
      {},
      { headers: applicationHeaders(accessToken) },
    );
    set({ activationToken: data.token });
    return data.token as string;
  },

  activate: async (password) => {
    const token = get().activationToken;
    if (!token) throw new Error('Activation token missing');
    await apiClient.post('/partner-onboarding/activate', { token, password });
    set({ activationToken: null });
  },

  clear: async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({
      applicationId: null,
      accessToken: null,
      type: null,
      response: null,
      events: [],
      testVerificationCode: null,
      activationToken: null,
      uploadProgress: null,
      error: null,
    });
  },
}));
