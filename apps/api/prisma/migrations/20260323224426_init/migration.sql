-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('starter', 'pro', 'business');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'trial');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'cashier');

-- CreateEnum
CREATE TYPE "VatRate" AS ENUM ('0', '10', '20');

-- CreateEnum
CREATE TYPE "ReceiptType" AS ENUM ('sale', 'cancellation', 'training', 'null_receipt', 'start_receipt', 'month_receipt', 'year_receipt');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('pending', 'signed', 'printed', 'cancelled', 'offline_pending');

-- CreateEnum
CREATE TYPE "SalesChannel" AS ENUM ('direct', 'lieferando', 'wix');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'online');

-- CreateEnum
CREATE TYPE "IncomingOrderStatus" AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('lieferando', 'wix');

-- CreateEnum
CREATE TYPE "DeliveryPaymentMethod" AS ENUM ('cash_on_delivery', 'online_paid');

-- CreateEnum
CREATE TYPE "PrinterConnectionType" AS ENUM ('network', 'usb');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('pending', 'printing', 'done', 'error');

-- CreateEnum
CREATE TYPE "ATrustEnvironment" AS ENUM ('test', 'production');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "TenantPlan" NOT NULL DEFAULT 'starter',
    "status" "TenantStatus" NOT NULL DEFAULT 'trial',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Vienna',
    "vatNumber" TEXT,
    "receiptFooter" TEXT,
    "printerIp" TEXT,
    "printerPort" INTEGER,
    "rksvEnabled" BOOLEAN NOT NULL DEFAULT true,
    "atrustCertificateSerial" TEXT,
    "atrustApiKey_encrypted" TEXT,
    "atrustEnvironment" "ATrustEnvironment" NOT NULL DEFAULT 'test',
    "lieferandoRestaurantId" TEXT,
    "lieferandoApiKey_encrypted" TEXT,
    "lieferandoWebhookSecret" TEXT,
    "lieferandoIsActive" BOOLEAN NOT NULL DEFAULT false,
    "wixSiteId" TEXT,
    "wixApiKey_encrypted" TEXT,
    "wixWebhookSecret" TEXT,
    "wixIsActive" BOOLEAN NOT NULL DEFAULT false,
    "wixDefaultDeliveryPayment" TEXT NOT NULL DEFAULT 'cash',
    "myposStoreId" TEXT,
    "myposApiKey_encrypted" TEXT,
    "myposSecretKey_encrypted" TEXT,
    "myposTerminalSerial" TEXT,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'cashier',
    "name" TEXT NOT NULL,
    "pin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "vatRate" "VatRate" NOT NULL DEFAULT '20',
    "categoryId" TEXT NOT NULL,
    "pluCode" TEXT,
    "barcode" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lieferandoExternalId" TEXT,
    "wixProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "type" "ReceiptType" NOT NULL DEFAULT 'sale',
    "status" "ReceiptStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cashierId" TEXT NOT NULL,
    "channel" "SalesChannel" NOT NULL DEFAULT 'direct',
    "externalOrderId" TEXT,
    "incomingOrderId" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "amountPaid" INTEGER NOT NULL,
    "change" INTEGER NOT NULL DEFAULT 0,
    "tip" INTEGER NOT NULL DEFAULT 0,
    "subtotalNet" INTEGER NOT NULL,
    "vat0" INTEGER NOT NULL DEFAULT 0,
    "vat10" INTEGER NOT NULL DEFAULT 0,
    "vat20" INTEGER NOT NULL DEFAULT 0,
    "totalVat" INTEGER NOT NULL,
    "totalGross" INTEGER NOT NULL,
    "rksv_registrierkasseId" TEXT,
    "rksv_belegnummer" TEXT,
    "rksv_barumsatzSumme" INTEGER NOT NULL DEFAULT 0,
    "rksv_previousReceiptHash" TEXT,
    "rksv_receiptHash" TEXT,
    "rksv_signature" TEXT,
    "rksv_qrCodeData" TEXT,
    "rksv_signedAt" TIMESTAMP(3),
    "rksv_atCertificateSerial" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "vatRate" "VatRate" NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "totalNet" INTEGER NOT NULL,
    "totalVat" INTEGER NOT NULL,
    "totalGross" INTEGER NOT NULL,

    CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DEPEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "belegnummer" TEXT NOT NULL,
    "belegtyp" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "rksv_hash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DEPEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "IncomingOrderStatus" NOT NULL DEFAULT 'pending',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "deliveryStreet" TEXT,
    "deliveryCity" TEXT,
    "deliveryZip" TEXT,
    "deliveryNotes" TEXT,
    "paymentMethod" "DeliveryPaymentMethod" NOT NULL DEFAULT 'cash_on_delivery',
    "totalAmount" INTEGER NOT NULL,
    "notes" TEXT,
    "rawPayload" JSONB,

    CONSTRAINT "IncomingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "options" TEXT[],

    CONSTRAINT "IncomingOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "openingFloat" INTEGER NOT NULL,
    "closingFloat" INTEGER,
    "totalRevenue" INTEGER NOT NULL DEFAULT 0,
    "receiptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyClosing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "closedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCash" INTEGER NOT NULL,
    "totalCard" INTEGER NOT NULL,
    "totalOnline" INTEGER NOT NULL,
    "totalRevenue" INTEGER NOT NULL,
    "receiptCount" INTEGER NOT NULL,
    "cancellationCount" INTEGER NOT NULL,
    "depExportPath" TEXT,

    CONSTRAINT "DailyClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "Category_tenantId_idx" ON "Category"("tenantId");

-- CreateIndex
CREATE INDEX "Category_tenantId_sortOrder_idx" ON "Category"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_isActive_idx" ON "Product"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_tenantId_pluCode_idx" ON "Product"("tenantId", "pluCode");

-- CreateIndex
CREATE INDEX "Product_tenantId_barcode_idx" ON "Product"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "Product_lieferandoExternalId_idx" ON "Product"("lieferandoExternalId");

-- CreateIndex
CREATE INDEX "Product_wixProductId_idx" ON "Product"("wixProductId");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_idx" ON "Receipt"("tenantId");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_createdAt_idx" ON "Receipt"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_status_idx" ON "Receipt"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_channel_idx" ON "Receipt"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "Receipt_externalOrderId_idx" ON "Receipt"("externalOrderId");

-- CreateIndex
CREATE INDEX "Receipt_tenantId_type_idx" ON "Receipt"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_tenantId_receiptNumber_key" ON "Receipt"("tenantId", "receiptNumber");

-- CreateIndex
CREATE INDEX "ReceiptItem_receiptId_idx" ON "ReceiptItem"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptItem_productId_idx" ON "ReceiptItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DEPEntry_receiptId_key" ON "DEPEntry"("receiptId");

-- CreateIndex
CREATE INDEX "DEPEntry_tenantId_idx" ON "DEPEntry"("tenantId");

-- CreateIndex
CREATE INDEX "DEPEntry_tenantId_timestamp_idx" ON "DEPEntry"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "DEPEntry_belegnummer_idx" ON "DEPEntry"("belegnummer");

-- CreateIndex
CREATE INDEX "IncomingOrder_tenantId_idx" ON "IncomingOrder"("tenantId");

-- CreateIndex
CREATE INDEX "IncomingOrder_tenantId_status_idx" ON "IncomingOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "IncomingOrder_tenantId_receivedAt_idx" ON "IncomingOrder"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "IncomingOrder_externalId_idx" ON "IncomingOrder"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingOrder_tenantId_externalId_key" ON "IncomingOrder"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "IncomingOrderItem_orderId_idx" ON "IncomingOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "Shift_tenantId_idx" ON "Shift"("tenantId");

-- CreateIndex
CREATE INDEX "Shift_tenantId_startedAt_idx" ON "Shift"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "Shift_cashierId_idx" ON "Shift"("cashierId");

-- CreateIndex
CREATE INDEX "DailyClosing_tenantId_idx" ON "DailyClosing"("tenantId");

-- CreateIndex
CREATE INDEX "DailyClosing_tenantId_date_idx" ON "DailyClosing"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClosing_tenantId_date_key" ON "DailyClosing"("tenantId", "date");

-- CreateIndex
CREATE INDEX "PrintJob_tenantId_idx" ON "PrintJob"("tenantId");

-- CreateIndex
CREATE INDEX "PrintJob_status_idx" ON "PrintJob"("status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_incomingOrderId_fkey" FOREIGN KEY ("incomingOrderId") REFERENCES "IncomingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DEPEntry" ADD CONSTRAINT "DEPEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DEPEntry" ADD CONSTRAINT "DEPEntry_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingOrder" ADD CONSTRAINT "IncomingOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingOrderItem" ADD CONSTRAINT "IncomingOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "IncomingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClosing" ADD CONSTRAINT "DailyClosing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyClosing" ADD CONSTRAINT "DailyClosing_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
