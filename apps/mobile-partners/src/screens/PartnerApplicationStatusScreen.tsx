import React, { useEffect } from 'react';
import { Alert, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, Clock3, FileText, RotateCcw, ShieldAlert } from 'lucide-react-native';
import {
  OnboardingShell,
  palette,
  PrimaryButton,
  ProgressBar,
  Section,
  StatusPill,
} from '../components/PartnerOnboardingUI';
import { editableApplication, statusLabel } from '../onboarding/types';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

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
    void loadEvents();
  }, [application?.id, application?.status, application?.updatedAt]);

  const edit = () => {
    navigation.navigate(
      application?.type === 'RIDER' ? 'RiderApplication' : 'StoreApplication',
    );
  };

  const submitApplication = async () => {
    try {
      await submit();
      Alert.alert('Application submitted', 'Admin can now start document and profile review.');
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

  if (!application || !requirements) {
    return (
      <OnboardingShell title="Application unavailable" subtitle="Restore an application session to continue.">
        <PrimaryButton label="Return to partner welcome" onPress={() => navigation.navigate('PartnerWelcome')} />
      </OnboardingShell>
    );
  }

  const editable = editableApplication(application.status);
  const canWithdraw = !['APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(application.status);

  return (
    <OnboardingShell
      title={statusLabel(application.status)}
      subtitle={`Application ${application.applicationNumber}`}
      onBack={() => navigation.navigate('PartnerWelcome')}
      right={
        <TouchableOpacity onPress={() => Promise.all([refresh(), loadEvents()])} style={styles.refresh}>
          <RotateCcw size={18} color={palette.ink} />
        </TouchableOpacity>
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
      </View>

      {application.status === 'ACTION_REQUIRED' ? (
        <Section title="Admin requested corrections" subtitle="Update only the requested details or documents, then resubmit.">
          <View style={styles.warningRow}>
            <ShieldAlert size={22} color={palette.amber} />
            <Text style={styles.warningText}>
              {JSON.stringify(application.actionRequests || {}, null, 2)}
            </Text>
          </View>
        </Section>
      ) : null}

      {application.status === 'APPROVED' ? (
        <Section title="Approved — activate your account" subtitle="Admin has provisioned the operational account. You must create your own permanent password before signing in.">
          <View style={styles.successRow}>
            <CheckCircle2 size={25} color={palette.green} />
            <Text style={styles.successText}>Document review and partner approval are complete.</Text>
          </View>
          <PrimaryButton label="Create password and activate" onPress={activate} loading={isLoading} />
        </Section>
      ) : null}

      {application.status === 'REJECTED' ? (
        <Section title="Application not approved" subtitle="The review timeline below contains the applicant-facing reason.">
          <Text style={styles.rejected}>Contact Partner Support before starting another application with the same verified identity.</Text>
        </Section>
      ) : null}

      {editable ? (
        <Section title="Complete and submit">
          <PrimaryButton label="Edit application details" onPress={edit} secondary />
          <PrimaryButton label="Review documents" onPress={() => navigation.navigate('ApplicationDocuments')} secondary />
          <PrimaryButton
            label={application.submissionVersion > 0 ? 'Resubmit corrected application' : 'Submit for Admin review'}
            onPress={submitApplication}
            loading={isLoading}
            disabled={requirements.completionPercent < 100}
          />
          {requirements.completionPercent < 100 ? (
            <Text style={styles.blocked}>All mandatory documents must be present before submission.</Text>
          ) : null}
        </Section>
      ) : null}

      {['SUBMITTED', 'UNDER_REVIEW'].includes(application.status) ? (
        <Section title="Review in progress" subtitle="The submitted snapshot is locked while Admin reviews it.">
          <View style={styles.waitingRow}>
            <Clock3 size={22} color="#0369A1" />
            <Text style={styles.waitingText}>
              {application.status === 'SUBMITTED'
                ? 'Application received and waiting for a reviewer.'
                : 'A reviewer is checking profile details and individual documents.'}
            </Text>
          </View>
        </Section>
      ) : null}

      <Section title="Application timeline">
        {events.length === 0 ? (
          <Text style={styles.empty}>No visible events yet.</Text>
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

      <Section title="Application access" subtitle="Keep your application number and access token private.">
        <View style={styles.referenceRow}>
          <FileText size={19} color={palette.teal} />
          <Text style={styles.reference}>{application.applicationNumber}</Text>
        </View>
        <PrimaryButton label="Forget this application on device" onPress={async () => { await clear(); navigation.replace('PartnerWelcome'); }} secondary />
        {canWithdraw ? <PrimaryButton label="Withdraw application" onPress={confirmWithdraw} danger /> : null}
      </Section>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 26, backgroundColor: palette.ink, padding: 20, gap: 12 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  version: { color: '#94A3B8', fontSize: 10, fontWeight: '800' },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  heroText: { color: '#CBD5E1', fontSize: 13, fontWeight: '600' },
  warningRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: '#FFFBEB', borderRadius: 16, padding: 14 },
  warningText: { flex: 1, color: '#92400E', fontSize: 12, lineHeight: 18, fontWeight: '700' },
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
