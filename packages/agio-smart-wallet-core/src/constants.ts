/**
 * Maximum expiry timestamp (max uint32 - year 2106)
 * Used for "never expires" sessions
 */
export const MAX_EXPIRY_SEC = 4294967295;
export const MAX_EXPIRY_MS = MAX_EXPIRY_SEC * 1000;

/**
 * Default session expiry in hours
 */
export const DEFAULT_EXPIRY_HOURS = 24;

/**
 * Preset expiry durations in hours
 */
export const EXPIRY_PRESETS = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
  "30d": 720,
  "1y": 8760,
  never: 0,
} as const;

export type ExpiryPreset = keyof typeof EXPIRY_PRESETS;
