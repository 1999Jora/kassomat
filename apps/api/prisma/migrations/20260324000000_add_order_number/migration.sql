-- Add auto-incrementing orderNumber to IncomingOrder
-- Existing rows will get sequential numbers assigned automatically

CREATE SEQUENCE IF NOT EXISTS "IncomingOrder_orderNumber_seq";

ALTER TABLE "IncomingOrder"
  ADD COLUMN IF NOT EXISTS "orderNumber" INTEGER NOT NULL
  DEFAULT nextval('"IncomingOrder_orderNumber_seq"');

ALTER SEQUENCE "IncomingOrder_orderNumber_seq"
  OWNED BY "IncomingOrder"."orderNumber";
