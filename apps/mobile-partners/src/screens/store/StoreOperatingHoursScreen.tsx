import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Check, Clock, Plus, Store, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { storeService } from '../../api/storeService';
import { GradientSurface } from '../../components/GradientSurface';
import { palette, radius, spacing } from '../../design/tokens';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Dhaka', 'UTC'];
const DEFAULT_OPEN = 6 * 60;
const DEFAULT_CLOSE = 21 * 60;

type Window = { openMinute: number; closeMinute: number };
type DayState = { dayOfWeek: number; open: boolean; windows: Window[] };

function minutesToHHMM(m: number) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function hhmmToMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function buildWeek(raw: any): DayState[] {
  const byDay = new Map<number, Window[]>();
  const list = Array.isArray(raw) ? raw : (raw?.operatingHours || []);
  for (const d of list) {
    byDay.set(Number(d.dayOfWeek), (d.windows || []).map((w: any) => ({ openMinute: w.openMinute, closeMinute: w.closeMinute })));
  }
  return DAYS.map((_, dayOfWeek) => {
    const windows = byDay.get(dayOfWeek) || [];
    return { dayOfWeek, open: windows.length > 0, windows: windows.length ? windows : [{ openMinute: DEFAULT_OPEN, closeMinute: DEFAULT_CLOSE }] };
  });
}

export const StoreOperatingHoursScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const storesQuery = useQuery({ queryKey: ['my-stores'], queryFn: storeService.getMyStores, retry: 1 });
  const stores = Array.isArray(storesQuery.data) ? storesQuery.data : [];
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedStoreId((current) =>
      current && stores.some((store: any) => store.id === current) ? current : stores[0]?.id || null,
    );
  }, [stores]);
  const storeId = selectedStoreId || stores[0]?.id;

  const hoursQuery = useQuery({
    queryKey: ['store-operating-hours', storeId],
    queryFn: () => subscriptionOperationsService.getOperatingHours(storeId as string),
    enabled: !!storeId,
    retry: 1,
  });

  const [week, setWeek] = useState<DayState[] | null>(null);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [tzTouched, setTzTouched] = useState(false);
  // Per-input draft text so a partially typed time (e.g. "06:3") is not
  // rejected and snapped back to the stored value mid-keystroke; committed on
  // blur.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = (dayOfWeek: number, field: 'open' | 'close') => `${dayOfWeek}-${field}`;

  const model = useMemo(() => {
    if (week) return week;
    if (!hoursQuery.data) return null;
    return buildWeek(hoursQuery.data);
  }, [week, hoursQuery.data]);

  const effectiveTz = useMemo(() => {
    if (week || tzTouched) return timezone;
    return hoursQuery.data?.timezone || 'Asia/Kolkata';
  }, [week, tzTouched, timezone, hoursQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      subscriptionOperationsService.updateOperatingHours(storeId as string, {
        timezone: effectiveTz,
        operatingHours: (model || [])
          .filter((d) => d.open)
          .map((d) => ({ dayOfWeek: d.dayOfWeek, windows: d.windows })),
      }),
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Operating hours saved', text2: 'Changes apply to new orders immediately.' });
      void queryClient.invalidateQueries({ queryKey: ['store-operating-hours', storeId] });
      setWeek(null);
      setTzTouched(false);
      setDrafts({});
    },
    onError: () => Toast.show({ type: 'error', text1: 'Could not save hours', text2: 'Please retry.' }),
  });

  const update = (fn: (w: DayState[]) => DayState[]) => setWeek((prev) => fn(prev || model || []));

  // Replace one window's field without dropping a day's other windows (a store
  // may have a morning and an evening window).
  const updateWindow = (dayOfWeek: number, index: number, patch: Partial<Window>) =>
    update((w) => w.map((x) => (x.dayOfWeek === dayOfWeek ? { ...x, windows: x.windows.map((win, i) => (i === index ? { ...win, ...patch } : win)) } : x)));

  const commitDraft = (dayOfWeek: number, field: 'open' | 'close', index: number) => {
    const key = draftKey(dayOfWeek, field);
    const draft = drafts[key];
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (draft == null) return;
    const v = hhmmToMinutes(draft);
    if (v == null) return;
    updateWindow(dayOfWeek, index, field === 'open' ? { openMinute: v } : { closeMinute: v });
  };

  const loading = storesQuery.isLoading || (!!storeId && hoursQuery.isLoading && !week);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.teal700} />
      <GradientSurface preset="teal" style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>STORE SETTINGS</Text>
          <Text style={styles.title}>Operating hours</Text>
        </View>
        <TouchableOpacity style={styles.back} onPress={() => navigation.navigate('StoreSettings' as never)}>
          <Clock size={19} color="#FFFFFF" />
        </TouchableOpacity>
      </GradientSurface>

      {stores.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeRail}>
          {stores.map((store: any) => {
            const selected = store.id === storeId;
            return (
              <TouchableOpacity
                key={store.id}
                style={[styles.storeChip, selected && styles.storeChipActive]}
                onPress={() => setSelectedStoreId(store.id)}
              >
                <Store size={15} color={selected ? '#FFFFFF' : '#0F766E'} />
                <Text style={[styles.storeChipText, selected && styles.storeChipTextActive]} numberOfLines={1}>
                  {store.name || 'Store'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.teal700} /><Text style={styles.muted}>Loading operating hours…</Text></View>
      ) : !storeId || !model ? (
        <View style={styles.center}><Text style={styles.errorTitle}>No store</Text><Text style={styles.muted}>An admin must assign a store before hours can be set.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.card}>
            {model.map((d, i) => (
              <View key={d.dayOfWeek} style={[styles.dayRow, i < model.length - 1 && styles.divider]}>
                <View style={styles.dayHead}>
                  <TouchableOpacity
                    style={[styles.switch, d.open && styles.switchOn]}
                    onPress={() => update((w) => w.map((x) => (x.dayOfWeek === d.dayOfWeek ? { ...x, open: !x.open } : x)))}
                  >
                    <View style={[styles.knob, d.open && styles.knobOn]} />
                  </TouchableOpacity>
                  <Text style={styles.dayName}>{DAYS[d.dayOfWeek]}</Text>
                  <Text style={[styles.dayState, d.open ? { color: palette.teal700 } : { color: palette.slate400 }]}>{d.open ? 'Open' : 'Closed'}</Text>
                </View>
                {d.open ? (
                  <View style={styles.windowList}>
                    {d.windows.map((win, wi) => (
                      <View key={wi} style={styles.windowRow}>
                        <TextInput
                          style={styles.timeInput}
                          value={drafts[draftKey(d.dayOfWeek, `open`)] ?? minutesToHHMM(win.openMinute)}
                          onChangeText={(t) => setDrafts((prev) => ({ ...prev, [draftKey(d.dayOfWeek, `open`)]: t }))}
                          onBlur={() => commitDraft(d.dayOfWeek, 'open', wi)}
                          placeholder="06:00"
                          placeholderTextColor={palette.slate400}
                        />
                        <Text style={styles.dash}>–</Text>
                        <TextInput
                          style={styles.timeInput}
                          value={drafts[draftKey(d.dayOfWeek, `close`)] ?? minutesToHHMM(win.closeMinute)}
                          onChangeText={(t) => setDrafts((prev) => ({ ...prev, [draftKey(d.dayOfWeek, `close`)]: t }))}
                          onBlur={() => commitDraft(d.dayOfWeek, 'close', wi)}
                          placeholder="21:00"
                          placeholderTextColor={palette.slate400}
                        />
                        {wi > 0 ? (
                          <TouchableOpacity
                            onPress={() => update((w) => w.map((x) => (x.dayOfWeek === d.dayOfWeek ? { ...x, windows: x.windows.filter((_, i) => i !== wi) } : x)))}
                            accessibilityLabel="Remove window"
                          >
                            <X size={16} color={palette.slate400} />
                          </TouchableOpacity>
                        ) : null}
                        {win.closeMinute < win.openMinute ? <Text style={styles.midnight}>crosses midnight</Text> : null}
                      </View>
                    ))}
                    <TouchableOpacity
                      style={styles.addWindow}
                      onPress={() => update((w) => w.map((x) => (x.dayOfWeek === d.dayOfWeek ? { ...x, windows: [...x.windows, { openMinute: 16 * 60, closeMinute: 20 * 60 }] } : x)))}
                    >
                      <Plus size={14} color={palette.teal700} />
                      <Text style={styles.addWindowText}>Add window</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.closedHint}>No deliveries on this day</Text>
                )}
              </View>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Timezone</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tzRow}>
            {TIMEZONES.map((tz) => (
              <TouchableOpacity key={tz} style={[styles.tzChip, effectiveTz === tz && styles.tzChipActive]} onPress={() => { setTimezone(tz); setTzTouched(true); }}>
                <Text style={[styles.tzText, effectiveTz === tz && styles.tzTextActive]}>{tz}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </ScrollView>
      )}

      {model ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity style={styles.saveBtn} onPress={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Check size={17} color="#FFFFFF" />}
            <Text style={styles.saveText}>{save.isPending ? 'Saving…' : 'Save operating hours'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.slate050 },
  storeRail: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, alignItems: 'center' },
  storeChip: { maxWidth: 190, height: 39, borderRadius: 12, borderWidth: 1, borderColor: '#CFE4DB', backgroundColor: '#FFFFFF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  storeChipActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  storeChipText: { color: '#0F766E', fontSize: 11, fontWeight: '600', flexShrink: 1 },
  storeChipTextActive: { color: '#FFFFFF' },
  flex: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  back: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, gap: spacing.sm },
  muted: { color: palette.slate500, fontSize: 13 },
  errorTitle: { color: palette.slate900, fontSize: 18, fontWeight: '600' },
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  card: { backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.slate200, overflow: 'hidden' },
  dayRow: { padding: spacing.md, gap: spacing.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: palette.slate100 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switch: { width: 42, height: 24, borderRadius: 12, backgroundColor: palette.slate200, padding: 2, justifyContent: 'center' },
  switchOn: { backgroundColor: palette.teal700 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: palette.white },
  knobOn: { alignSelf: 'flex-end' },
  dayName: { flex: 1, color: palette.slate900, fontSize: 14, fontWeight: '600' },
  dayState: { fontSize: 11, fontWeight: '700' },
  windowList: { marginLeft: 54, gap: spacing.xs },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addWindow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  addWindowText: { color: palette.teal700, fontSize: 12, fontWeight: '600' },
  timeInput: { width: 74, backgroundColor: palette.slate050, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.slate200, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 14, color: palette.slate900, textAlign: 'center' },
  dash: { color: palette.slate400, fontSize: 14 },
  midnight: { color: palette.amber700, fontSize: 10, fontWeight: '600' },
  closedHint: { color: palette.slate400, fontSize: 11.5, marginLeft: 54 },
  sectionLabel: { ...({ fontSize: 11, fontWeight: '700', letterSpacing: 0.6 } as any), color: palette.slate500, textTransform: 'uppercase', marginLeft: spacing.xs },
  tzRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  tzChip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.slate200 },
  tzChipActive: { backgroundColor: palette.teal700, borderColor: palette.teal700 },
  tzText: { fontSize: 12, fontWeight: '600', color: palette.slate600 },
  tzTextActive: { color: '#FFFFFF' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: palette.white, borderTopWidth: 1, borderTopColor: palette.slate200 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: palette.teal700, paddingVertical: spacing.md, borderRadius: radius.md },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
