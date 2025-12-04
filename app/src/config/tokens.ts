import type { Address } from "viem";

export interface TokenConfig {
  symbol: string;
  name: string;
  address: Address;
  decimals?: number; // Optional - fetched from contract if not provided
  logoUrl?: string;
}

export interface ChainTokens {
  chainId: number;
  nativeSymbol: string;
  nativeName: string;
  tokens: TokenConfig[];
}

// Token configurations by chain
// Add new networks/tokens here - no code changes needed elsewhere
const TOKEN_CONFIG: Record<number, ChainTokens> = {
  // Sepolia Testnet
  11155111: {
    chainId: 11155111,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    tokens: [
      {
        symbol: "USDC",
        name: "USD Coin",
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        decimals: 6,
      },
      {
        symbol: "EURC",
        name: "Euro Coin",
        address: "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
        decimals: 6,
      },
    ],
  },
  // Mainnet (example - add tokens as needed)
  1: {
    chainId: 1,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    tokens: [
      {
        symbol: "USDC",
        name: "USD Coin",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
      },
      {
        symbol: "EURC",
        name: "Euro Coin",
        address: "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c",
        decimals: 6,
      },
    ],
  },
};

/**
 * Get token configuration for a specific chain
 */
export function getChainTokens(chainId: number): ChainTokens | undefined {
  return TOKEN_CONFIG[chainId];
}

/**
 * Get all configured tokens for a chain (excluding native)
 */
export function getTokens(chainId: number): TokenConfig[] {
  return TOKEN_CONFIG[chainId]?.tokens ?? [];
}

/**
 * Get native token info for a chain
 */
export function getNativeToken(chainId: number): { symbol: string; name: string } {
  const config = TOKEN_CONFIG[chainId];
  return {
    symbol: config?.nativeSymbol ?? "ETH",
    name: config?.nativeName ?? "Ether",
  };
}

/**
 * Find a specific token by symbol on a chain
 */
export function findToken(chainId: number, symbol: string): TokenConfig | undefined {
  return TOKEN_CONFIG[chainId]?.tokens.find((t) => t.symbol === symbol);
}

// Re-export for convenience
export { TOKEN_CONFIG };
