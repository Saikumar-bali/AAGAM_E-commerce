import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { ArrowRight, BadgePercent } from 'lucide-react-native';
import type { PromotionCampaign } from '../../promotions/types';

type Props = {
  campaigns?: PromotionCampaign[];
  onPress: (campaign: PromotionCampaign) => void;
  compact?: boolean;
};

export const PromotionCarousel = ({ campaigns, onPress, compact = false }: Props) => {
  const visibleCampaigns = Array.isArray(campaigns) ? campaigns : [];
  const [active, setActive] = useState(0);
  const listRef = useRef<FlatList<PromotionCampaign>>(null);
  const { width } = useWindowDimensions();
  const cardWidth = compact ? Math.min(width - 64, 300) : width - 32;

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(visibleCampaigns.length - 1, 0)));
    if (compact || visibleCampaigns.length < 2) return;
    const timer = setInterval(() => {
      setActive((current) => {
        const next = (current + 1) % visibleCampaigns.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [compact, visibleCampaigns.length]);

  if (!visibleCampaigns.length) {
    if (compact) return null;
    return (
      <View style={styles.emptyHero}>
        <BadgePercent size={26} color="#0F766E" />
        <Text style={styles.emptyTitle}>Fresh essentials, delivered quickly</Text>
        <Text style={styles.emptyText}>Published offers from Aagaam will appear here.</Text>
      </View>
    );
  }

  const updateActive = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12));
    setActive(Math.max(0, Math.min(index, visibleCampaigns.length - 1)));
  };

  return (
    <View>
      <FlatList
        ref={listRef}
        data={visibleCampaigns}
        horizontal
        pagingEnabled={false}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={updateActive}
        getItemLayout={(_, index) => ({ length: cardWidth + 12, offset: (cardWidth + 12) * index, index })}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const creative = item.mobileImageUrl || item.imageUrl;
          const imageFirst = Boolean(creative) && !compact;
          const content = (
            <>
              {creative ? <View style={styles.scrim} /> : null}
              <View style={[styles.copy, compact && styles.copyCompact]}>
                {item.badgeText ? <Text style={styles.badge}>{item.badgeText}</Text> : null}
                <Text
                  numberOfLines={compact ? 2 : 3}
                  style={[styles.title, compact && styles.titleCompact, { color: item.textColor || '#FFFFFF' }]}
                >
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text numberOfLines={2} style={[styles.subtitle, { color: item.textColor || '#FFFFFF' }]}>
                    {item.subtitle}
                  </Text>
                ) : null}
                {item.targetUrl ? (
                  <View style={[styles.cta, { backgroundColor: item.accentColor || '#2DD4BF' }]}>
                    <Text style={styles.ctaText}>{item.ctaLabel || 'View offer'}</Text>
                    <ArrowRight size={14} color="#0F172A" />
                  </View>
                ) : null}
              </View>
            </>
          );
          return (
            <TouchableOpacity
              activeOpacity={item.targetUrl ? 0.9 : 1}
              disabled={!item.targetUrl}
              onPress={() => onPress(item)}
              accessibilityLabel={`${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}`}
              style={[
                styles.card,
                compact ? styles.compactCard : styles.heroCard,
                { width: cardWidth, backgroundColor: item.backgroundColor || '#0F172A' },
              ]}
            >
              {creative ? (
                <ImageBackground source={{ uri: creative }} resizeMode="cover" style={styles.image}>
                  {imageFirst ? null : content}
                </ImageBackground>
              ) : content}
            </TouchableOpacity>
          );
        }}
      />
      {!compact && visibleCampaigns.length > 1 ? (
        <View style={styles.dots}>
          {visibleCampaigns.map((campaign, index) => (
            <View key={campaign.id} style={[styles.dot, index === active && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: { overflow: 'hidden', borderRadius: 24 },
  heroCard: { minHeight: 230 },
  compactCard: { minHeight: 176 },
  image: { flex: 1, minHeight: '100%' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(2, 6, 23, 0.52)' },
  copy: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', padding: 24, minHeight: 230 },
  copyCompact: { minHeight: 176, padding: 18 },
  badge: { overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', color: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 5, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  title: { marginTop: 12, fontSize: 28, lineHeight: 32, fontWeight: '900', letterSpacing: -0.6 },
  titleCompact: { fontSize: 21, lineHeight: 25 },
  subtitle: { marginTop: 8, fontSize: 13, lineHeight: 18, fontWeight: '700', opacity: 0.9 },
  cta: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9 },
  ctaText: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  dots: { marginTop: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#CBD5E1' },
  dotActive: { width: 22, backgroundColor: '#0F766E' },
  emptyHero: { minHeight: 170, borderRadius: 24, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { marginTop: 10, color: '#0F172A', fontSize: 20, lineHeight: 25, fontWeight: '900', textAlign: 'center' },
  emptyText: { marginTop: 6, color: '#64748B', fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
});
