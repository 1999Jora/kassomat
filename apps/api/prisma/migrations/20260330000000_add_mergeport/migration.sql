-- AlterTable: Add Mergeport integration fields to Tenant
ALTER TABLE "Tenant" ADD COLUMN "mergeportApiKey_encrypted" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "mergeportApiKeyHint" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "mergeportSiteId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "mergeportEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterEnum: Add 'mergeport' to SalesChannel
ALTER TYPE "SalesChannel" ADD VALUE IF NOT EXISTS 'mergeport';

-- AlterEnum: Add 'mergeport' to OrderSource
ALTER TYPE "OrderSource" ADD VALUE IF NOT EXISTS 'mergeport';
