# agio-smart-wallet-core

Shared types, utilities, and constants for Agio smart wallet packages.

## Installation

```bash
npm install agio-smart-wallet-core
# or
yarn add agio-smart-wallet-core
```

## Usage

### Types

```typescript
import type {
  SessionData,
  SessionInfo,
  WalletData,
  Permission,
  CreateSessionOptions,
} from "agio-smart-wallet-core";
```

### Session Validation

```typescript
import { isSessionActive, validateSession } from "agio-smart-wallet-core";

const session = { expiresAt: Date.now() + 3600000, revoked: false };

if (isSessionActive(session)) {
  console.log("Session is active");
}

const validation = validateSession(session);
if (!validation.valid) {
  console.log(`Session invalid: ${validation.reason}`);
}
```

### Expiry Calculation

```typescript
import {
  calculateExpiry,
  formatExpiry,
  EXPIRY_PRESETS,
} from "agio-smart-wallet-core";

// Calculate expiry from hours
const expiry = calculateExpiry({ expiryHours: 24 });

// Use presets
const weekExpiry = calculateExpiry({ expiryHours: EXPIRY_PRESETS["7d"] });

// Format for display
console.log(formatExpiry(expiry)); // "24h", "7d", "Never", etc.
```

### Context Extraction

```typescript
import { extractSessionId, extractSignature } from "agio-smart-wallet-core";

// Extract from permissions context returned by grantPermissions()
const sessionId = extractSessionId(permissionsContext);
const signature = extractSignature(permissionsContext);
```

## API Reference

### Types

- `SessionData` - Full session data stored on server (includes sessionKey)
- `SessionInfo` - Public session info returned by API (excludes sensitive data)
- `WalletData` - Wallet data stored on server
- `Permission` - Permission object for session keys
- `CreateSessionOptions` - Options for creating a session

### Functions

- `validateSession(session)` - Validate a session, returns `{ valid, reason? }`
- `isSessionActive(session)` - Check if session is active (not expired/revoked)
- `calculateExpiry(options)` - Calculate expiry timestamp from options
- `formatExpiry(expiresAt)` - Format expiry for display
- `extractSessionId(context)` - Extract session ID from permissions context
- `extractSignature(context)` - Extract signature from permissions context

### Constants

- `MAX_EXPIRY_SEC` - Maximum expiry in seconds (uint32 max)
- `MAX_EXPIRY_MS` - Maximum expiry in milliseconds
- `DEFAULT_EXPIRY_HOURS` - Default expiry (24 hours)
- `EXPIRY_PRESETS` - Preset durations: `1h`, `6h`, `24h`, `7d`, `30d`, `1y`, `never`

## License

MIT
