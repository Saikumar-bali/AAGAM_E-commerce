import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { Camera, Check, ImageIcon, ShieldCheck, X } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@aagam/mobile-shared';
import Toast from 'react-native-toast-message';
import { apiClient } from '../api/client';
import { riderService, RIDER_WORKSPACE_QUERY_KEY } from '../api/riderService';
import { PartnerDocumentPicker, PartnerPickedDocument } from '../native/PartnerDocumentPicker';

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'Photo proof could not be submitted.';
}

function captureLocation() {
  return new Promise<{ latitude: number; longitude: number; accuracyMetres?: number } | null>((resolve) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMetres: position.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
    );
  });
}

async function requestCameraPermission() {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: 'Delivery photo',
      message: 'Allow camera access to capture delivery proof when the customer OTP is unavailable.',
      buttonPositive: 'Allow camera',
      buttonNegative: 'Not now',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function removeCapturedMedia(photo?: PartnerPickedDocument | null) {
  if (!photo || photo.source !== 'CAMERA') return;
  try {
    await PartnerDocumentPicker.deleteCapturedImage(photo.uri);
  } catch {
    // Evidence is already protected server-side. A later cleanup attempt should not block delivery UX.
  }
}

export function RiderPhotoProofFallback() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user) as any;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isRider = Boolean(user && (user.role === 'RIDER' || roles.includes('RIDER')));
  const workspace = useQuery({
    queryKey: RIDER_WORKSPACE_QUERY_KEY,
    queryFn: riderService.getWorkspace,
    enabled: isRider,
    refetchInterval: isRider ? 8_000 : false,
    retry: 1,
  });
  const job = workspace.data?.activeJob || null;
  const available = Boolean(job?.id && job?.status === 'RIDER_AT_CUSTOMER');
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<PartnerPickedDocument | null>(null);
  const photoRef = useRef<PartnerPickedDocument | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const orderLabel = useMemo(() => job?.order?.id ? `#${String(job.order.id).slice(-8).toUpperCase()}` : '', [job?.order?.id]);
  const proofContext = `${user?.id || 'signed-out'}:${job?.id || 'no-job'}:${job?.status || 'none'}`;

  const selectPhoto = (next: PartnerPickedDocument | null) => {
    photoRef.current = next;
    setPhoto(next);
  };

  const discardProof = async (close = true) => {
    const current = photoRef.current;
    selectPhoto(null);
    setConfirmed(false);
    if (close) setOpen(false);
    await removeCapturedMedia(current);
  };

  useEffect(() => {
    const current = photoRef.current;
    photoRef.current = null;
    setPhoto(null);
    setConfirmed(false);
    setOpen(false);
    if (current) void removeCapturedMedia(current);
  }, [proofContext]);

  if (!isRider || !available) return null;

  const takePhoto = async () => {
    try {
      const cameraAllowed = await requestCameraPermission();
      if (!cameraAllowed) {
        Alert.alert('Camera permission required', 'Allow camera access in Android settings to use delivery photo proof.');
        return;
      }
      const selected = await PartnerDocumentPicker.captureImage();
      if (!selected.type.startsWith('image/')) {
        await removeCapturedMedia(selected);
        throw new Error('Take a JPG, PNG, or WebP photo');
      }
      if (selected.size > 10 * 1024 * 1024) {
        await removeCapturedMedia(selected);
        throw new Error('Photo must be smaller than 10 MB');
      }
      const previous = photoRef.current;
      selectPhoto(selected);
      if (previous && previous.uri !== selected.uri) void removeCapturedMedia(previous);
    } catch (error: any) {
      if (error?.code === 'DOCUMENT_PICKER_CANCELLED') return;
      Alert.alert('Camera unavailable', error?.message || 'Could not capture the delivery photo.');
    }
  };

  const submit = async () => {
    if (!job?.id || !photo || !confirmed || submitting) return;
    setSubmitting(true);
    try {
      const location = await captureLocation();
      if (!location) throw new Error('Location permission is required for photo proof. Turn on location and try again.');
      const body = new FormData();
      body.append('file', { uri: photo.uri, name: photo.name || 'delivery-proof.jpg', type: photo.type } as any);
      body.append('riderConfirmed', 'true');
      body.append('latitude', String(location.latitude));
      body.append('longitude', String(location.longitude));
      if (location.accuracyMetres != null) body.append('accuracyMetres', String(location.accuracyMetres));
      body.append('note', 'Customer OTP unavailable. Rider submitted camera delivery proof.');
      await apiClient.post(
        `/orders/delivery-photo-proof/jobs/${encodeURIComponent(job.id)}/complete`,
        body,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Idempotency-Key': `mobile-photo-proof:${job.id}:${Date.now()}`,
          },
        },
      );
      if (user?.id) await riderService.cacheLastCompletedJob(user.id, job.id);
      await queryClient.invalidateQueries({ queryKey: RIDER_WORKSPACE_QUERY_KEY });
      Toast.show({ type: 'success', text1: 'Delivery completed', text2: 'Photo and GPS proof were stored securely.' });
      await discardProof(true);
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Photo proof failed', text2: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Use photo proof when customer OTP is unavailable"
        style={styles.floating}
        onPress={() => setOpen(true)}
      >
        <Camera size={18} color="#FFFFFF" />
        <Text style={styles.floatingText}>OTP unavailable? Photo proof</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => { if (!submitting) void discardProof(true); }}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close photo proof" style={styles.close} disabled={submitting} onPress={() => void discardProof(true)}><X size={20} color="#475569" /></TouchableOpacity>
            <View style={styles.icon}><ShieldCheck size={26} color="#0F766E" /></View>
            <Text style={styles.eyebrow}>DELIVERY FALLBACK · {orderLabel}</Text>
            <Text style={styles.title}>Use a delivery photo</Text>
            <Text style={styles.subtitle}>Only use this when the customer cannot provide the OTP. A fresh camera photo and GPS location are stored with the delivery audit.</Text>

            {photo ? (
              <View style={styles.previewWrap}>
                <Image source={{ uri: photo.uri }} style={styles.preview} />
                <TouchableOpacity style={styles.retake} onPress={() => void takePhoto()} disabled={submitting}><Camera size={16} color="#0F766E" /><Text style={styles.retakeText}>Retake</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.cameraButton} onPress={() => void takePhoto()} disabled={submitting}>
                <ImageIcon size={24} color="#0F766E" />
                <Text style={styles.cameraTitle}>Take delivery photo</Text>
                <Text style={styles.cameraHint}>Use the rear camera and keep the handed-over parcel visible.</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} style={styles.confirmRow} onPress={() => setConfirmed((value) => !value)} disabled={submitting}>
              <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>{confirmed ? <Check size={16} color="#FFFFFF" /> : null}</View>
              <Text style={styles.confirmText}>I confirm the parcel was handed over and this photo is genuine delivery proof.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.submit, (!photo || !confirmed || submitting) && styles.disabled]} disabled={!photo || !confirmed || submitting} onPress={() => void submit()}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <ShieldCheck size={18} color="#FFFFFF" />}
              <Text style={styles.submitText}>Submit photo proof & complete delivery</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  floating: { position: 'absolute', right: 14, bottom: 86, zIndex: 40, minHeight: 46, borderRadius: 23, backgroundColor: '#0F766E', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, elevation: 8 },
  floatingText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.68)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 28 },
  close: { position: 'absolute', right: 16, top: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  icon: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { marginTop: 13, color: '#0F766E', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { marginTop: 4, color: '#0F172A', fontSize: 22, fontWeight: '900' },
  subtitle: { marginTop: 7, color: '#64748B', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  cameraButton: { marginTop: 16, minHeight: 136, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: '#5EEAD4', backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center', padding: 18 },
  cameraTitle: { marginTop: 8, color: '#0F766E', fontSize: 14, fontWeight: '900' },
  cameraHint: { marginTop: 4, color: '#64748B', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  previewWrap: { marginTop: 16, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#CCFBF1' },
  preview: { width: '100%', height: 210, backgroundColor: '#E2E8F0' },
  retake: { minHeight: 44, backgroundColor: '#F0FDFA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  retakeText: { color: '#0F766E', fontSize: 12, fontWeight: '900' },
  confirmRow: { marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 25, height: 25, borderRadius: 8, borderWidth: 1, borderColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  confirmText: { flex: 1, color: '#334155', fontSize: 11, lineHeight: 17, fontWeight: '700' },
  submit: { marginTop: 16, minHeight: 52, borderRadius: 15, backgroundColor: '#0F766E', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
