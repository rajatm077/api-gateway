// Rate limit middleware types

export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'X-RateLimit-Type'?: string;
  'X-RateLimit-Status'?: string;
  'Retry-After'?: string;
}

export interface RateLimitErrorResponse {
  success: false;
  error: {
    code: 'RATE_LIMIT_EXCEEDED' | 'BULK_RATE_LIMIT_EXCEEDED';
    message: string;
    details: {
      retryAfter?: number;
      resetAt: string;
      remaining: number;
      bulkMultiplier?: number;
      type?: string;
    };
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export interface WebhookRateLimitErrorResponse {
  error: string;
  retryAfter?: number;
}
