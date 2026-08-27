import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword", () => {
  it("returns a string that is not the plaintext password", async () => {
    const password = "correct-horse-battery";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash).not.toContain(password);
  });

  it("uses the pbkdf2-sha256$ prefix and includes a salt", async () => {
    const hash = await hashPassword("correct-horse-battery");
    const parts = hash.split("$");

    expect(hash.startsWith("pbkdf2-sha256$")).toBe(true);
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("pbkdf2-sha256");
    expect(parts[1]).toBe("100000");
    expect(parts[2].length).toBeGreaterThan(0);
    expect(parts[3].length).toBeGreaterThan(0);
    expect(parts[2]).not.toBe(parts[3]);
  });

  it("produces different hashes for the same password because salts are unique", async () => {
    const password = "correct-horse-battery";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toBe(second);
    expect(first.split("$")[2]).not.toBe(second.split("$")[2]);
  });
});

describe("verifyPassword", () => {
  it("returns true for the original password", async () => {
    const password = "correct-horse-battery";
    const hash = await hashPassword(password);

    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("returns false for a different password", async () => {
    const hash = await hashPassword("correct-horse-battery");

    await expect(verifyPassword("wrong-password-value", hash)).resolves.toBe(
      false,
    );
  });

  it("returns false for a malformed hash string", async () => {
    const password = "correct-horse-battery";

    await expect(verifyPassword(password, "")).resolves.toBe(false);
    await expect(verifyPassword(password, "not-a-hash")).resolves.toBe(false);
    await expect(
      verifyPassword(password, "pbkdf2-sha256$100000$only-two-parts"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword(password, "bcrypt$100000$abcd$efgh"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword(password, "pbkdf2-sha256$100000$$"),
    ).resolves.toBe(false);
  });
});
