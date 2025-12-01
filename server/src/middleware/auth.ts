import { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, JWTPayload, JWTVerifyGetKey } from "jose";
import pino from "pino";

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
  },
});

// JWKS cache - initialized lazily
let jwks: JWTVerifyGetKey | null = null;

function getJWKS(): JWTVerifyGetKey | null {
  if (jwks) return jwks;

  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
  if (!AUTH0_DOMAIN) {
    logger.warn("AUTH0_DOMAIN not set");
    return null;
  }

  jwks = createRemoteJWKSet(new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`));
  logger.info({ domain: AUTH0_DOMAIN }, "JWKS initialized");
  return jwks;
}

export interface AuthRequest extends Request {
  auth?: {
    sub: string;        // User ID from Auth0
    email?: string;
    payload: JWTPayload;
  };
}

/**
 * Middleware to verify Auth0 JWT tokens.
 * Adds `req.auth` with user info on success.
 */
export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);
  const JWKS = getJWKS();
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;

  if (!JWKS) {
    logger.error("AUTH0_DOMAIN not configured");
    return res.status(500).json({ error: "Auth not configured" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${AUTH0_DOMAIN}/`,
      // Optionally validate audience if you have one configured
      // audience: process.env.AUTH0_AUDIENCE,
    });

    if (!payload.sub) {
      return res.status(401).json({ error: "Invalid token: missing sub claim" });
    }

    req.auth = {
      sub: payload.sub,
      email: payload.email as string | undefined,
      payload,
    };

    logger.debug({ sub: payload.sub }, "Auth verified");
    next();
  } catch (err: any) {
    logger.warn({ error: err.message }, "Token verification failed");
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Optional auth middleware - doesn't fail if no token, but populates req.auth if valid.
 */
export async function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const JWKS = getJWKS();
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;

  if (!authHeader?.startsWith("Bearer ") || !JWKS) {
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${AUTH0_DOMAIN}/`,
    });

    if (payload.sub) {
      req.auth = {
        sub: payload.sub,
        email: payload.email as string | undefined,
        payload,
      };
    }
  } catch {
    // Token invalid - continue without auth
  }

  next();
}
