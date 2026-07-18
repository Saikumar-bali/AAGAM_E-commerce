# Partner Onboarding Phase Plan

## Branch

`phase-partner-onboarding-e2e`

## PO-1 — Secure backend foundation

Completed:

- Customer-only public signup contract
- Restricted application access token
- Email/phone verification lifecycle
- Rider and Store application state machine
- Encrypted sensitive draft values
- Private document evidence and checksums
- Immutable submitted snapshots and idempotency
- Admin review APIs
- Approval-driven account provisioning
- Applicant-created password and one-time activation
- Pending-account login enforcement

Grouped commits:

- `67317398b150c4c614f254b1436164e084963969`
- `c5250415579dd9c9ae670293841532866c278119`
- `872bed4c30967f9a8af9d8371e237c73381376c7`

## PO-2 — Rider and Store mobile application experience

Completed:

- Applicant welcome and professional role choice
- Create and resume protected application
- Contact verification
- Rider profile and payout form
- Store/business/location/capacity form
- Document selection, upload, replacement and status
- Completion indicator
- Submission and resubmission
- Action-required corrections
- Applicant-visible timeline
- Approval status and one-time activation
- Approved-partner operational login
- Removal of public arbitrary-role signup

Grouped commits:

- `9a235bae4b192bde99a25150c1de98e9b6f5c691`
- `24997cc3e74abcb918797e4d8257919dce522abe`

## PO-3 — Admin review and provisioning workspace

Completed:

- Application queue with search, type and status filters
- Review workload metrics
- Application profile and verified-contact review
- Private document preview
- Verify, reject and replacement-required document decisions
- Structured correction requests
- Durable rejection categories and messages
- Approval readiness gate
- Rider or Store provisioning without Admin-created passwords
- Audit event timeline
- Admin Sidebar navigation

Grouped commit:

- `e8c2682234aac11af9e3552a3cb1b30832cc70b2`

## PO-4 — Automated acceptance

Implemented:

- Public role-escalation validation test
- Admin RBAC metadata test
- Rider vehicle-dependent evidence tests
- Store evidence contract test
- Encryption and response-sanitization test
- Full Rider application API lifecycle
- Full Store application API lifecycle
- Private document upload
- Submission idempotency
- Admin browser review and document verification
- Approval and provisioning
- Pending-account login rejection
- One-time activation
- Rider role login and approved profile proof
- Store Owner login and active Store proof
- Reused activation-token rejection
- Playwright screenshots

Acceptance remains incomplete until repository CI, Playwright, CodeQL, Customer Mobile, and Android release workflows all pass on the final head.

## Non-negotiable invariants

- Applicants cannot grant themselves an operational role.
- Applicant tokens cannot access operational APIs.
- Admin never knows the applicant's permanent password.
- Sensitive bank/tax values are not returned to clients.
- Mandatory document decisions are audited.
- Approval is blocked until required documents are verified.
- Provisioning is idempotent.
- Operational login is blocked until activation.
