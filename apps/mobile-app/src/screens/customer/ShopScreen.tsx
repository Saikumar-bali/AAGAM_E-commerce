import React, {useMemo, useState} from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {CustomerStackParamList} from '../../navigation/types';
import {formatINR} from '../../utils/currency';

type Props = NativeStackScreenProps<CustomerStackParamList, 'Shop'>;

type Product = {
  id: string;
  name: string;
  price: number;
  mrp?: number;
  unit: string;
  imageUrl?: string;
  tag?: string;
};

const PRODUCTS: Product[] = [
  {id: 'p1', name: 'Basmati Rice (Premium)', price: 129, mrp: 149, unit: '1 kg', tag: 'Best value'},
  {id: 'p2', name: 'A2 Cow Milk', price: 72, unit: '1 L', tag: 'Fresh'},
  {id: 'p3', name: 'Brown Bread', price: 45, unit: '1 pack'},
  {id: 'p4', name: 'Eggs (Farm)', price: 84, unit: '6 pcs'},
  {id: 'p5', name: 'Banana', price: 38, unit: '6 pcs'},
  {id: 'p6', name: 'Onion', price: 28, unit: '1 kg'},
  {id: 'p7', name: 'Tomato', price: 34, unit: '1 kg'},
  {id: 'p8', name: 'Paneer', price: 110, unit: '200 g', tag: 'Protein'},
];

const CATEGORIES = ['All', 'Essentials', 'Dairy', 'Bakery', 'Fruits', 'Veggies'];

export function ShopScreen({navigation}: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      const matchesQuery = !q || p.name.toLowerCase().includes(q);
      const matchesCategory = category === 'All' ? true : true; // placeholder until real categories exist
      return matchesQuery && matchesCategory;
    });
  }, [query, category]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.h1}>Shop</Text>
        <Pressable onPress={() => navigation.navigate('Cart')} style={styles.cartPill}>
          <Text style={styles.cartText}>Cart</Text>
          <View style={styles.cartDot}>
            <Text style={styles.cartDotText}>3</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search products"
          placeholderTextColor="#94a3b8"
          style={styles.search}
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        data={CATEGORIES}
        keyExtractor={(item) => item}
        renderItem={({item}) => (
          <Pressable
            onPress={() => setCategory(item)}
            style={[styles.chip, item === category && styles.chipActive]}>
            <Text style={[styles.chipText, item === category && styles.chipTextActive]}>{item}</Text>
          </Pressable>
        )}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        renderItem={({item}) => <ProductCard product={item} onAdd={() => {}} />}
      />
    </View>
  );
}

function ProductCard({product, onAdd}: {product: Product; onAdd: () => void}) {
  const discount =
    product.mrp && product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : null;

  return (
    <View style={styles.card}>
      <View style={styles.media}>
        {product.imageUrl ? (
          <Image source={{uri: product.imageUrl}} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>A</Text>
          </View>
        )}
        {product.tag ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{product.tag}</Text>
          </View>
        ) : null}
      </View>

      <Text numberOfLines={2} style={styles.name}>
        {product.name}
      </Text>
      <Text style={styles.unit}>{product.unit}</Text>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{formatINR(product.price)}</Text>
        {product.mrp ? <Text style={styles.mrp}>{formatINR(product.mrp)}</Text> : null}
        {discount ? <Text style={styles.discount}>{discount}% off</Text> : null}
      </View>

      <Pressable onPress={onAdd} style={styles.addBtn}>
        <Text style={styles.addBtnText}>Add</Text>
        <Text style={styles.addBtnPlus}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  header: {
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  h1: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e2e8f0',
    letterSpacing: 0.2,
  },
  cartPill: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  cartText: {
    color: '#e2e8f0',
    fontWeight: '700',
  },
  cartDot: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cartDotText: {
    color: '#052e16',
    fontWeight: '900',
    fontSize: 12,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  search: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    color: '#e2e8f0',
  },
  chips: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
  },
  chipActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  chipText: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#86efac',
  },
  grid: {
    paddingHorizontal: 12,
    paddingBottom: 18,
  },
  gridRow: {
    gap: 12,
    justifyContent: 'space-between',
  },
  card: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 8},
    elevation: 3,
    marginBottom: 12,
  },
  media: {
    height: 90,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
  },
  imagePlaceholderText: {
    color: '#86efac',
    fontWeight: '900',
    fontSize: 26,
  },
  badge: {
    position: 'absolute',
    left: 8,
    top: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.20)',
  },
  badgeText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '800',
  },
  name: {
    color: '#e2e8f0',
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
    minHeight: 36,
  },
  unit: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  price: {
    color: '#e2e8f0',
    fontWeight: '900',
    fontSize: 14,
  },
  mrp: {
    color: '#94a3b8',
    fontSize: 12,
    textDecorationLine: 'line-through',
    fontWeight: '700',
  },
  discount: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '900',
  },
  addBtn: {
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.34)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnText: {
    color: '#86efac',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  addBtnPlus: {
    color: '#86efac',
    fontWeight: '900',
    fontSize: 16,
    marginTop: -1,
  },
});

