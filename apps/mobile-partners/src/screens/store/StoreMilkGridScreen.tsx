import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Truck, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CELL_WIDTH = 36;
const NAME_WIDTH = 120;

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getStatusColor(status?: string | null) {
  if (!status) return '#F1F5F9';
  const s = status.toUpperCase();
  if (s === 'DELIVERED') return '#D1FAE5';
  if (s === 'SCHEDULED' || s === 'ORDER_GENERATED' || s === 'PREPARING' || s === 'PACKED') return '#DBEAFE';
  if (s === 'SKIPPED') return '#FEF3C7';
  if (s === 'FAILED' || s === 'CANCELLED') return '#FEE2E2';
  return '#F1F5F9';
}

function getStatusDot(status?: string | null) {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === 'DELIVERED') return '#0F766E';
  if (s === 'SCHEDULED' || s === 'ORDER_GENERATED' || s === 'PREPARING' || s === 'PACKED') return '#3B82F6';
  if (s === 'SKIPPED') return '#F59E0B';
  if (s === 'FAILED' || s === 'CANCELLED') return '#EF4444';
  return null;
}

export const StoreMilkGridScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const gridQuery = useQuery({
    queryKey: ['store-milk-grid', year, month],
    queryFn: () => subscriptionOperationsService.getGrid(year, month),
    retry: 1,
  });

  const autoDispatch = useMutation({
    mutationFn: () => subscriptionOperationsService.autoDispatchDefaultRiders(
      new Date(year, month, 1).toISOString().slice(0, 10),
    ),
    onSuccess: (data: any) => {
      Toast.show({ type: 'success', text1: 'Auto-dispatch complete', text2: data?.message || 'Riders assigned to routes.' });
      void queryClient.invalidateQueries({ queryKey: ['store-milk-grid'] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Auto-dispatch failed', text2: 'Try again.' }),
  });

  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const grid = gridQuery.data?.grid || gridQuery.data?.rows || [];
  const todayDate = today.getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const goToPrevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); } else { setMonth(month - 1); }
  };
  const goToNextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); } else { setMonth(month + 1); }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F766E" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DELIVERY GRID</Text>
          <Text style={styles.title}>Milk calendar</Text>
        </View>
        <TouchableOpacity
          style={[styles.dispatchBtn, autoDispatch.isPending && styles.disabled]}
          onPress={() => autoDispatch.mutate()}
          disabled={autoDispatch.isPending}
        >
          <Truck size={16} color="#FFFFFF" />
          <Text style={styles.dispatchText}>Dispatch</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={goToPrevMonth} style={styles.navBtn}>
          <ChevronLeft size={20} color="#0F766E" />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity onPress={goToNextMonth} style={styles.navBtn}>
          <ChevronRight size={20} color="#0F766E" />
        </TouchableOpacity>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#0F766E' }]} /><Text style={styles.legendText}>Delivered</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} /><Text style={styles.legendText}>Scheduled</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} /><Text style={styles.legendText}>Skipped</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} /><Text style={styles.legendText}>Failed</Text></View>
      </View>

      {gridQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.muted}>Loading delivery grid…</Text></View>
      ) : gridQuery.isError ? (
        <View style={styles.center}><Text style={styles.errorTitle}>Couldn't load grid</Text><Text style={styles.muted}>Pull down to retry.</Text></View>
      ) : grid.length === 0 ? (
        <View style={styles.center}>
          <CalendarDays size={40} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No subscribers for this month</Text>
          <Text style={styles.emptyText}>The delivery grid will appear when subscribers are assigned to your store.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gridScroll}
        >
          <View>
            <View style={styles.gridHeader}>
              <View style={[styles.nameCell, styles.headerCell]}>
                <Users size={14} color="#64748B" />
                <Text style={styles.headerText}>Customer</Text>
              </View>
              {days.map((day) => (
                <View key={day} style={[styles.dayCell, styles.headerCell, isCurrentMonth && day === todayDate && styles.todayHeader]}>
                  <Text style={[styles.dayText, isCurrentMonth && day === todayDate && styles.todayText]}>{day}</Text>
                </View>
              ))}
            </View>
            <ScrollView
              style={styles.gridBody}
              contentContainerStyle={{ paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={gridQuery.isRefetching} onRefresh={() => void gridQuery.refetch()} />}
            >
              {grid.map((row: any, rowIndex: number) => (
                <View key={row.subscriptionId || rowIndex} style={[styles.gridRow, rowIndex % 2 === 0 && styles.gridRowEven]}>
                  <View style={styles.nameCell}>
                    <Text style={styles.customerName} numberOfLines={1}>{row.customer?.name || row.customerName || row.name || `Customer ${rowIndex + 1}`}</Text>
                    {row.defaultRider ? (
                      <Text style={styles.riderLabel} numberOfLines={1}>{row.defaultRider.name || 'Rider assigned'}</Text>
                    ) : null}
                  </View>
                  {days.map((day) => {
                    const cell = row.days?.[day] || row.cells?.[day - 1] || null;
                    const status = cell?.status || null;
                    const dotColor = getStatusDot(status);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.dayCell, { backgroundColor: getStatusColor(status) }, isCurrentMonth && day === todayDate && styles.todayCell]}
                      >
                        {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  flex: { flex: 1 },
  header: { backgroundColor: '#0F766E', paddingHorizontal: 18, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', marginTop: 2 },
  dispatchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  dispatchText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  navBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingVertical: 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#64748B' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  muted: { color: '#64748B', fontSize: 13 },
  errorTitle: { color: '#0F172A', fontSize: 18, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { color: '#0F172A', fontSize: 16, fontWeight: '600' },
  emptyText: { color: '#64748B', fontSize: 13, textAlign: 'center' },
  gridScroll: { paddingHorizontal: 8 },
  gridHeader: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderBottomWidth: 2, borderBottomColor: '#E2E8F0' },
  headerCell: { justifyContent: 'center', alignItems: 'center', paddingVertical: 8 },
  headerText: { fontSize: 9, fontWeight: '600', color: '#64748B', marginLeft: 4 },
  nameCell: { width: NAME_WIDTH, justifyContent: 'center', paddingHorizontal: 8 },
  dayCell: { width: CELL_WIDTH, height: 40, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#F1F5F9' },
  todayHeader: { backgroundColor: '#CCFBF1' },
  todayText: { color: '#0F766E', fontWeight: '600' },
  dayText: { fontSize: 11, fontWeight: '500', color: '#64748B' },
  gridBody: { flex: 1 },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  gridRowEven: { backgroundColor: '#FAFBFC' },
  customerName: { color: '#0F172A', fontSize: 11, fontWeight: '600' },
  riderLabel: { color: '#0F766E', fontSize: 9, marginTop: 2 },
  todayCell: { borderLeftWidth: 2, borderLeftColor: '#0F766E', borderRightWidth: 2, borderRightColor: '#0F766E' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
