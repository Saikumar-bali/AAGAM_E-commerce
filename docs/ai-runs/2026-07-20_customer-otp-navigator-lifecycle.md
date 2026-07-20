# Customer OTP navigator lifecycle root cause

## Observed symptom

The API delivered the OTP and the global toast displayed, but the Customer app remained on the phone-entry form instead of showing the profile and OTP step.

## Root cause

`requestPhoneOtp` sets the shared auth store `isLoading` flag while the network request is running. Customer `RootNavigator` subscribed to the entire auth store and returned a full-screen loading page whenever `isLoading` was true. This unmounted `LoginScreen` during the OTP request. When the request resolved, the toast still rendered because its host sits outside the navigator, but the Login screen instance that owned `masked`, `otpPurpose`, `newCustomer`, profile, and OTP state had already been destroyed.

## Fix

- Customer `RootNavigator` subscribes only to `user` and `initialize`.
- A local `isInitializing` flag gates only the first secure-session/Keychain restoration.
- OTP, login, Google, and verification request loading no longer replace or unmount the Customer navigation tree.
- Added a source contract preventing `isLoading` from being reintroduced as a navigator gate.

## Expected result

After a successful OTP request, the same mounted Login screen receives the challenge state and immediately renders the NEW CUSTOMER profile and OTP step.
