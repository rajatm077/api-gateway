// Error handler middleware types and error classes

export class ValidationError extends Error {
  public statusCode = 400;
  public code = 'VALIDATION_ERROR';
  public details: any;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class NotFoundError extends Error {
  public statusCode = 404;
  public code = 'NOT_FOUND';

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  public statusCode = 409;
  public code = 'CONFLICT';

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends Error {
  public statusCode = 503;
  public code = 'SERVICE_UNAVAILABLE';
  public retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.retryAfter = retryAfter;
  }
}

export class RateLimitError extends Error {
  public statusCode = 429;
  public code = 'RATE_LIMIT_EXCEEDED';
  public retryAfter: number;
  public resetAt: Date;

  constructor(message: string, retryAfter: number, resetAt: Date) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.resetAt = resetAt;
  }
}
