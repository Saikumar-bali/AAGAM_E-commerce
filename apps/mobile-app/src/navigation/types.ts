import {NavigatorScreenParams} from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
};

export type CustomerStackParamList = {
  Shop: undefined;
  Cart: undefined;
  Orders: undefined;
};

export type RiderStackParamList = {
  AssignedDeliveries: undefined;
  LiveMap: undefined;
  Earnings: undefined;
};

export type CommonStackParamList = {
  Profile: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  RoleStack: undefined;
  CommonStack: NavigatorScreenParams<CommonStackParamList>;
};
