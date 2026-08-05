import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock3, FileWarning, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { riderService } from '../../api/riderService';

function label(value: unknown) {
  return String(value || 'UNKNOWN').replaceAll('_', ' ');
}

function date(value: unknown) {
  return value ? new Date(String(value)).toLocaleString('en-IN') : 'Not recorded';
}

export const RiderAccountStatusScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const query = useQuery({ queryKey: ['rider', 'profile'], queryFn: riderService.getProfile, retry: 1 });
  const lifecycle: any = query.data?.lifecycle || {};
  const eligible = lifecycle.eligibleForOperations === true;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider profile" style={styles.back} onPress={() => navigation.goBack()}><ArrowLeft size={23} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>RIDER LIFECYCLE</Text><Text style={styles.title}>Approval and eligibility</Text></View>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {query.isLoading ? (
          <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /></View>
        ) : query.isError ? (
          <View style={styles.state}><XCircle size={38} color="#B91C1C" /><Text style={styles.stateTitle}>Account status unavailable</Text><Text style={styles.stateText}>{(query.error as Error)?.message || 'Check your connection and try again.'}</Text><TouchableOpacity style={styles.primary} onPress={() => void query.refetch()}><Text style={styles.primaryText}>Try again</Text></TouchableOpacity></View>
        ) : (
          <>
            <View style={[styles.heroCard, eligible ? styles.heroGood : styles.heroAttention]}>
              {eligible ? <ShieldCheck size={38} color="#15803D" /> : <ShieldAlert size={38} color="#B45309" />}
              <Text style={styles.heroLabel}>OPERATIONS ELIGIBILITY</Text>
              <Text style={styles.heroTitle}>{eligible ? 'Eligible' : 'Action required'}</Text>
              <Text style={styles.heroText}>
                {lifecycle.restricted
                  ? lifecycle.restrictionReason || 'The Rider account is restricted.'
                  : eligible
                    ? 'Account approval and all required documents are valid.'
                    : 'Review approval and document requirements below.'}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Account review</Text>
              <Fact label="Approval status" value={label(lifecycle.approvalStatus)} />
              <Fact label="Reviewed at" value={date(lifecycle.approvalReviewedAt)} />
              <Fact label="Restricted" value={lifecycle.restricted ? 'Yes' : 'No'} />
              <Fact label="Restriction reason" value={lifecycle.restrictionReason || 'No restriction'} />
              <Fact label="Restricted at" value={date(lifecycle.restrictedAt)} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Document eligibility</Text>
              {(lifecycle.documentEligibility || []).map((entry: any) => (
                <View key={entry.type} style={styles.row}>
                  {entry.eligible ? <CheckCircle2 size={20} color="#15803D" /> : entry.status === 'REJECTED' ? <XCircle size={20} color="#B91C1C" /> : entry.status === 'MISSING' ? <FileWarning size={20} color="#B45309" /> : <Clock3 size={20} color="#B45309" />}
                  <View style={styles.flex}><Text style={styles.rowTitle}>{label(entry.type)}</Text><Text style={styles.rowMeta}>{label(entry.status)} · expires {entry.expiresAt ? new Date(entry.expiresAt).toLocaleDateString('en-IN') : 'not recorded'}</Text></View>
                </View>
              ))}
              <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={() => navigation.navigate('RiderDocuments')}><Text style={styles.primaryText}>Open documents and renewals</Text></TouchableOpacity>
            </View>

            {(lifecycle.changesRequested || []).length ? (
              <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>Changes requested</Text>
                {lifecycle.changesRequested.map((document: any) => (
                  <View key={document.id} style={styles.changeRow}><XCircle size={18} color="#B91C1C" /><View style={styles.flex}><Text style={styles.changeTitle}>{label(document.type)}</Text><Text style={styles.changeText}>{document.reviewNote || 'Replace this document and resubmit it.'}</Text></View></View>
                ))}
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Application verification history</Text>
              {(lifecycle.verificationHistory || []).map((event: any) => (
                <View key={event.documentId} style={styles.historyRow}>
                  <View style={styles.historyDot} />
                  <View style={styles.flex}><Text style={styles.rowTitle}>{label(event.type)} · {label(event.status)}</Text><Text style={styles.rowMeta}>Submitted {date(event.submittedAt)}{event.reviewedAt ? ` · reviewed ${date(event.reviewedAt)}` : ''}</Text>{event.note ? <Text style={styles.note}>{event.note}</Text> : null}</View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

function Fact({ label: factLabel, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{factLabel}</Text><Text selectable style={styles.factValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  content: { padding: 14 },
  heroCard: { borderRadius: 20, borderWidth: 1, padding: 19, alignItems: 'center' }, heroGood: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }, heroAttention: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  heroLabel: { color: '#64748B', fontSize: 10, fontWeight: '900', marginTop: 10 }, heroTitle: { color: '#0F172A', fontSize: 24, fontWeight: '900', marginTop: 3 }, heroText: { color: '#475569', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  card: { marginTop: 12, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15 }, cardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginBottom: 7 },
  fact: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, factLabel: { color: '#64748B', fontSize: 10, fontWeight: '800' }, factValue: { color: '#0F172A', fontSize: 13, fontWeight: '700', marginTop: 3 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' }, rowTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' }, rowMeta: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 3 },
  primary: { minHeight: 48, borderRadius: 14, backgroundColor: '#067B5C', marginTop: 13, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontWeight: '900' },
  warningCard: { marginTop: 12, borderRadius: 18, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', padding: 15 }, warningTitle: { color: '#991B1B', fontSize: 16, fontWeight: '900' }, changeRow: { flexDirection: 'row', gap: 9, marginTop: 12 }, changeTitle: { color: '#991B1B', fontSize: 12, fontWeight: '900' }, changeText: { color: '#7F1D1D', fontSize: 11, lineHeight: 17, marginTop: 3 },
  historyRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 }, historyDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#0F766E', marginTop: 4 }, note: { color: '#334155', fontSize: 11, lineHeight: 17, marginTop: 4 },
  state: { minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }, stateTitle: { color: '#0F172A', fontSize: 18, fontWeight: '900', marginTop: 10 }, stateText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
});
