import { describe, it, expect } from "vitest";

describe("API Session Endpoint", () => {
  const API_URL = "https://localhost:3001";

  it("should accept CORS requests from frontend", async () => {
    const response = await fetch(`${API_URL}/api/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://localhost:8081",
      },
      body: JSON.stringify({
        userId: "test-user-123",
        sessionId: "session-test-123",
        sessionKey: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        accountAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        signature: "0x1234",
        permissions: [{ type: "native-token-transfer", data: { maxAmount: "1000000000000000000" } }],
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      }),
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost:8081");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
  });
});
