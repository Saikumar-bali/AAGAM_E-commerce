import React from 'react';
import {Text} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

import {useAuth} from '../../context/AuthContext';
import {CommonStackParamList} from '../../navigation/types';
import {ScreenContainer} from './ScreenContainer';
import {ActionButton, InfoCard} from './UI';

type Props = NativeStackScreenProps<CommonStackParamList, 'Profile'>;

export function ProfileScreen({navigation}: Props) {
  const {authState, logout} = useAuth();
  const user = authState.user;

  return (
    <ScreenContainer title="Profile" subtitle="Common stack for all roles">
      <InfoCard title="Role" value={user?.role ?? 'Unknown'} />
      <InfoCard title="Email" value={user?.email ?? 'Unavailable'} />
      <ActionButton label="Open Settings" onPress={() => navigation.navigate('Settings')} />
      <ActionButton label="Logout" onPress={() => void logout()} variant="secondary" />
      <Text>Logout clears both token and role from secure storage.</Text>
    </ScreenContainer>
  );
}

