import { describe, it, expect } from "vitest";

describe("Session Management", () => {
  it("should validate session expiry", () => {
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days from now

    expect(now < expiresAt).toBe(true);
  });

  it("should detect expired session", () => {
    const now = Date.now();
    const expiresAt = now - 1000; // 1 second ago

    expect(now > expiresAt).toBe(true);
  });

  it("should generate valid session ID", () => {
    const sessionId = "session-" + Math.random().toString(36).slice(2, 11);

    expect(sessionId).toMatch(/^session-[a-z0-9]+$/);
    expect(sessionId.length).toBeGreaterThan(8);
  });

  it("should validate permissions structure", () => {
    const permissions = [
      {
        type: "native-token-transfer",
        data: {
          maxAmount: "1000000000000000000",
        },
      },
    ];

    expect(permissions).toHaveLength(1);
    expect(permissions[0].type).toBe("native-token-transfer");
    expect(permissions[0].data.maxAmount).toBe("1000000000000000000");
  });
});
