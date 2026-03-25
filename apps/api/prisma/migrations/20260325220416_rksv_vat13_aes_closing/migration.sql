-- AlterEnum
ALTER TYPE "ReceiptType" ADD VALUE 'closing_receipt';

-- AlterEnum
ALTER TYPE "VatRate" ADD VALUE '13';

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "rksv_umsatzzaehlerEncrypted" TEXT,
ADD COLUMN     "vat13" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "rksvAesKeyHint" TEXT,
ADD COLUMN     "rksvAesKey_encrypted" TEXT;
