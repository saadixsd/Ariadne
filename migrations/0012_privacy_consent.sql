-- Sign-up consent to the privacy policy: when, and to which version (additive).
ALTER TABLE "User" ADD COLUMN "privacyConsentAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "privacyPolicyVersion" TEXT;
