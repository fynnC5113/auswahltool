// Personal applicant link (TECH_DESIGN 6.1): 32 random bytes, only the
// SHA-256 hash is stored. Server only.
import { createHash, randomBytes } from "node:crypto";

/** URL-safe, 43 characters. */
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hex SHA-256, as stored in applicants.token_hash. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
