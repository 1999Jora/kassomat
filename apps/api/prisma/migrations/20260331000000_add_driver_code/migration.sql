-- Add driver connection code to Tenant
ALTER TABLE "Tenant" ADD COLUMN "driverCode" TEXT;
CREATE UNIQUE INDEX "Tenant_driverCode_key" ON "Tenant"("driverCode");
