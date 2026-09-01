import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

/**
 * FIELD_ENCRYPTION_KEY must be a 32-byte key, base64-encoded, in .env.
 * Generate one with: openssl rand -base64 32
 */
function getKey(): Buffer {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("FIELD_ENCRYPTION_KEY is not set in the environment.");
  }
  return Buffer.from(key, "base64");
}

/** Encrypts plaintext, returns "iv:authTag:ciphertext" (all base64, colon-joined). */
export function encryptField(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Reverses encryptField. Throws if the value was tampered with or the key is wrong. */
export function decryptField(encrypted: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(":");
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
