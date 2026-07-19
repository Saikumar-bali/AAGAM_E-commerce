import React, { useEffect, useMemo } from 'react';
import {
  Alert,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CheckCircle2,
  Clock3,
  FileText,
  LogIn,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react-native';
import {
  OnboardingShell,
  palette,
  PrimaryButton,
  ProgressBar,
  Section,
  StatusPill,
} from '../components/PartnerOnboardingUI';
import {
  ApplicationProgressStep,
  buildApplicationProgress,
} from '../onboarding/applicationReviewProgress';
import { editableApplication, statusLabel } from '../onboarding/types';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const DOCUMENT_REQUEST_WORDS = [
  'document',
  'identity',
  'photo',
  'license',
  'insurance',
  'registration',
  'bankproof',
  'bank_proof',
];

export function PartnerApplicationStatusScreen({ navigation }: any) {
  const {
    response,
    events,
    refresh,
    loadEvents,
    submit,
    withdraw,
    claimActivation,
    isLoading,
    clear,
  } = usePartnerOnboardingStore();
  const application = response?.application;
  const requirements = response?.requirements;

  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        await Promise.all([refresh(), loadEvents()]);
      } catch {
        // Preserve the last applicant-safe snapshot during a transient failure.
      }
    };
    void sync();
    const interval = setInterval(() => {
      if (active) void sync();
    }, 20_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [application?.id, loadEvents, refresh]);

  const contactVerified = Boolean(application?.emailVerifiedAt || application?.phoneVerifiedAt);
  const progressSteps = useMemo(
    () =>
      application && requirements
        ? buildApplicationProgress(
            application.status,
            contactVerified,
            requirements.completionPercent,
          )
        : [],
    [application, contactVerified, requirements],
  );

  const latestChangeRequest = useMemo(
    () =>
      [...events]
        .filter((event) => event.eventType === 'CHANGES_REQUESTED')
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        )[0],
    [events],
  );

  const requestedFields = Array.isArray(application?.actionRequests?.fields)
    ? application!.actionRequests!.fields.map(String)
    : [];
  const needsDocuments = requestedFields.some((field) =>
    DOCUMENT_REQUEST_WORDS.some((word) => field.toLowerCase().includes(word)),
  );

  const returnHome = () => navigation.reset({ index: 0, routes: [{ name: 'PartnerWelcome' }] });
  const editProfile = () =>
    navigation.navigate(application?.type === 'RIDER' ? 'RiderApplication' : 'StoreApplication');
  const fixRequested = () =>
    navigation.navigate(needsDocuments ? 'ApplicationDocuments' : application?.type === 'RIDER' ? 'RiderApplication' : 'StoreApplication');

  const submitApplication = async () => {
    try {
      await submit();
      Alert.alert('Application submitted', 'AAGAM can now begin profile and document review.');
    } catch (error: any) {
      Alert.alert('Submission blocked', error.message);
    }
  };

  const activate = async () => {
    try {
      await claimActivation();
      navigation.navigate('ActivatePartner');
    } catch (error: any) {
      Alert.alert('Activation unavailable', error.message);
    }
  };

  const signInExisting = async () => {
    await clear();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const confirmWithdraw = () => {
    Alert.alert('Withdraw application?', 'This stops the current review and cannot be undone.', [
      { text: 'Keep application', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          try {
            await withdraw();
          } catch (error: any) {
            Alert.alert('Could not withdraw', error.message);
          }
        },
      },
    ]);
  };

  const refreshAll = () => Promise.all([refresh(), loadEvents()]).catch(() => undefined);

  if (!application || !requirements) {
    return (
      <OnboardingShell title="Application unavailable" subtitle="Restore an application session to continue.">
        <PrimaryButton label="Return to Partner Home" onPress={returnHome} />
      </OnboardingShell>
    );
  }

  const editable = editableApplication(application.status) && contactVerified;
  const canWithdraw = !['APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(application.status);

  return (
    <OnboardingShell
      title={statusLabel(application.status)}
      subtitle={`Application ${application.applicationNumber}`}
      onBack={returnHome}
      right={
        <TouchableOpacity onPress={() => void refreshAll()} style={styles.refresh}>
          <RotateCcw size={18} color={palette.ink} />
        </TouchableOpacity>
      }
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={() => void refreshAll()} />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <StatusPill status={application.status} />
          <Text style={styles.version}>Submission v{application.submissionVersion}</Text>
        </View>
        <Text style={styles.heroTitle}>
          {application.type === 'RIDER' ? 'Rider partner application' : 'Store partner application'}
        </Text>
        <Text style={styles.heroText}>{application.applicantName}</Text>
        <ProgressBar value={requirements.completionPercent} />
        <Text style={styles.liveNote}>This status refreshes automatically while the screen is open.</Text>
      </View>

      <Section title="Application progress" subtitle="Every review decision and requested correction is recorded here.">
        <View style={styles.progressList}>
          {progressSteps.map((step, index) => (
            <ProgressStep key={step.key} step={step} last={index === progressSteps.length - 1} />
          ))}
        </View>
      </Section>

      {!contactVerified ? (
        <Section title="Contact verification required" subtitle="Verify the protected contact before editing or submitting.">
          <PrimaryButton label="Return to verification" onPress={() => navigation.navigate('VerifyApplication')} />
        </Section>
      ) : null}

      {application.status === 'ACTION_REQUIRED' ? (
        <Section title="AAGAM needs changes" subtitle="Complete these items, then resubmit the application.">
          <View style={styles.warningRow}>
            <ShieldAlert size={22} color={palette.amber} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningText}>
                {latestChangeRequest?.message || 'AAGAM requested updates to this application.'}
              </Text>
              {requestedFields.length ? (
                <View style={styles.fieldList}>
                  {requestedFields.map((field) => (
                    <Text key={field} style={styles.fieldChip}>{field.replaceAll('_', ' ')}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
          <PrimaryButton
            label={needsDocuments ? 'Replace requested documents' : 'Update requested information'}
            onPress={fixRequested}
          />
        </Section>
      ) : null}

      {application.status === 'APPROVED' ? (
        <Section
          title={application.linkedExistingUser ? 'Approved — access added' : 'Approved — activate your account'}
          subtitle={
            application.linkedExistingUser
              ? 'Rider or Store access was added to your existing AAGAM Customer account.'
              : 'A new operational account was provisioned securely.'
          }
        >
          <View style={styles.successRow}>
            <CheckCircle2 size={25} color={palette.green} />
            <Text style={styles.successText}>Document review and Partner approval are complete.</Text>
          </View>
          {application.linkedExistingUser ? (
            <PrimaryButton label="Sign in with existing AAGAM account" onPress={signInExisting} />
          ) : (
            <PrimaryButton label="Create password and activate" onPress={activate} loading={isLoading} />
          )}
        </Section>
      ) : null}

      {application.status === 'REJECTED' ? (
        <Section title="Application not approved" subtitle="The reason appears in the timeline below.">
          <Text style={styles.rejected}>Contact AAGAM Partner Support before starting another application with the same identity.</Text>
        </Section>
      ) : null}

      {editable ? (
        <Section title="Complete and submit">
          <PrimaryButton label="Edit profile details" onPress={editProfile} secondary />
          <PrimaryButton label="Review documents" onPress={() => navigation.navigate('ApplicationDocuments')} secondary />
          <PrimaryButton
            label={application.submissionVersion > 0 ? 'Resubmit corrected application' : 'Submit for AAGAM review'}
            onPress={submitApplication}
            loading={isLoading}
            disabled={requirements.completionPercent < 100}
          />
          {requirements.completionPercent < 100 ? (
            <Text style={styles.blocked}>Upload every mandatory document before submission.</Text>
          ) : null}
        </Section>
      ) : null}

      {['SUBMITTED', 'UNDER_REVIEW'].includes(application.status) ? (
        <Section title="Review in progress" subtitle="The submitted application is locked during review.">
          <View style={styles.waitingRow}>
            <Clock3 size={22} color="#0369A1" />
            <Text style={styles.waitingText}>
              {application.status === 'SUBMITTED'
                ? 'Application received and waiting for an AAGAM reviewer.'
                : 'AAGAM is checking profile details and each document.'}
            </Text>
          </View>
        </Section>
      ) : null}

      <Section title="Application timeline">
        {events.length === 0 ? (
          <Text style={styles.empty}>No visible events yet. Pull down to check again.</Text>
        ) : (
          events.map((event, index) => (
            <View key={event.id} style={styles.eventRow}>
              <View style={styles.timelineColumn}>
                <View style={styles.timelineDot} />
                {index < events.length - 1 ? <View style={styles.timelineLine} /> : null}
              </View>
              <View style={styles.eventBody}>
                <Text style={styles.eventType}>{event.eventType.replaceAll('_', ' ')}</Text>
                {event.message ? <Text style={styles.eventMessage}>{event.message}</Text> : null}
                <Text style={styles.eventDate}>{new Date(event.createdAt).toLocaleString()}</Text>
              </View>
            </View>
          ))
        )}
      </Section>

      <Section title="Application access" subtitle="Keep your application reference private.">
        <View style={styles.referenceRow}>
          <FileText size={19} color={palette.teal} />
          <Text style={styles.reference}>{application.applicationNumber}</Text>
        </View>
        <PrimaryButton
          label="Forget this application on device"
          onPress={async () => {
            await clear();
            returnHome();
          }}
          secondary
        />
        {canWithdraw ? <PrimaryButton label="Withdraw application" onPress={confirmWithdraw} danger /> : null}
      </Section>
    </OnboardingShell>
  );
}

function ProgressStep({ step, last }: { step: ApplicationProgressStep; last: boolean }) {
  const dotStyle =
    step.state === 'COMPLETE'
      ? styles.progressComplete
      : step.state === 'ATTENTION'
        ? styles.progressAttention
        : step.state === 'REJECTED'
          ? styles.progressRejected
          : step.state === 'CURRENT'
            ? styles.progressCurrent
            : styles.progressUpcoming;
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressRail}>
        <View style={[styles.progressDot, dotStyle]} />
        {!last ? <View style={styles.progressLine} /> : null}
      </View>
      <Text style={[styles.progressLabel, step.state === 'UPCOMING' && styles.progressLabelMuted]}>
        {step.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 26, backgroundColor: palette.ink, padding: 20, gap: 12 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  version: { color: '#94A3B8', fontSize: 10, fontWeight: '800' },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  heroText: { color: '#CBD5E1', fontSize: 13, fontWeight: '600' },
  liveNote: { color: '#94A3B8', fontSize: 10, lineHeight: 15, fontWeight: '700' },
  progressList: { gap: 0 },
  progressRow: { minHeight: 48, flexDirection: 'row', gap: 12 },
  progressRail: { width: 18, alignItems: 'center' },
  progressDot: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, marginTop: 2 },
  progressLine: { width: 2, flex: 1, minHeight: 28, backgroundColor: '#E2E8F0', marginVertical: 3 },
  progressComplete: { borderColor: '#059669', backgroundColor: '#10B981' },
  progressCurrent: { borderColor: '#0F766E', backgroundColor: '#CCFBF1' },
  progressAttention: { borderColor: '#D97706', backgroundColor: '#FDE68A' },
  progressRejected: { borderColor: '#DC2626', backgroundColor: '#FECACA' },
  progressUpcoming: { borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  progressLabel: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  progressLabelMuted: { color: '#94A3B8' },
  warningRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 16, padding: 14 },
  warningText: { color: '#92400E', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  fieldList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  fieldChip: { color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ECFDF5', borderRadius: 16, padding: 14 },
  successText: { flex: 1, color: '#065F46', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  rejected: { color: palette.red, fontSize: 12, lineHeight: 19, fontWeight: '700' },
  blocked: { color: palette.amber, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  waitingRow: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#F0F9FF', borderRadius: 16, padding: 14 },
  waitingText: { flex: 1, color: '#075985', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  empty: { color: palette.muted, fontSize: 12, textAlign: 'center', paddingVertical: 16 },
  eventRow: { flexDirection: 'row', gap: 12 },
  timelineColumn: { width: 18, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.teal, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, minHeight: 42, backgroundColor: '#CCFBF1', marginVertical: 4 },
  eventBody: { flex: 1, paddingBottom: 17 },
  eventType: { color: palette.ink, fontSize: 11, fontWeight: '900' },
  eventMessage: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  eventDate: { color: '#94A3B8', fontSize: 9, marginTop: 5 },
  referenceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F0FDFA', borderRadius: 15, padding: 14 },
  reference: { color: palette.ink, fontSize: 13, fontWeight: '900' },
});
