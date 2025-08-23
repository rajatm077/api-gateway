import { Redis } from 'ioredis';
import { logger } from '../utils/logger';
import { RateLimitResult, RateLimitConfig, RateLimitStats } from '../types/rateLimiterService';

export class RateLimiterService {
  private redisClient: Redis;
  private defaultLimit: number;
  private windowMs: number;
  private keyPrefix: string;
  
  // Lua script for atomic token bucket operations
  private readonly tokenBucketScript = `
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local tokens = tonumber(ARGV[2])
    local interval = tonumber(ARGV[3])
    local requested = tonumber(ARGV[4])
    local now = tonumber(ARGV[5])
    
    local bucket = redis.call('GET', key)
    local count
    local last_refill
    
    if bucket == false then
      count = capacity
      last_refill = now
    else
      local data = cjson.decode(bucket)
      count = data.count
      last_refill = data.last_refill
    end
    
    -- Calculate tokens to add based on time elapsed
    local elapsed = now - last_refill
    local tokens_to_add = math.floor(elapsed / interval * tokens)
    count = math.min(capacity, count + tokens_to_add)
    
    local allowed = count >= requested
    if allowed then
      count = count - requested
    end
    
    -- Store updated bucket state
    local bucket_data = cjson.encode({
      count = count,
      last_refill = now
    })
    redis.call('SET', key, bucket_data, 'EX', math.ceil(interval / 1000 * 2))
    
    return {allowed and 1 or 0, count, math.ceil((capacity - count) / tokens * interval)}
  `;
  
  constructor(redisClient: Redis, config?: RateLimitConfig) {
    // 1. Store Redis client reference
    this.redisClient = redisClient;
    
    // 2. Set default rate limit (50 r/s) or from config
    this.defaultLimit = config?.defaultLimit || 50;
    
    // 3. Set window duration (1000ms default) or from config
    this.windowMs = config?.windowMs || 1000;
    
    // 4. Set key prefix
    this.keyPrefix = config?.keyPrefix || 'rate:';
  }
  
  async checkLimit(tenantId: string, channel?: string): Promise<RateLimitResult> {
    try {
      // 1. Build all applicable rate limit keys
      const keys = [
        this.buildRateLimitKey(tenantId, 'total'),
        ...(channel ? [this.buildRateLimitKey(tenantId, `channel:${channel}`)] : [])
      ];
      
      const now = Date.now();
      const results: Array<{ allowed: boolean; remaining: number; resetTime: number }> = [];
      
      // 2. Check each limit using token bucket algorithm
      for (const key of keys) {
        const result = await this.redisClient.eval(
          this.tokenBucketScript,
          1,
          key,
          this.defaultLimit.toString(),      // capacity
          this.defaultLimit.toString(),      // refill rate (tokens per window)
          this.windowMs.toString(),          // interval
          '1',                               // requested tokens
          now.toString()                     // current timestamp
        ) as [number, number, number];
        
        const [allowed, remaining, resetTime] = result;
        results.push({
          allowed: allowed === 1,
          remaining,
          resetTime
        });
      }
      
      // 3. Find the most restrictive limit
      const mostRestrictive = results.reduce((prev, curr) => 
        !curr.allowed || curr.remaining < prev.remaining ? curr : prev
      );
      
      // 4. Calculate reset time
      const resetAt = new Date(now + mostRestrictive.resetTime);
      
      // 5. Return result
      return {
        allowed: mostRestrictive.allowed,
        remaining: mostRestrictive.remaining,
        resetAt,
        retryAfter: mostRestrictive.allowed ? undefined : Math.ceil(mostRestrictive.resetTime / 1000)
      };
      
    } catch (error: any) {
      logger.error('Rate limit check failed', {
        error: error.message,
        tenantId,
        channel
      });
      
      // Fail open - allow request if rate limiter fails
      return {
        allowed: true,
        remaining: this.defaultLimit,
        resetAt: new Date(Date.now() + this.windowMs)
      };
    }
  }
  
  async consumeToken(key: string): Promise<void> {
    try {
      const now = Date.now();
      
      // Use the same Lua script but request 1 token
      await this.redisClient.eval(
        this.tokenBucketScript,
        1,
        key,
        this.defaultLimit.toString(),
        this.defaultLimit.toString(),
        this.windowMs.toString(),
        '1',
        now.toString()
      );
      
    } catch (error: any) {
      logger.error('Token consumption failed', {
        error: error.message,
        key
      });
    }
  }
  
  async getRemainingTokens(key: string): Promise<number> {
    try {
      const now = Date.now();
      
      // Check tokens without consuming any (request 0 tokens)
      const result = await this.redisClient.eval(
        this.tokenBucketScript,
        1,
        key,
        this.defaultLimit.toString(),
        this.defaultLimit.toString(),
        this.windowMs.toString(),
        '0',  // Don't consume any tokens
        now.toString()
      ) as [number, number, number];
      
      return result[1]; // remaining tokens
      
    } catch (error: any) {
      logger.error('Failed to get remaining tokens', {
        error: error.message,
        key
      });
      
      // Return max tokens if error
      return this.defaultLimit;
    }
  }
  
  private async refillTokens(key: string, maxTokens: number, windowMs: number): Promise<number> {
    // This logic is now handled by the Lua script for atomic operations
    // Token Bucket Refill Logic:
    // 1. Get current tokens and last refill timestamp from Redis
    // 2. Calculate time elapsed since last refill
    // 3. Calculate tokens to add: (elapsed / windowMs) * maxTokens
    // 4. New tokens = min(currentTokens + tokensToAdd, maxTokens)
    // 5. Update Redis atomically
    // 6. Return new token count
    
    const now = Date.now();
    const result = await this.redisClient.eval(
      this.tokenBucketScript,
      1,
      key,
      maxTokens.toString(),
      maxTokens.toString(),
      windowMs.toString(),
      '0', // Don't consume tokens, just refill
      now.toString()
    ) as [number, number, number];
    
    return result[1];
  }
  
  private buildRateLimitKey(tenantId: string, suffix?: string): string {
    // 1. Start with base: "rate:tenant:{tenantId}"
    let key = `${this.keyPrefix}tenant:${tenantId}`;
    
    // 2. Add suffix if provided: "rate:tenant:{tenantId}:{suffix}"
    if (suffix) {
      key += `:${suffix}`;
    }
    
    // 3. Return formatted key
    return key;
  }
  
  // Additional utility methods
  async resetLimit(tenantId: string, channel?: string): Promise<void> {
    try {
      const keys = [
        this.buildRateLimitKey(tenantId, 'total'),
        ...(channel ? [this.buildRateLimitKey(tenantId, `channel:${channel}`)] : [])
      ];
      
      await this.redisClient.del(...keys);
      
    } catch (error: any) {
      logger.error('Failed to reset rate limit', {
        error: error.message,
        tenantId,
        channel
      });
    }
  }
  
  async getStats(tenantId: string): Promise<RateLimitStats> {
    try {
      const totalKey = this.buildRateLimitKey(tenantId, 'total');
      const remaining = await this.getRemainingTokens(totalKey);
      
      return {
        tenantId,
        totalRemaining: remaining,
        totalLimit: this.defaultLimit,
        windowMs: this.windowMs,
        lastChecked: new Date()
      };
      
    } catch (error: any) {
      logger.error('Failed to get rate limit stats', {
        error: error.message,
        tenantId
      });
      
      return {
        tenantId,
        totalRemaining: this.defaultLimit,
        totalLimit: this.defaultLimit,
        windowMs: this.windowMs,
        lastChecked: new Date()
      };
    }
  }
}