import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, ChevronRight, PauseCircle, Plus, WalletCards } from 'lucide-react-native';
import { subscriptionService, type CustomerSubscription } from '../../api/subscriptionService';
import {
  subscriptionSegmentCounts,
  subscriptionStatusGroups,
  type SubscriptionSegment,
} from '../../domain/subscriptionPresentation';
import type { CustomerStackParamList } from '../../navigation/customerNavigationTypes';

const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
const money = (paise: number) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;

export const MySubscriptionsScreen = () => {
  const navigation = useNavigation<NavigationProp<CustomerStackParamList>>();
  const [segment, setSegment] = useState<SubscriptionSegment>('Active');
  const query = useQuery({ queryKey: ['my-subscriptions'], queryFn: subscriptionService.mine, refetchOnMount: 'always' });
  const subscriptions = useMemo(() => query.data ?? [], [query.data]);
  const counts = useMemo(() => subscriptionSegmentCounts(subscriptions), [subscriptions]);
  const rows = useMemo(() => subscriptions.filter((item) => subscriptionStatusGroups[segment].includes(item.status)), [subscriptions, segment]);

  const renderSubscription = ({ item }: { item: CustomerSubscription }) => {
    const total = Number(item.planVersion?.totalDeliveries || item.completedDeliveries + item.remainingFundedDeliveries || 1);
    const progress = Math.min(100, Math.round(Number(item.completedDeliveries || 0) / total * 100));
    const imageUri = item.plan.mobileImageUrl || item.plan.imageUrl;
    return <Pressable style={styles.card} onPress={() => navigation.navigate('SubscriptionDetail', { subscriptionId: item.id })}>
      <View style={styles.cardTop}>{imageUri ? <Image source={{ uri: imageUri }} style={styles.image} /> : <View style={styles.image} />}<View style={styles.flex}><View style={styles.statusBadge}><Text style={styles.statusText}>{item.status.replaceAll('_', ' ')}</Text></View><Text style={styles.name}>{item.plan.name}</Text><Text style={styles.funding}>{item.fundingCycle === 'WEEKLY' ? 'Weekly cash funding' : 'Full-plan cash funding'}</Text></View><ChevronRight size={21} color="#7E938A" /></View>
      <View style={styles.progressHead}><Text style={styles.progressLabel}>{item.completedDeliveries} of {total} delivered</Text><Text style={styles.progressValue}>{progress}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
      <View style={styles.metrics}><View style={styles.metric}><CalendarClock size={17} color="#087B5B" /><Text style={styles.metricLabel}>Next</Text><Text style={styles.metricValue}>{date(item.nextDeliveryDate)}</Text></View><View style={styles.metric}><WalletCards size={17} color="#B76400" /><Text style={styles.metricLabel}>Cash due</Text><Text style={styles.metricValue}>{money(item.amountDuePaise)}</Text></View><View style={styles.metric}><PauseCircle size={17} color="#475569" /><Text style={styles.metricLabel}>Funded left</Text><Text style={styles.metricValue}>{item.remainingFundedDeliveries}</Text></View></View>
    </Pressable>;
  };

  return <SafeAreaView style={styles.screen}><View style={styles.header}><Pressable onPress={() => navigation.goBack()} style={styles.icon}><ArrowLeft size={22} color="#173D32" /></Pressable><View style={styles.flex}><Text style={styles.eyebrow}>YOUR ROUTINE</Text><Text style={styles.title}>My subscriptions</Text></View><Pressable style={styles.add} onPress={() => navigation.navigate('SubscriptionPlans')}><Plus size={18} color="#FFFFFF" /></Pressable></View>
    <View style={styles.segments}>{(Object.keys(subscriptionStatusGroups) as SubscriptionSegment[]).map((item) => {
      const selected = item === segment;
      const count = counts[item];
      return <Pressable
        key={item}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${item}, ${count} ${count === 1 ? 'subscription' : 'subscriptions'}`}
        onPress={() => setSegment(item)}
        style={[styles.segment, selected && styles.segmentActive]}
      >
        <View style={styles.segmentContent}>
          <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{item}</Text>
          <View style={[styles.countBadge, selected && styles.countBadgeActive, count === 0 && styles.countBadgeZero]}>
            <Text style={[styles.countText, selected && styles.countTextActive, count === 0 && styles.countTextZero]}>{count}</Text>
          </View>
        </View>
      </Pressable>;
    })}</View>
    {query.isLoading ? <View style={styles.center}><ActivityIndicator size="large" color="#087B5B" /></View> : null}
    {query.isError ? <View style={styles.center}><Text style={styles.emptyTitle}>Could not load subscriptions</Text><Pressable style={styles.retry} onPress={() => void query.refetch()}><Text style={styles.retryText}>Try again</Text></Pressable></View> : null}
    {!query.isLoading && rows.length === 0 ? <View style={styles.center}><CalendarClock size={46} color="#9AAFA6" /><Text style={styles.emptyTitle}>No {segment.toLowerCase()} plans</Text><Text style={styles.emptyCopy}>Choose a plan for milk, fruit or future essentials.</Text><Pressable style={styles.retry} onPress={() => navigation.navigate('SubscriptionPlans')}><Text style={styles.retryText}>Explore plans</Text></Pressable></View> : null}
    <FlatList data={rows} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={renderSubscription} />
  </SafeAreaView>;
};
const styles = StyleSheet.create({ screen:{flex:1,backgroundColor:'#F4F8F6'},flex:{flex:1},header:{flexDirection:'row',alignItems:'center',gap:12,padding:16,backgroundColor:'#FFFFFF'},icon:{width:44,height:44,borderRadius:15,backgroundColor:'#EFF7F3',alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#087B5B'},title:{fontSize:23,fontWeight:'900',color:'#173D32'},add:{width:44,height:44,borderRadius:15,backgroundColor:'#087B5B',alignItems:'center',justifyContent:'center'},segments:{flexDirection:'row',paddingHorizontal:8,paddingVertical:10,gap:4,backgroundColor:'#FFFFFF',borderBottomWidth:1,borderBottomColor:'#E4EBE7'},segment:{flex:1,minHeight:40,alignItems:'center',justifyContent:'center',borderRadius:13},segmentActive:{backgroundColor:'#E4F6EE'},segmentContent:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},segmentText:{fontSize:10,fontWeight:'800',color:'#74847D'},segmentTextActive:{color:'#087B5B'},countBadge:{minWidth:18,height:18,paddingHorizontal:5,borderRadius:9,backgroundColor:'#E8EEEB',alignItems:'center',justifyContent:'center'},countBadgeActive:{backgroundColor:'#087B5B'},countBadgeZero:{backgroundColor:'#F2F5F3'},countText:{fontSize:9,fontWeight:'900',color:'#52645C'},countTextActive:{color:'#FFFFFF'},countTextZero:{color:'#9AA7A1'},list:{padding:16,gap:13,paddingBottom:40},card:{backgroundColor:'#FFFFFF',borderRadius:23,padding:16,borderWidth:1,borderColor:'#E0E9E4'},cardTop:{flexDirection:'row',alignItems:'center',gap:12},image:{width:68,height:68,borderRadius:17,backgroundColor:'#E6F2EC'},statusBadge:{alignSelf:'flex-start',backgroundColor:'#E8F7F0',paddingHorizontal:8,paddingVertical:4,borderRadius:999},statusText:{fontSize:8,fontWeight:'900',color:'#087B5B'},name:{fontSize:17,fontWeight:'900',color:'#173D32',marginTop:5},funding:{fontSize:11,color:'#6A7C74',marginTop:2},progressHead:{flexDirection:'row',justifyContent:'space-between',marginTop:16},progressLabel:{fontSize:12,fontWeight:'800',color:'#51675E'},progressValue:{fontSize:12,fontWeight:'900',color:'#087B5B'},track:{height:8,borderRadius:99,backgroundColor:'#E5EEE9',overflow:'hidden',marginTop:7},fill:{height:'100%',backgroundColor:'#0B8E66',borderRadius:99},metrics:{flexDirection:'row',gap:8,marginTop:15},metric:{flex:1,padding:10,borderRadius:15,backgroundColor:'#F5F8F6'},metricLabel:{fontSize:9,color:'#71837B',marginTop:5},metricValue:{fontSize:12,fontWeight:'900',color:'#263F36',marginTop:2},center:{flex:1,alignItems:'center',justifyContent:'center',padding:30,gap:10},emptyTitle:{fontSize:18,fontWeight:'900',color:'#244237',textAlign:'center'},emptyCopy:{color:'#718079',textAlign:'center'},retry:{minHeight:46,paddingHorizontal:20,borderRadius:15,backgroundColor:'#087B5B',alignItems:'center',justifyContent:'center'},retryText:{color:'#FFFFFF',fontWeight:'900'} });
