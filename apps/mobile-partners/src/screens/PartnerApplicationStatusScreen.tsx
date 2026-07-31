import React, { useEffect, useMemo } from 'react';
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
import {
  ApplicationProgressStep,
  buildApplicationProgress,
} from '../onboarding/applicationReviewProgress';
import { editableApplication, statusLabel } from '../onboarding/types';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const DOCUMENT_WORDS = ['document', 'identity', 'photo', 'license', 'insurance', 'registration', 'bankproof', 'bank_proof'];

export function PartnerApplicationStatusScreen({ navigation }: any) {
  const { response, events, refresh, loadEvents, submit, withdraw, claimActivation, isLoading, clear } = usePartnerOnboardingStore();
  const application = response?.application;
  const requirements = response?.requirements;

  useEffect(() => {
    let active = true;
    const sync = async () => Promise.all([refresh(), loadEvents()]).catch(() => undefined);
    void sync();
    const interval = setInterval(() => { if (active) void sync(); }, 20_000);
    return () => { active = false; clearInterval(interval); };
  }, [application?.id, loadEvents, refresh]);

  const contactVerified = Boolean(application?.phoneVerifiedAt || application?.emailVerifiedAt);
  const progress = useMemo(
    () => application && requirements ? buildApplicationProgress(application.status, contactVerified, requirements.completionPercent) : [],
    [application, requirements, contactVerified],
  );
  const latestChange = useMemo(
    () => [...events].filter((event) => event.eventType === 'CHANGES_REQUESTED').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0],
    [events],
  );
  const requestedFields = Array.isArray(application?.actionRequests?.fields) ? application!.actionRequests!.fields.map(String) : [];
  const needsDocuments = requestedFields.some((field) => DOCUMENT_WORDS.some((word) => field.toLowerCase().includes(word)));
  const returnHome = () => navigation.reset({ index: 0, routes: [{ name: 'PartnerWelcome' }] });
  const profileRoute = application?.type === 'RIDER' ? 'RiderApplication' : 'StoreApplication';
  const editProfile = () => {
    const submitted = ['SUBMITTED', 'UNDER_REVIEW'].includes(application?.status || '');
    if (!submitted) return navigation.navigate(profileRoute);
    Alert.alert(
      'Reopen application for editing?',
      'Editing will move the application back to Draft, clear the current review assignment and require you to submit it again.',
      [
        { text: 'Keep in review', style: 'cancel' },
        { text: 'Edit application', onPress: () => navigation.navigate(profileRoute) },
      ],
    );
  };
  const fixRequested = () => navigation.navigate(needsDocuments ? 'ApplicationDocuments' : profileRoute);
  const submitApplication = async () => {
    try { await submit(); Alert.alert('Application submitted', 'Aagaam can now review your profile and documents.'); }
    catch (error: any) { Alert.alert('Submission blocked', error.message); }
  };
  const activate = async () => {
    try { await claimActivation(); navigation.navigate('ActivatePartner'); }
    catch (error: any) { Alert.alert('Activation unavailable', error.message); }
  };
  const signIn = async () => {
    await clear();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };
  const confirmWithdraw = () => Alert.alert('Withdraw application?', 'This stops the current review.', [
    { text: 'Keep application', style: 'cancel' },
    { text: 'Withdraw', style: 'destructive', onPress: async () => { try { await withdraw(); } catch (error: any) { Alert.alert('Could not withdraw', error.message); } } },
  ]);
  const refreshAll = () => Promise.all([refresh(), loadEvents()]).catch(() => undefined);

  if (!application || !requirements) {
    return <OnboardingShell title="Application unavailable" subtitle="Restore the application using your phone or email."><PrimaryButton label="Return to Partner Home" onPress={returnHome} /></OnboardingShell>;
  }

  const editable = editableApplication(application.status) && contactVerified;
  const canWithdraw = !['APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(application.status);
  const directPhoneLogin = application.status === 'APPROVED' && Boolean(application.phoneVerifiedAt && application.provisionedUserId);

  return <OnboardingShell
    title={statusLabel(application.status)}
    subtitle={`Application ${application.applicationNumber}`}
    onBack={returnHome}
    right={<TouchableOpacity onPress={() => void refreshAll()} style={styles.refresh}><RotateCcw size={18} color={palette.ink} /></TouchableOpacity>}
    refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refreshAll()} />}
  >
    <View style={styles.hero}><View style={styles.heroTop}><StatusPill status={application.status} /><Text style={styles.version}>Submission v{application.submissionVersion}</Text></View><Text style={styles.heroTitle}>{application.type === 'RIDER' ? 'Rider partner application' : 'Store partner application'}</Text><Text style={styles.heroText}>{application.applicantName}</Text><ProgressBar value={requirements.completionPercent} /><Text style={styles.liveNote}>Status refreshes automatically while this screen is open.</Text></View>

    <Section title="Application progress" subtitle="Every review decision and correction request is recorded."><View>{progress.map((step, index) => <ProgressStep key={step.key} step={step} last={index === progress.length - 1} />)}</View></Section>

    {!contactVerified ? <Section title="Contact verification required"><PrimaryButton label="Return to verification" onPress={() => navigation.navigate('VerifyApplication')} /></Section> : null}

    {application.status === 'ACTION_REQUIRED' ? <Section title="Aagaam needs changes" subtitle="Complete the requested items and resubmit."><View style={styles.warningRow}><ShieldAlert size={22} color={palette.amber} /><View style={{ flex: 1 }}><Text style={styles.warningText}>{latestChange?.message || 'Aagaam requested updates.'}</Text>{requestedFields.map((field) => <Text key={field} style={styles.fieldChip}>{field.replaceAll('_', ' ')}</Text>)}</View></View><PrimaryButton label={needsDocuments ? 'Replace requested documents' : 'Update requested information'} onPress={fixRequested} /></Section> : null}

    {application.status === 'APPROVED' ? <Section
      title="Approved — operational access is ready"
      subtitle={directPhoneLogin ? 'Use the verified application phone number and an OTP to sign in.' : application.linkedExistingUser ? 'Access was added to your existing Aagaam account.' : 'Complete the remaining account activation step.'}
    ><View style={styles.successRow}><CheckCircle2 size={25} color={palette.green} /><Text style={styles.successText}>Document review and Partner approval are complete.</Text></View>{directPhoneLogin ? <PrimaryButton label="Sign in with phone OTP" onPress={signIn} /> : application.linkedExistingUser ? <PrimaryButton label="Sign in to Aagaam" onPress={signIn} /> : <PrimaryButton label="Create password and activate" onPress={activate} loading={isLoading} />}</Section> : null}

    {editable ? <Section title={['SUBMITTED', 'UNDER_REVIEW'].includes(application.status) ? 'Edit before approval' : 'Complete and submit'} subtitle={['SUBMITTED', 'UNDER_REVIEW'].includes(application.status) ? 'Editing reopens the application as Draft and requires resubmission.' : undefined}><PrimaryButton label="Edit profile details" onPress={editProfile} secondary /><PrimaryButton label="Review documents" onPress={() => navigation.navigate('ApplicationDocuments')} secondary />{['DRAFT', 'ACTION_REQUIRED'].includes(application.status) ? <PrimaryButton label={application.submissionVersion > 0 ? 'Resubmit corrected application' : 'Submit for Aagaam review'} onPress={submitApplication} loading={isLoading} disabled={requirements.completionPercent < 100} /> : null}{requirements.completionPercent < 100 ? <Text style={styles.blocked}>Upload every mandatory document before submission.</Text> : null}</Section> : null}

    {['SUBMITTED', 'UNDER_REVIEW'].includes(application.status) ? <Section title="Review in progress" subtitle="You may still edit before approval, but doing so reopens the application."><View style={styles.waitingRow}><Clock3 size={22} color="#0369A1" /><Text style={styles.waitingText}>{application.status === 'SUBMITTED' ? 'Application received and waiting for an Aagaam reviewer.' : 'Aagaam is checking the profile and documents.'}</Text></View><PrimaryButton label="Edit and reopen as Draft" onPress={editProfile} secondary /></Section> : null}

    {application.status === 'REJECTED' ? <Section title="Application not approved"><Text style={styles.rejected}>Review the reason in the timeline and contact Partner Support before starting another application.</Text></Section> : null}

    <Section title="Application timeline">{events.length === 0 ? <Text style={styles.empty}>No visible events yet.</Text> : events.map((event) => <View key={event.id} style={styles.eventRow}><View style={styles.timelineDot} /><View style={{ flex: 1 }}><Text style={styles.eventType}>{event.eventType.replaceAll('_', ' ')}</Text>{event.message ? <Text style={styles.eventMessage}>{event.message}</Text> : null}<Text style={styles.eventDate}>{new Date(event.createdAt).toLocaleString()}</Text></View></View>)}</Section>

    <Section title="Application access" subtitle="Recovery is available using the verified phone or email."><View style={styles.referenceRow}><FileText size={19} color={palette.teal} /><Text style={styles.reference}>{application.applicationNumber}</Text></View><PrimaryButton label="Forget this application on device" onPress={async () => { await clear(); returnHome(); }} secondary />{canWithdraw ? <PrimaryButton label="Withdraw application" onPress={confirmWithdraw} danger /> : null}</Section>
  </OnboardingShell>;
}

function ProgressStep({ step, last }: { step: ApplicationProgressStep; last: boolean }) {
  const color = step.state === 'COMPLETE' ? '#16A34A' : step.state === 'ATTENTION' ? '#F59E0B' : step.state === 'REJECTED' ? '#DC2626' : step.state === 'CURRENT' ? '#0F766E' : '#CBD5E1';
  return <View style={styles.progressRow}><View style={styles.progressRail}><View style={[styles.progressDot, { backgroundColor: color }]} />{!last ? <View style={styles.progressLine} /> : null}</View><Text style={[styles.progressLabel, step.state === 'UPCOMING' && { color: '#94A3B8' }]}>{step.label}</Text></View>;
}

const styles = StyleSheet.create({
  refresh: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }, hero: { borderRadius: 26, backgroundColor: palette.ink, padding: 20, gap: 12 }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, version: { color: '#94A3B8', fontSize: 10, fontWeight: '800' }, heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900' }, heroText: { color: '#CBD5E1', fontSize: 13, fontWeight: '600' }, liveNote: { color: '#94A3B8', fontSize: 10, fontWeight: '700' }, progressRow: { minHeight: 44, flexDirection: 'row', gap: 12 }, progressRail: { width: 18, alignItems: 'center' }, progressDot: { width: 13, height: 13, borderRadius: 7 }, progressLine: { width: 2, flex: 1, backgroundColor: '#E2E8F0' }, progressLabel: { flex: 1, color: '#334155', fontSize: 13, fontWeight: '800', paddingBottom: 16 }, warningRow: { flexDirection: 'row', gap: 12, borderRadius: 16, backgroundColor: '#FFFBEB', padding: 14 }, warningText: { color: '#92400E', fontSize: 12, lineHeight: 18, fontWeight: '700' }, fieldChip: { marginTop: 6, color: '#92400E', fontSize: 11, fontWeight: '900' }, successRow: { flexDirection: 'row', gap: 10, borderRadius: 16, backgroundColor: '#F0FDF4', padding: 14 }, successText: { flex: 1, color: '#166534', fontWeight: '800' }, waitingRow: { flexDirection: 'row', gap: 10, borderRadius: 16, backgroundColor: '#F0F9FF', padding: 14 }, waitingText: { flex: 1, color: '#075985', fontSize: 12, lineHeight: 18, fontWeight: '700' }, blocked: { color: '#B45309', fontSize: 11, textAlign: 'center', fontWeight: '700' }, rejected: { color: '#991B1B', backgroundColor: '#FEF2F2', borderRadius: 14, padding: 13, fontSize: 12, lineHeight: 18 }, empty: { color: '#64748B', fontSize: 12 }, eventRow: { flexDirection: 'row', gap: 11, paddingBottom: 16 }, timelineDot: { marginTop: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#0F766E' }, eventType: { color: '#0F172A', fontSize: 11, fontWeight: '900' }, eventMessage: { color: '#475569', fontSize: 12, lineHeight: 18, marginTop: 3 }, eventDate: { color: '#94A3B8', fontSize: 9, marginTop: 4 }, referenceRow: { flexDirection: 'row', gap: 9, alignItems: 'center', borderRadius: 14, backgroundColor: '#F8FAFC', padding: 13 }, reference: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
});
