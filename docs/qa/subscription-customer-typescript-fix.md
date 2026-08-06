# Customer Subscription TypeScript Correction

Exact-head delivery-mobile validation identified seven strict TypeScript errors in the new Customer subscription screens:

- error-to-toast conversion omitted the required user-safe fallback message;
- a React Native image source could remain `null`;
- the subscription quote payload widened `deliveryMethod` from the allowed union to `string`.

The follow-up correction adds explicit safe fallbacks, normalizes the optional image URI to `undefined`, and annotates the quote payload with the authoritative `CreateSubscriptionPayload` subset. No compiler option, test, or type contract is weakened.

A complete exact-head suite is required after the source correction is committed.
