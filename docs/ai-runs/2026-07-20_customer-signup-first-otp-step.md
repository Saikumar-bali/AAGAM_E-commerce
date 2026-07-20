# Customer signup-first OTP step

## Root cause

The previous Customer app started OTP discovery with `LOGIN` and entered signup only when the failed request had exactly HTTP 404. The working web registration page does not depend on that failure path; it requests `SIGNUP` directly. In addition, the mobile challenge UI was rendered inside a non-scrollable centered layout and immediately focused a hidden OTP input. On smaller Android screens the keyboard could compress the new-customer profile and OTP controls out of view, making the screen appear unchanged or incomplete.

## Fix

- Start Customer phone discovery with `SIGNUP`.
- If the phone already exists, accept only the stable 409 conflict and request `LOGIN` once.
- Never inspect backend message text and never loop.
- Render a dedicated, scrollable OTP state with clear NEW CUSTOMER / EXISTING CUSTOMER labeling.
- Focus the full-name field for new customers and the OTP field for returning customers.
- Keep resend bound directly to the resolved purpose.
- Preserve request and verification locks.

## Verification

- First-time phone: `SIGNUP` only.
- Existing phone: `SIGNUP`, then one `LOGIN` after 409.
- 400, 429, 500, and network failures never trigger LOGIN fallback.
- LOGIN failure after 409 does not loop.
- Resend preserves SIGNUP or LOGIN directly.
- Customer screen contract confirms ScrollView, profile-first focus, OTP creation CTA, and no separate signup navigation dependency.
