// Rate limiter service types and interfaces

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds
}

export interface RateLimitConfig {
  defaultLimit?: number;
  windowMs?: number;
  keyPrefix?: string;
}

export interface RateLimitStats {
  tenantId: string;
  totalRemaining: number;
  totalLimit: number;
  windowMs: number;
  lastChecked: Date;
}
