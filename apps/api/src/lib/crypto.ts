import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM_GCM = 'aes-256-gcm';
const ALGORITHM_CBC = 'aes-256-cbc';

function getKey(): Buffer {
  const key = process.env['ENCRYPTION_KEY'];
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set');
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return buf;
}

/**
 * Verschlüsselt einen String mit AES-256-GCM.
 * Rückgabe: "iv:authTag:ciphertext" als Hex-String.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV is recommended for GCM
  const cipher = createCipheriv(ALGORITHM_GCM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Entschlüsselt einen AES-256-GCM verschlüsselten String.
 * Erwartet Format: "iv:authTag:ciphertext" als Hex-String.
 */
function decryptGCM(ciphertext: string): string {
  const [ivHex, authTagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !encHex) throw new Error('Invalid GCM ciphertext format');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM_GCM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Entschlüsselt einen AES-256-CBC verschlüsselten String (Legacy-Format).
 * Erwartet Format: "iv:ciphertext" als Hex-String.
 */
function decryptCBC(ciphertext: string): string {
  const [ivHex, encHex] = ciphertext.split(':');
  if (!ivHex || !encHex) throw new Error('Invalid CBC ciphertext format');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM_CBC, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Entschlüsselt einen verschlüsselten String.
 * Erkennt automatisch das Format:
 *   - 2 Doppelpunkte → GCM (iv:authTag:ciphertext)
 *   - 1 Doppelpunkt  → CBC Legacy (iv:ciphertext)
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length === 3) {
    return decryptGCM(ciphertext);
  }
  if (parts.length === 2) {
    return decryptCBC(ciphertext);
  }
  throw new Error('Invalid ciphertext format');
}

/** Gibt null zurück wenn der Wert null/undefined ist, sonst entschlüsselt */
export function decryptNullable(value: string | null | undefined): string | null {
  if (!value) return null;
  return decrypt(value);
}
