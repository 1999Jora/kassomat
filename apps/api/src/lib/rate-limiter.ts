/**
 * Simple in-memory rate limiter for login brute-force protection.
 *
 * Two buckets:
 *   - Per email:  max 5  failed attempts per 15 min window
 *   - Per IP:     max 20 attempts      per 15 min window
 *
 * Old entries are cleaned up every 15 minutes automatically.
 */

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_PER_EMAIL = 5;
const MAX_ATTEMPTS_PER_IP = 20;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  firstAttempt: number;
}

const emailAttempts = new Map<string, AttemptRecord>();
const ipAttempts = new Map<string, AttemptRecord>();

function getOrReset(map: Map<string, AttemptRecord>, key: string): AttemptRecord {
  const now = Date.now();
  const record = map.get(key);
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    const fresh = { count: 0, firstAttempt: now };
    map.set(key, fresh);
    return fresh;
  }
  return record;
}

function cleanup(map: Map<string, AttemptRecord>) {
  const now = Date.now();
  for (const [key, record] of map) {
    if (now - record.firstAttempt > WINDOW_MS) {
      map.delete(key);
    }
  }
}

// Auto-cleanup every 15 minutes
const cleanupTimer = setInterval(() => {
  cleanup(emailAttempts);
  cleanup(ipAttempts);
}, CLEANUP_INTERVAL_MS);
// Don't keep the process alive just for cleanup
cleanupTimer.unref();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  message?: string;
}

/**
 * Check whether a login attempt is allowed.
 * Call BEFORE processing the login.
 */
export function checkLoginRateLimit(email: string, ip: string): RateLimitResult {
  const normalizedEmail = email.toLowerCase();

  const emailRecord = getOrReset(emailAttempts, normalizedEmail);
  if (emailRecord.count >= MAX_FAILED_PER_EMAIL) {
    const retryAfter = Math.ceil(
      (WINDOW_MS - (Date.now() - emailRecord.firstAttempt)) / 1000,
    );
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      message: `Zu viele fehlgeschlagene Anmeldeversuche. Bitte in ${Math.ceil(retryAfter / 60)} Minuten erneut versuchen.`,
    };
  }

  const ipRecord = getOrReset(ipAttempts, ip);
  if (ipRecord.count >= MAX_ATTEMPTS_PER_IP) {
    const retryAfter = Math.ceil(
      (WINDOW_MS - (Date.now() - ipRecord.firstAttempt)) / 1000,
    );
    return {
      allowed: false,
      retryAfterSeconds: retryAfter,
      message: `Zu viele Anmeldeversuche von dieser IP-Adresse. Bitte in ${Math.ceil(retryAfter / 60)} Minuten erneut versuchen.`,
    };
  }

  // Always count IP attempts (successful or not)
  ipRecord.count++;

  return { allowed: true };
}

/**
 * Record a failed login attempt for the given email.
 * Call AFTER a login fails.
 */
export function recordFailedLogin(email: string): void {
  const normalizedEmail = email.toLowerCase();
  const record = getOrReset(emailAttempts, normalizedEmail);
  record.count++;
}

/**
 * Clear failed-login counter for an email after a successful login.
 */
export function clearFailedLogins(email: string): void {
  emailAttempts.delete(email.toLowerCase());
}
