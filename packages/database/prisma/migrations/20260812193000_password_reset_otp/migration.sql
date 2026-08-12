ALTER TABLE "ContactOtpChallenge"
  DROP CONSTRAINT IF EXISTS "ContactOtpChallenge_purpose_check";

ALTER TABLE "ContactOtpChallenge"
  ADD CONSTRAINT "ContactOtpChallenge_purpose_check" CHECK (
    "purpose" IN ('CUSTOMER_LOGIN', 'CUSTOMER_SIGNUP', 'PARTNER_RESUME', 'PASSWORD_RESET')
  );
