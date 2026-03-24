import { Queue } from 'bullmq';

/** Job-Namen für die RKSV-Queue */
export const RKSV_QUEUE_NAME = 'rksv';

export type RKSVJobName =
  | 'sign_receipt'
  | 'retry_signatures'
  | 'create_month_receipt'
  | 'create_year_receipt'
  | 'dep_backup';

export interface SignReceiptJobData {
  receiptId: string;
  tenantId: string;
  attempt?: number;
}

export interface CreateMonthReceiptJobData {
  tenantId: string;
  month: string; // ISO date string
}

export interface DepBackupJobData {
  tenantId: string;
  date: string; // "YYYY-MM-DD"
}

function getRedisConnection() {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parseInt(parsed.pathname?.slice(1) || '0', 10),
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null as null, enableReadyCheck: false };
  }
}

/** BullMQ Queue für asynchrone RKSV-Signatur-Jobs */
export const rksvQueue = new Queue(RKSV_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
