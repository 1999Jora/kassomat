-- AlterTable: Add fiskaltrust fields to Tenant
ALTER TABLE "Tenant" ADD COLUMN "fiskaltrustCashboxId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "fiskaltrustAccessToken_encrypted" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "fiskaltrustAccessTokenHint" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "fiskaltrustEnvironment" TEXT NOT NULL DEFAULT 'sandbox';
