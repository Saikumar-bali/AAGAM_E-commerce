import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { SubscriptionDelivery, SubscriptionDeliveryStatus } from '../../api/subscriptionService';

type Props = {
  deliveries: SubscriptionDelivery[];
  onSelectDelivery?: (delivery: SubscriptionDelivery | null) => void;
};

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#0F766E',
  SCHEDULED: '#3B82F6',
  ORDER_GENERATED: '#3B82F6',
  PREPARING: '#3B82F6',
  PACKED: '#3B82F6',
  ASSIGNED: '#3B82F6',
  OUT_FOR_DELIVERY: '#3B82F6',
  SKIPPED: '#F59E0B',
  FAILED: '#EF4444',
  CANCELLED: '#94A3B8',
  RESCHEDULED: '#8B5CF6',
};

const STATUS_LABELS: Record<string, string> = {
  DELIVERED: 'Delivered',
  SCHEDULED: 'Scheduled',
  ORDER_GENERATED: 'Order placed',
  PREPARING: 'Preparing',
  PACKED: 'Ready',
  ASSIGNED: 'Rider assigned',
  OUT_FOR_DELIVERY: 'On the way',
  SKIPPED: 'Skipped',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
};

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const days: Array<{ date: Date; day: number; isCurrentMonth: boolean }> = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, day: d.getDate(), isCurrentMonth: false });
  }
  for (let i = 1; i <= totalDays; i++) {
    days.push({ date: new Date(year, month, i), day: i, isCurrentMonth: true });
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d, day: d.getDate(), isCurrentMonth: false });
  }
  return days;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isToday(date: Date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function DeliveryCalendarStrip({ deliveries, onSelectDelivery }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const deliveryMap = useMemo(() => {
    const map = new Map<string, SubscriptionDelivery>();
    for (const delivery of deliveries) {
      const key = delivery.serviceDate.slice(0, 10);
      map.set(key, delivery);
    }
    return map;
  }, [deliveries]);

  const days = useMemo(() => getMonthDays(year, month), [year, month]);
  const todayKey = dateKey(today);

  const goToPrevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); } else { setMonth(month - 1); }
    setSelectedDate(null);
    onSelectDelivery?.(null);
  };
  const goToNextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); } else { setMonth(month + 1); }
    setSelectedDate(null);
    onSelectDelivery?.(null);
  };

  const handleDayPress = (day: { date: Date; isCurrentMonth: boolean }) => {
    if (!day.isCurrentMonth) return;
    const key = dateKey(day.date);
    const next = selectedDate === key ? null : key;
    setSelectedDate(next);
    onSelectDelivery?.(next ? deliveryMap.get(next) ?? null : null);
  };

  const selectedDelivery = selectedDate ? deliveryMap.get(selectedDate) : null;

  return (
    <View style={styles.container}>
      <View style={styles.monthNav}>
        <Pressable onPress={goToPrevMonth} style={styles.navButton} accessibilityLabel="Previous month">
          <ChevronLeft size={20} color="#0F766E" />
        </Pressable>
        <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
        <Pressable onPress={goToNextMonth} style={styles.navButton} accessibilityLabel="Next month">
          <ChevronRight size={20} color="#0F766E" />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <View key={i} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day, index) => {
          const key = dateKey(day.date);
          const delivery = deliveryMap.get(key);
          const isSelected = selectedDate === key;
          const isTodayCell = key === todayKey;
          const statusColor = delivery ? STATUS_COLORS[delivery.status] ?? '#94A3B8' : null;

          return (
            <Pressable
              key={index}
              style={[
                styles.dayCell,
                !day.isCurrentMonth && styles.dayCellOutside,
                isSelected && styles.dayCellSelected,
                isTodayCell && !isSelected && styles.dayCellToday,
              ]}
              onPress={() => handleDayPress(day)}
              disabled={!day.isCurrentMonth}
            >
              <Text style={[
                styles.dayNumber,
                !day.isCurrentMonth && styles.dayNumberOutside,
                isSelected && styles.dayNumberSelected,
                isTodayCell && !isSelected && styles.dayNumberToday,
              ]}>
                {day.day}
              </Text>
              {statusColor ? (
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              ) : day.isCurrentMonth ? (
                <View style={styles.emptyDot} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {selectedDate && (
        <View style={styles.legendRow}>
          {Object.entries(STATUS_COLORS).filter(([key]) => ['DELIVERED', 'SCHEDULED', 'SKIPPED', 'FAILED'].includes(key)).map(([status, color]) => (
            <View key={status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{STATUS_LABELS[status]}</Text>
            </View>
          ))}
        </View>
      )}

      {selectedDelivery ? (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={[styles.detailStatusDot, { backgroundColor: STATUS_COLORS[selectedDelivery.status] ?? '#94A3B8' }]} />
            <Text style={styles.detailStatus}>{STATUS_LABELS[selectedDelivery.status] ?? selectedDelivery.status}</Text>
          </View>
          <Text style={styles.detailDate}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          {selectedDelivery.cashDuePaise > 0 ? (
            <Text style={styles.detailCash}>Cash due: ₹{(selectedDelivery.cashDuePaise / 100).toLocaleString('en-IN')}</Text>
          ) : (
            <Text style={styles.detailFunded}>Prepaid delivery</Text>
          )}
          {selectedDelivery.failureReason ? (
            <Text style={styles.detailError}>Reason: {selectedDelivery.failureReason}</Text>
          ) : null}
          {selectedDelivery.skipReason ? (
            <Text style={styles.detailSkipped}>Skip reason: {selectedDelivery.skipReason}</Text>
          ) : null}
        </View>
      ) : selectedDate ? (
        <View style={styles.emptyDetail}>
          <Text style={styles.emptyDetailText}>No delivery scheduled for this day.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', padding: 12 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  weekdayText: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayCellOutside: { opacity: 0.3 },
  dayCellSelected: { backgroundColor: '#F0FDFA', borderRadius: 12 },
  dayCellToday: { backgroundColor: '#F8FAFC', borderRadius: 12 },
  dayNumber: { fontSize: 13, fontWeight: '500', color: '#0F172A' },
  dayNumberOutside: { color: '#CBD5E1' },
  dayNumberSelected: { color: '#0F766E', fontWeight: '600' },
  dayNumberToday: { color: '#0F766E', fontWeight: '600' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  emptyDot: { width: 6, height: 6 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '500', color: '#64748B' },
  detailCard: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#CCFBF1' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailStatusDot: { width: 10, height: 10, borderRadius: 5 },
  detailStatus: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  detailDate: { fontSize: 12, color: '#475569', marginTop: 4 },
  detailCash: { fontSize: 12, fontWeight: '600', color: '#B45309', marginTop: 4 },
  detailFunded: { fontSize: 12, fontWeight: '500', color: '#0F766E', marginTop: 4 },
  detailError: { fontSize: 11, color: '#EF4444', marginTop: 4 },
  detailSkipped: { fontSize: 11, color: '#F59E0B', marginTop: 4 },
  emptyDetail: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: '#F8FAFC', alignItems: 'center' },
  emptyDetailText: { fontSize: 12, color: '#94A3B8' },
});
