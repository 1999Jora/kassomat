-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "cancelledReceiptId" TEXT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_cancelledReceiptId_fkey" FOREIGN KEY ("cancelledReceiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
