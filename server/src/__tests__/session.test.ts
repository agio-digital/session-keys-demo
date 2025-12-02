import { describe, it, expect } from "vitest";
import {
  isSessionActive,
  validateSession,
  calculateExpiry,
  MAX_EXPIRY_MS,
} from "agio-smart-wallet-core";

describe("Session Validation", () => {
  it("should return valid for active session", () => {
    const session = {
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      revoked: false,
    };

    expect(isSessionActive(session)).toBe(true);
    expect(validateSession(session)).toEqual({ valid: true });
  });

  it("should return invalid for expired session", () => {
    const session = {
      expiresAt: Date.now() - 1000,
      revoked: false,
    };

    expect(isSessionActive(session)).toBe(false);
    expect(validateSession(session)).toEqual({ valid: false, reason: "expired" });
  });

  it("should return invalid for revoked session", () => {
    const session = {
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      revoked: true,
    };

    expect(isSessionActive(session)).toBe(false);
    expect(validateSession(session)).toEqual({ valid: false, reason: "revoked" });
  });

  it("should return invalid for null session", () => {
    expect(isSessionActive(null)).toBe(false);
    expect(validateSession(null)).toEqual({ valid: false, reason: "not_found" });
  });
});

describe("Expiry Calculation", () => {
  it("should calculate expiry from hours", () => {
    const before = Date.now();
    const expiry = calculateExpiry({ expiryHours: 24 });
    const after = Date.now();

    expect(expiry).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(expiry).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
  });

  it("should use max expiry for 0 hours (never)", () => {
    const expiry = calculateExpiry({ expiryHours: 0 });
    expect(expiry).toBe(MAX_EXPIRY_MS);
  });

  it("should use explicit expiresAt when provided", () => {
    const explicit = Date.now() + 1000000;
    const expiry = calculateExpiry({ expiresAt: explicit });
    expect(expiry).toBe(explicit);
  });

  it("should default to 24 hours", () => {
    const before = Date.now();
    const expiry = calculateExpiry();
    const after = Date.now();

    expect(expiry).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(expiry).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
  });
});
