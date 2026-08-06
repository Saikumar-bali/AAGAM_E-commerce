export type CustomerStackParamList = {
  MainTabs: undefined;
  Checkout: undefined;
  Deals: undefined;
  ProductDetail: { productId: string };
  OrderDetail: { orderId: string };
  Review: { orderId: string };
  Support: undefined;
  Alerts: undefined;
  SavedAddresses: undefined;
  SubscriptionPlans: { productId?: string } | undefined;
  SubscriptionReview: { planId: string };
  MySubscriptions: undefined;
  SubscriptionDetail: { subscriptionId: string };
};
