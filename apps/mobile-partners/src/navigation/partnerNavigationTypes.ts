import type { NavigatorScreenParams } from '@react-navigation/native';

export type RiderJobsStackParamList = {
  RiderJobs: undefined;
  RiderOfferDetail: { assignmentId: string };
  RiderActiveJob: { deliveryJobId: string };
  RiderPickup: { deliveryJobId: string };
  RiderDelivery: { deliveryJobId: string };
  RiderReturn: { deliveryJobId: string };
  RiderJobHistory: undefined;
  RiderJobHistoryDetail: { deliveryJobId?: string; orderId?: string };
};

export type RiderTabParamList = {
  Dashboard: undefined;
  Operations: NavigatorScreenParams<RiderJobsStackParamList> | undefined;
  Alerts: undefined;
  History: undefined;
  Profile: undefined;
  NotificationSettings: undefined;
  TrackingDiagnostics: undefined;
};

export type StoreOrderQueueParams = {
  screen?: 'OrderQueue';
  params?: { storeId?: string };
};

export type StoreTabParamList = {
  Orders: StoreOrderQueueParams | undefined;
  Dashboard?: undefined;
  Operations?: undefined;
  Profile?: undefined;
};

export type RootStackParamList = {
  RiderTabs: NavigatorScreenParams<RiderTabParamList> | undefined;
  StoreTabs: NavigatorScreenParams<StoreTabParamList> | undefined;
  AdminHome: undefined;
  Notifications: undefined;
  Blocked: undefined;
  PartnerWelcome: undefined;
  Login: undefined;
  ApplicationStart: undefined;
  VerifyApplication: undefined;
  RiderApplication: undefined;
  StoreApplication: undefined;
  ApplicationDocuments: undefined;
  ApplicationStatus: undefined;
  ActivatePartner: undefined;
  ResumeApplication: undefined;
};
