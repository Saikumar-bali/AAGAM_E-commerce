import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StyleSheet, 
  Dimensions, 
  RefreshControl,
  StatusBar,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
  PermissionsAndroid,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import Geolocation from 'react-native-geolocation-service';
import { API_URL as ENV_API_URL } from '@env';
import { riderService } from '../../api/riderService';
import { useAuthStore } from '../../store/authStore';
import { 
  Package, 
  DollarSign, 
  Power,
  ShieldCheck,
  Zap,
  ArrowRight,
  Clock,
  MapPin,
  Phone,
  List,
  RefreshCw,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');
const API_URL = ENV_API_URL || 'https://aagam-api-production.up.railway.app';

const formatAddressText = (snapshot?: any) => {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const lineParts = [snapshot.line1, snapshot.line2].filter(Boolean).join(', ');
  const localityParts = [snapshot.landmark, snapshot.city, snapshot.pincode].filter(Boolean).join(', ');
  return [lineParts, localityParts].filter(Boolean).join(' • ');
};

export const RiderDashboard = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [isOnline, setIsOnline] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const previousQueueIdsRef = useRef<string[]>([]);
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);

  // Fetch assigned orders
  const { data: assignedOrders, isLoading: loadingAssigned, refetch: refetchAssigned } = useQuery({
    queryKey: ['rider-assigned'],
    queryFn: riderService.getAssignedOrders,
    refetchInterval: isOnline ? 12000 : false,
  });

  // Fetch available queue
  const { data: queueOrders, isLoading: loadingQueue, refetch: refetchQueue } = useQuery({
    queryKey: ['rider-queue'],
    queryFn: riderService.getAvailableQueue,
    refetchInterval: isOnline ? 7000 : false,
  });

  const [newOrder, setNewOrder] = useState<any>(null);

  // Socket setup
  useEffect(() => {
    // Register device for push notifications
    import('../../utils/notifications')
      .then(({ registerDeviceToken }) => registerDeviceToken())
      .catch((error) => console.warn('[RiderDashboard] Notifications unavailable', error));

    const newSocket = io(API_URL, {
      transports: ['websocket'],
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      console.log('[Rider Socket] Connected');
      newSocket.emit('joinRidersQueue');
      if (currentLocation) {
        newSocket.emit('joinRiderZone', { latitude: currentLocation.lat, longitude: currentLocation.lng });
      }
    });

    newSocket.on('newOrderNearby', (data: any) => {
      setNewOrder(data);
      handleRefresh();
    });

    newSocket.on('connect_error', (error: any) => {
      console.warn('[Rider Socket] connect_error', error?.message || error);
    });

    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, [currentLocation?.lat, currentLocation?.lng]);

  useEffect(() => {
    if (socket) {
      handleGoOnline();
    }
  }, [socket]);

  useEffect(() => {
    const queueList = Array.isArray(queueOrders) ? queueOrders : [];
    const currentIds = queueList.map((o: any) => o.id);
    const previousIds = previousQueueIdsRef.current;
    const newIds = currentIds.filter((id: string) => !previousIds.includes(id));

    if (isOnline && previousIds.length > 0 && newIds.length > 0) {
      const newest = queueList.find((o: any) => o.id === newIds[0]);
      setNewOrder(newest || null);
      Alert.alert(
        'New nearby order',
        newest ? `${newest.store?.name || 'Aagam store'} • ₹${newest.grandTotal}` : 'A new order is available to accept.',
      );
    }

    previousQueueIdsRef.current = currentIds;
  }, [queueOrders, isOnline]);

  const handleRefresh = () => {
    refetchAssigned();
    refetchQueue();
  };

  const handleGoOffline = async () => {
    setIsOnline(false);
    try {
      await riderService.updateMyStatus('OFFLINE', currentLocation
        ? { latitude: currentLocation.lat, longitude: currentLocation.lng }
        : undefined);
    } catch (error) {
      console.warn('[RiderDashboard] Rider offline update failed', error);
    }
  };

  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
      title: 'Allow Aagam rider location',
      message: 'Aagam needs your location to show nearby orders and share live delivery tracking.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  const handleGoOnline = async () => {
    setLocating(true);
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      Alert.alert('Location permission needed', 'Allow location permission to go online and receive nearby orders.');
      setLocating(false);
      return;
    }

    Geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ lat: latitude, lng: longitude });
        try {
          await riderService.updateMyStatus('ONLINE', { latitude, longitude });
        } catch (error) {
          console.warn('[RiderDashboard] Rider status update failed', error);
        }
        if (socket) {
          socket.emit('joinRiderZone', { latitude, longitude });
        }
        setIsOnline(true);
        setLocating(false);
      },
      (error) => {
        console.warn('[RiderDashboard] Location error', error);
        Alert.alert('Location Error', 'Please enable GPS to go online');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const sendLiveLocation = (orderId: string) => {
    Geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy, speed, heading } = position.coords;
        setCurrentLocation({ lat: latitude, lng: longitude });
        try {
          await riderService.updateMyStatus('BUSY', { latitude, longitude });
          await riderService.sendLocationPing(orderId, {
            latitude,
            longitude,
            accuracy: accuracy ?? undefined,
            speed: speed ?? undefined,
            heading: heading ?? undefined,
          });
          socket?.emit('updateRiderLocation', {
            riderId: user?.id,
            orderId,
            latitude,
            longitude,
            bearing: heading || 0,
            status: 'LIVE',
          });
        } catch (error) {
          console.warn('[RiderDashboard] Location ping failed', error);
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  useEffect(() => {
    const activeTrackableOrder = Array.isArray(assignedOrders)
      ? assignedOrders.find((order: any) => ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'].includes(order.status))
      : null;

    if (!activeTrackableOrder || !isOnline) return;

    sendLiveLocation(activeTrackableOrder.id);
    const interval = setInterval(() => {
      sendLiveLocation(activeTrackableOrder.id);
    }, activeTrackableOrder.status === 'OUT_FOR_DELIVERY' ? 8000 : 20000);

    return () => clearInterval(interval);
  }, [assignedOrders, isOnline, socket, user?.id]);

  const handleAcceptOrder = async (orderId: string) => {
    if (!orderId || acceptingOrderId) return;
    setAcceptingOrderId(orderId);
    try {
      await riderService.assignOrder(orderId);
      setNewOrder(null);
      Alert.alert('Success', 'Order accepted!');
      handleRefresh();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to accept order');
    } finally {
      setAcceptingOrderId(null);
    }
  };

  const confirmAcceptOrder = (orderId: string) => {
    Alert.alert(
      'Accept this order?',
      'This will assign the delivery to you.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: () => handleAcceptOrder(orderId) },
      ],
      { cancelable: true },
    );
  };

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string, status: string }) => 
      riderService.updateOrderStatus(orderId, status),
    onSuccess: () => {
      handleRefresh();
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to update status');
    }
  });

  const handleUpdateStatus = (orderId: string, currentStatus: string) => {
    if (currentStatus === 'RIDER_ASSIGNED') {
      riderService.startTracking(orderId)
        .then(handleRefresh)
        .catch((error: any) => Alert.alert('Error', error.message || 'Failed to start tracking'));
      return;
    }
    if (currentStatus === 'OUT_FOR_DELIVERY') {
      riderService.stopTracking(orderId)
        .then(handleRefresh)
        .catch((error: any) => Alert.alert('Error', error.message || 'Failed to complete delivery'));
      return;
    }

    let nextStatus = '';
    if (currentStatus === 'CONFIRMED') nextStatus = 'PICKING';
    else if (currentStatus === 'PICKING') nextStatus = 'PACKED';
    else if (currentStatus === 'PACKED') nextStatus = 'RIDER_ASSIGNED';

    if (nextStatus) {
      updateStatusMutation.mutate({ orderId, status: nextStatus });
    }
  };

  const openMaps = (lat?: number, lng?: number) => {
    if (!lat || !lng) return;
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}`
    });
    if (url) Linking.openURL(url);
  };

  const openDeliveryRoute = (order: any) => {
    if (!order?.deliveryLat || !order?.deliveryLng) {
      Alert.alert('Location missing', 'Customer location is not available for this order yet.');
      return;
    }
    const originLat = currentLocation?.lat ?? order.store?.latitude;
    const originLng = currentLocation?.lng ?? order.store?.longitude;
    const hasOrigin = typeof originLat === 'number' && typeof originLng === 'number';
    const destination = `${order.deliveryLat},${order.deliveryLng}`;
    const url = hasOrigin
      ? `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destination}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${destination}`;
    Linking.openURL(url);
  };

  const callCustomer = (phone?: string | null) => {
    if (!phone) {
      Alert.alert('Phone unavailable', 'Customer phone number is not available on this order.');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" />

      {/* Premium New Order Modal */}
      {newOrder && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.pulseContainer}>
              <View style={styles.pulseInner} />
            </View>
            <Text style={styles.modalTitle}>New Delivery Request!</Text>
            <Text style={styles.modalAmount}>₹{newOrder.grandTotal}</Text>
            <Text style={styles.modalStore}>{newOrder.store?.name || 'Aagam Partner'}</Text>
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={styles.declineBtn}
                onPress={() => setNewOrder(null)}
              >
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.acceptBtn}
                onPress={() => confirmAcceptOrder(newOrder.orderId || newOrder.id)}
              >
                <Text style={styles.acceptBtnText}>Accept Order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      
      {/* Header with Presence */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Rider Dashboard</Text>
          <Text style={styles.name}>{user?.name || 'Partner'}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.statusToggle, isOnline ? styles.onlineBg : styles.offlineBg]}
          onPress={isOnline ? handleGoOffline : handleGoOnline}
          disabled={locating}
        >
          {locating ? <ActivityIndicator size="small" color="#0F766E" /> : (
            <>
              <Power size={18} color={isOnline ? '#10B981' : '#64748B'} />
              <Text style={[styles.statusText, isOnline ? styles.onlineText : styles.offlineText]}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loadingAssigned || loadingQueue} onRefresh={handleRefresh} />}
      >
        {/* Earnings Parity with Web */}
        <View style={styles.statsRow}>
          <StatCard label="Earnings" value="₹0.00" icon={DollarSign} color="#10B981" />
          <StatCard label="Trips" value="0" icon={ShieldCheck} color="#0F766E" />
          <StatCard label="Rating" value="5.0 ★" icon={Zap} color="#F59E0B" />
        </View>

        {/* Active Order Card - Deep Integration */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Current Delivery</Text>
          {assignedOrders?.length > 0 && <View style={styles.livePulse} />}
        </View>

        {Array.isArray(assignedOrders) && assignedOrders.length > 0 ? (
          assignedOrders.map((order: any) => (
            <View key={order.id} style={styles.deliveryCard}>
              {(() => {
                const customerName = order.customer?.name || order.addressSnapshot?.recipientName || 'Customer';
                const customerPhone = order.customer?.phone || order.addressSnapshot?.phoneE164 || null;
                const customerAddress = formatAddressText(order.addressSnapshot) || 'Address not set';
                return (
                  <>
              <View style={styles.cardHeader}>
                <View style={styles.orderInfo}>
                  <Package size={18} color="#0F766E" />
                  <Text style={styles.orderIdText}>Order #{order.id.slice(-8).toUpperCase()}</Text>
                </View>
                <StatusChip status={order.status} />
              </View>

              {/* Progress Tracker Parity */}
              <View style={styles.progressTracker}>
                <View style={[styles.progressBar, { width: getProgressWidth(order.status) }]} />
              </View>

              {/* Delivery Details */}
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}><MapPin size={18} color="#64748B" /></View>
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>PICKUP FROM</Text>
                  <Text style={styles.detailValue}>{order.store?.name || 'Partner Store'}</Text>
                  <TouchableOpacity onPress={() => openMaps(order.store?.latitude, order.store?.longitude)}>
                    <Text style={styles.linkText}>Get Directions →</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.detailRow}>
                <View style={styles.detailIcon}><User size={18} color="#64748B" /></View>
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>DELIVER TO</Text>
                  <Text style={styles.detailValue}>{customerName}</Text>
                  <Text style={styles.detailSub}>{customerAddress}</Text>
                  <View style={styles.customerActionsRow}>
                    <TouchableOpacity onPress={() => openDeliveryRoute(order)}>
                      <Text style={styles.linkText}>Navigate to customer →</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => callCustomer(customerPhone)}>
                      <View style={styles.callAction}>
                        <Phone size={13} color="#0F766E" />
                        <Text style={styles.callActionText}>Call</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Item Checklist */}
              {order.items && (
                <View style={styles.itemsBox}>
                  <Text style={styles.itemsTitle}>ITEMS ({order.items.length})</Text>
                  {order.items.map((item: any, idx: number) => (
                    <Text key={idx} style={styles.itemText}>• {item.product?.name} x{item.quantity}</Text>
                  ))}
                </View>
              )}

              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleUpdateStatus(order.id, order.status)}
              >
                <Text style={styles.actionButtonText}>{getActionLabel(order.status)}</Text>
                <ArrowRight size={20} color="#FFF" />
              </TouchableOpacity>
                  </>
                );
              })()}
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Truck size={48} color="#E2E8F0" />
            <Text style={styles.emptyText}>No active deliveries at the moment</Text>
          </View>
        )}

        {/* Available Orders Queue */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available Orders</Text>
          <View style={styles.queueCountBadge}>
            <Text style={styles.queueCountText}>{Array.isArray(queueOrders) ? queueOrders.length : 0}</Text>
          </View>
          <TouchableOpacity onPress={handleRefresh} style={styles.inlineRefreshBtn}>
            <RefreshCw size={14} color="#0F766E" />
            <Text style={styles.inlineRefreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {Array.isArray(queueOrders) && queueOrders.length > 0 ? (
          queueOrders.map((order: any) => (
            <TouchableOpacity key={order.id} style={styles.queueCard} onPress={() => confirmAcceptOrder(order.id)}>
              <View style={styles.queueInfo}>
                <View style={styles.queueIcon}><Zap size={20} color="#F59E0B" /></View>
                <View>
                  <Text style={styles.queueTitle}>₹{order.grandTotal} Order Nearby</Text>
                  <Text style={styles.queueSub}>{order.store?.name}</Text>
                </View>
              </View>
              <View style={styles.acceptBadge}><Text style={styles.acceptText}>ACCEPT</Text></View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Clock size={40} color="#E2E8F0" />
            <Text style={styles.emptyText}>No nearby orders found</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// Components & Helpers
const StatCard = ({ label, value, icon: Icon, color }: any) => (
  <View style={styles.statCard}>
    <View style={[styles.iconCircle, { backgroundColor: color + '15' }]}>
      <Icon size={18} color={color} />
    </View>
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  </View>
);

const StatusChip = ({ status }: { status: string }) => {
  const colors: any = { CONFIRMED: '#3B82F6', PICKING: '#F59E0B', OUT_FOR_DELIVERY: '#8B5CF6', DELIVERED: '#10B981' };
  const color = colors[status] || '#64748B';
  return (
    <View style={[styles.statusChip, { backgroundColor: color + '15' }]}>
      <Text style={[styles.statusChipText, { color }]}>{status.replace(/_/g, ' ')}</Text>
    </View>
  );
};

const getProgressWidth = (status: string) => {
  switch (status) {
    case 'CONFIRMED': return '25%';
    case 'PICKING': return '40%';
    case 'PACKED': return '55%';
    case 'RIDER_ASSIGNED': return '70%';
    case 'OUT_FOR_DELIVERY': return '85%';
    case 'DELIVERED': return '100%';
    default: return '0%';
  }
};

const getActionLabel = (status: string) => {
  switch (status) {
    case 'CONFIRMED': return 'I have reached the store';
    case 'PICKING': return 'Items are packed';
    case 'PACKED': return 'Accept for delivery';
    case 'RIDER_ASSIGNED': return 'Start live delivery';
    case 'OUT_FOR_DELIVERY': return 'I have delivered the order';
    default: return 'View Details';
  }
};

const User = ({ size, color }: any) => <MapPin size={size} color={color} />; // Quick shim

const Truck = ({ size, color }: any) => <Package size={size} color={color} />; // Quick shim

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  greeting: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  name: { fontSize: 24, fontWeight: 'bold', color: '#1E293B' },
  statusToggle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  onlineBg: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  offlineBg: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  statusText: { fontSize: 12, fontWeight: '800', marginLeft: 8 },
  onlineText: { color: '#10B981' },
  offlineText: { color: '#64748B' },
  statsRow: { flexDirection: 'row', padding: 20, gap: 10 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', padding: 14, borderRadius: 20, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  iconCircle: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  statLabel: { fontSize: 11, color: '#64748B' },
  statValue: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginTop: 10, marginBottom: 16, gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  livePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  queueCountBadge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  queueCountText: { fontSize: 12, fontWeight: '800', color: '#1D4ED8' },
  inlineRefreshBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  inlineRefreshText: { fontSize: 12, fontWeight: '700', color: '#0F766E' },
  deliveryCard: { backgroundColor: '#FFFFFF', marginHorizontal: 20, borderRadius: 28, padding: 22, marginBottom: 20, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  orderInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderIdText: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  progressTracker: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, marginBottom: 24, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#0F766E' },
  detailRow: { flexDirection: 'row', marginBottom: 20, gap: 16 },
  detailIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  detailText: { flex: 1 },
  detailLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  detailSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  linkText: { fontSize: 13, color: '#0F766E', fontWeight: '700', marginTop: 6 },
  customerActionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  callAction: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  callActionText: { fontSize: 12, fontWeight: '700', color: '#0F766E' },
  itemsBox: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 24 },
  itemsTitle: { fontSize: 10, fontWeight: '800', color: '#94A3B8', marginBottom: 8 },
  itemText: { fontSize: 13, color: '#475569', marginBottom: 4, fontWeight: '500' },
  actionButton: { backgroundColor: '#1E293B', height: 60, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  actionButtonText: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  queueCard: { backgroundColor: '#FFFFFF', marginHorizontal: 20, borderRadius: 20, padding: 18, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  queueInfo: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  queueIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center' },
  queueTitle: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  queueSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  acceptBadge: { backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  acceptText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  emptyContainer: { alignItems: 'center', padding: 60, gap: 16 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  statusChipText: { fontSize: 11, fontWeight: '800' },
  
  // Modal Styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  pulseContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  pulseInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  modalAmount: {
    fontSize: 48,
    fontWeight: '900',
    color: '#10B981',
    marginBottom: 8,
  },
  modalStore: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 32,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  declineBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748B',
  },
  acceptBtn: {
    flex: 2,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  acceptBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
});
