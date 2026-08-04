import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Clock3, Copy, PauseCircle, Plus, Save, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { riderService } from '../../api/riderService';

type WindowEntry = {
  localId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isAvailable: boolean;
};

type PickerTarget = { localId: string; field: 'startMinute' | 'endMinute' } | null;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutesLabel(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function dateForMinutes(value: number) {
  return new Date(2000, 0, 1, Math.floor(value / 60), value % 60);
}

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || error?.message || 'Schedule update failed.';
}

function findOverlap(entries: WindowEntry[]) {
  for (const day of DAYS.keys()) {
    const windows = entries.filter((entry) => entry.dayOfWeek === day && entry.isAvailable).sort((left, right) => left.startMinute - right.startMinute);
    for (let index = 0; index < windows.length; index += 1) {
      if (windows[index].startMinute >= windows[index].endMinute) return `${DAYS[day]} has an invalid time window.`;
      if (index > 0 && windows[index].startMinute < windows[index - 1].endMinute) return `${DAYS[day]} has overlapping work windows.`;
    }
  }
  return null;
}

export const RiderScheduleScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['rider', 'availability'], queryFn: riderService.getAvailability, retry: 1 });
  const [entries, setEntries] = useState<WindowEntry[]>([]);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [breakReason, setBreakReason] = useState('');

  useEffect(() => {
    if (!query.data) return;
    const schedule = Array.isArray(query.data.schedule) ? query.data.schedule : [];
    setEntries(schedule.map((entry: any, index: number) => ({
      localId: `${entry.id || entry.dayOfWeek}-${index}`,
      dayOfWeek: Number(entry.dayOfWeek),
      startMinute: Number(entry.startMinute),
      endMinute: Number(entry.endMinute),
      isAvailable: Boolean(entry.isAvailable),
    })));
  }, [query.data]);

  const grouped = useMemo(() => DAYS.map((_, day) => entries.filter((entry) => entry.dayOfWeek === day).sort((left, right) => left.startMinute - right.startMinute)), [entries]);
  const overlap = useMemo(() => findOverlap(entries), [entries]);

  const saveMutation = useMutation({
    mutationFn: () => riderService.updateAvailabilitySchedule(entries.map(({ localId: _localId, ...entry }) => entry)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rider', 'availability'] });
      Toast.show({ type: 'success', text1: 'Schedule saved', text2: 'All work windows passed overlap validation.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Schedule update failed', text2: errorMessage(error) }),
  });

  const breakMutation = useMutation({
    mutationFn: () => query.data?.currentBreak ? riderService.endBreak() : riderService.startBreak(breakReason.trim() || undefined),
    onSuccess: async () => {
      setBreakReason('');
      await queryClient.invalidateQueries({ queryKey: ['rider', 'availability'] });
      Toast.show({ type: 'success', text1: query.data?.currentBreak ? 'Break ended' : 'Break started' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Break update failed', text2: errorMessage(error) }),
  });

  const addWindow = (dayOfWeek: number) => {
    const dayEntries = grouped[dayOfWeek];
    const startMinute = dayEntries.length ? Math.min(1380, dayEntries[dayEntries.length - 1].endMinute + 30) : 540;
    setEntries((current) => [...current, { localId: `${dayOfWeek}-${Date.now()}-${Math.random()}`, dayOfWeek, startMinute, endMinute: Math.min(1440, startMinute + 240), isAvailable: true }]);
  };

  const copyDay = (sourceDay: number, weekdaysOnly: boolean) => {
    const source = grouped[sourceDay];
    const targets = DAYS.map((_, day) => day).filter((day) => day !== sourceDay && (!weekdaysOnly || (day >= 1 && day <= 5)));
    setEntries((current) => {
      const retained = current.filter((entry) => !targets.includes(entry.dayOfWeek));
      const copies = targets.flatMap((day) => source.map((entry) => ({ ...entry, localId: `${day}-${Date.now()}-${Math.random()}`, dayOfWeek: day })));
      return [...retained, ...copies];
    });
  };

  const updateTime = (value?: Date) => {
    if (!picker || !value) return;
    const minute = value.getHours() * 60 + value.getMinutes();
    setEntries((current) => current.map((entry) => entry.localId === picker.localId ? { ...entry, [picker.field]: minute } : entry));
    if (Platform.OS !== 'ios') setPicker(null);
  };

  const selectedEntry = picker ? entries.find((entry) => entry.localId === picker.localId) : null;
  const pickerValue = picker && selectedEntry ? dateForMinutes(selectedEntry[picker.field]) : new Date();
  const shifts = [query.data?.currentShift, ...(query.data?.upcomingShifts || [])].filter(Boolean);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider profile" style={styles.back} onPress={() => navigation.goBack()}><ArrowLeft size={23} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>EDITABLE AVAILABILITY</Text><Text style={styles.title}>Schedules and shifts</Text></View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {query.isLoading ? <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /></View> : (
          <>
            <View style={styles.timezoneCard}><Clock3 size={21} color="#0F766E" /><View style={styles.flex}><Text style={styles.timezoneLabel}>Schedule timezone</Text><Text style={styles.timezoneValue}>{query.data?.timezone || 'Asia/Kolkata'}</Text><Text style={styles.timezoneMeta}>All native time pickers and server windows use this timezone.</Text></View></View>

            {DAYS.map((dayName, day) => (
              <View key={dayName} style={styles.dayCard}>
                <View style={styles.dayHeader}><View style={styles.flex}><Text style={styles.dayName}>{dayName}</Text><Text style={styles.dayMeta}>{grouped[day].length} work window{grouped[day].length === 1 ? '' : 's'}</Text></View><TouchableOpacity accessibilityRole="button" style={styles.addButton} onPress={() => addWindow(day)}><Plus size={18} color="#0F766E" /><Text style={styles.addText}>Add</Text></TouchableOpacity></View>
                {grouped[day].length === 0 ? <Text style={styles.offText}>Unavailable</Text> : grouped[day].map((entry) => (
                  <View key={entry.localId} style={styles.windowRow}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${dayName} start time`} style={styles.timeButton} onPress={() => setPicker({ localId: entry.localId, field: 'startMinute' })}><Text style={styles.timeLabel}>Start</Text><Text style={styles.timeValue}>{minutesLabel(entry.startMinute)}</Text></TouchableOpacity>
                    <Text style={styles.to}>to</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Edit ${dayName} end time`} style={styles.timeButton} onPress={() => setPicker({ localId: entry.localId, field: 'endMinute' })}><Text style={styles.timeLabel}>End</Text><Text style={styles.timeValue}>{minutesLabel(entry.endMinute)}</Text></TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Delete ${dayName} work window`} style={styles.deleteButton} onPress={() => setEntries((current) => current.filter((item) => item.localId !== entry.localId))}><Trash2 size={18} color="#B91C1C" /></TouchableOpacity>
                  </View>
                ))}
                {grouped[day].length ? <View style={styles.copyRow}><TouchableOpacity accessibilityRole="button" style={styles.copyButton} onPress={() => copyDay(day, true)}><Copy size={16} color="#0F766E" /><Text style={styles.copyText}>Copy to weekdays</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.copyButton} onPress={() => copyDay(day, false)}><Copy size={16} color="#0F766E" /><Text style={styles.copyText}>Copy to all</Text></TouchableOpacity></View> : null}
              </View>
            ))}

            {picker ? <DateTimePicker value={pickerValue} mode="time" is24Hour={false} minuteInterval={5} onChange={(_, value) => updateTime(value)} /> : null}
            {Platform.OS === 'ios' && picker ? <TouchableOpacity style={styles.doneButton} onPress={() => setPicker(null)}><Text style={styles.doneText}>Done</Text></TouchableOpacity> : null}
            {overlap ? <View style={styles.errorCard}><Text style={styles.errorText}>{overlap}</Text></View> : null}
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: Boolean(overlap) || saveMutation.isPending }} disabled={Boolean(overlap) || saveMutation.isPending} style={[styles.primary, (overlap || saveMutation.isPending) && styles.disabled]} onPress={() => saveMutation.mutate()}>{saveMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Save size={19} color="#FFFFFF" />}<Text style={styles.primaryText}>Save all availability windows</Text></TouchableOpacity>

            <View style={styles.card}>
              <View style={styles.sectionHeader}><CalendarClock size={21} color="#0F766E" /><Text style={styles.sectionTitle}>Shift calendar</Text></View>
              {shifts.length === 0 ? <Text style={styles.emptyText}>No active or upcoming assigned shifts.</Text> : shifts.map((shift: any) => <View key={shift.id} style={styles.shiftRow}><View style={styles.shiftDot} /><View style={styles.flex}><Text style={styles.shiftTitle}>{String(shift.status).replaceAll('_', ' ')}</Text><Text style={styles.shiftMeta}>{new Date(shift.startsAt).toLocaleString('en-IN')} → {new Date(shift.endsAt).toLocaleString('en-IN')}</Text>{shift.note ? <Text style={styles.shiftNote}>{shift.note}</Text> : null}</View></View>)}
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHeader}><PauseCircle size={21} color="#0F766E" /><Text style={styles.sectionTitle}>Break control</Text></View>
              {query.data?.currentBreak ? <Text style={styles.breakText}>Break started {new Date(query.data.currentBreak.startedAt).toLocaleString('en-IN')} · {query.data.currentBreak.reason || 'No reason'}</Text> : <TextInput value={breakReason} onChangeText={setBreakReason} placeholder="Optional break reason" placeholderTextColor="#94A3B8" style={styles.input} />}
              <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => breakMutation.mutate()}>{breakMutation.isPending ? <ActivityIndicator color="#0F766E" /> : <PauseCircle size={18} color="#0F766E" />}<Text style={styles.secondaryText}>{query.data?.currentBreak ? 'End break and return online' : 'Start break'}</Text></TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 }, header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' }, content: { padding: 14 },
  timezoneCard: { borderRadius: 17, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#99F6E4', padding: 14, flexDirection: 'row', gap: 10 }, timezoneLabel: { color: '#64748B', fontSize: 10, fontWeight: '800' }, timezoneValue: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 2 }, timezoneMeta: { color: '#475569', fontSize: 10, lineHeight: 15, marginTop: 3 },
  dayCard: { marginTop: 10, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 13 }, dayHeader: { flexDirection: 'row', alignItems: 'center' }, dayName: { color: '#0F172A', fontSize: 15, fontWeight: '900' }, dayMeta: { color: '#64748B', fontSize: 10, marginTop: 2 }, addButton: { minHeight: 38, borderRadius: 11, backgroundColor: '#CCFBF1', paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5 }, addText: { color: '#0F766E', fontWeight: '900', fontSize: 11 }, offText: { color: '#94A3B8', fontSize: 12, marginTop: 12 },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11 }, timeButton: { flex: 1, minHeight: 51, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 11, justifyContent: 'center' }, timeLabel: { color: '#64748B', fontSize: 9, fontWeight: '800' }, timeValue: { color: '#0F172A', fontSize: 13, fontWeight: '900', marginTop: 2 }, to: { color: '#64748B', fontSize: 11 }, deleteButton: { width: 43, height: 51, borderRadius: 12, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  copyRow: { flexDirection: 'row', gap: 8, marginTop: 11 }, copyButton: { flex: 1, minHeight: 40, borderRadius: 11, backgroundColor: '#F0FDFA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, copyText: { color: '#0F766E', fontSize: 10, fontWeight: '900' }, doneButton: { alignSelf: 'flex-end', padding: 10 }, doneText: { color: '#0F766E', fontWeight: '900' },
  errorCard: { borderRadius: 13, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', padding: 12, marginTop: 10 }, errorText: { color: '#B91C1C', fontSize: 11, fontWeight: '800' }, primary: { minHeight: 52, borderRadius: 14, backgroundColor: '#067B5C', marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#FFFFFF', fontWeight: '900' }, disabled: { opacity: 0.45 },
  card: { marginTop: 12, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' }, emptyText: { color: '#64748B', fontSize: 11, marginTop: 12 }, shiftRow: { flexDirection: 'row', gap: 10, paddingVertical: 10 }, shiftDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#0F766E', marginTop: 4 }, shiftTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' }, shiftMeta: { color: '#64748B', fontSize: 10, marginTop: 3 }, shiftNote: { color: '#334155', fontSize: 10, marginTop: 3 },
  input: { minHeight: 49, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, color: '#0F172A', marginTop: 11 }, breakText: { color: '#475569', fontSize: 11, lineHeight: 17, marginTop: 10 }, secondary: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: '#99D8C8', marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, secondaryText: { color: '#0F766E', fontWeight: '900' }, state: { minHeight: 420, alignItems: 'center', justifyContent: 'center' },
});
