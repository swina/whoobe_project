import * as argon2 from 'argon2';

// argon2id: OWASP's current recommendation over bcrypt for new systems.
export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

export async function verifyPassword(passwordHash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, plainPassword);
  } catch {
    // Malformed/foreign hash format - treat as a failed verification, not a crash.
    return false;
  }
}
