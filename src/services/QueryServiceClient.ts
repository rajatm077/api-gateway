// Query Service Client - handles all read operations via HTTP API

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';
import {
  QueryServiceConfig,
  QueryServiceConversation,
  QueryServiceMessage,
  QueryServiceMessageEvent,
  QueryServiceConversationListResponse,
  QueryServiceMessageListResponse,
  ConversationListFilters,
  MessageListFilters,
  IQueryServiceClient,
  QueryServiceError,
  QueryServiceTimeoutError,
  QueryServiceNotFoundError,
  QueryServiceUnavailableError
} from '../types/queryService';

export class QueryServiceClient implements IQueryServiceClient {
  private axiosInstance: AxiosInstance;
  private config: QueryServiceConfig;

  constructor(config: QueryServiceConfig) {
    this.config = config;
    
    // Create axios instance with default configuration
    this.axiosInstance = axios.create({
      baseURL: config.url,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'api-gateway/1.0.0'
      }
    });

    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug('Query Service request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: config.headers,
          timeout: config.timeout
        });
        return config;
      },
      (error) => {
        logger.error('Query Service request setup failed', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug('Query Service response', {
          status: response.status,
          url: response.config.url,
          responseTime: response.headers['x-response-time']
        });
        return response;
      },
      (error) => {
        this.handleAxiosError(error);
        return Promise.reject(error);
      }
    );
  }

  private handleAxiosError(error: AxiosError): never {
    const request = error.config;
    const response = error.response;

    logger.error('Query Service error', {
      method: request?.method?.toUpperCase(),
      url: request?.url,
      status: response?.status,
      statusText: response?.statusText,
      message: error.message,
      code: error.code
    });

    // Handle different types of errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new QueryServiceTimeoutError(this.config.timeout);
    }

    if (!response) {
      // Network error or service unavailable
      throw new QueryServiceUnavailableError(error);
    }

    switch (response.status) {
      case 404:
        throw new QueryServiceNotFoundError(
          this.extractResourceFromUrl(request?.url || ''),
          this.extractIdFromUrl(request?.url || '')
        );
      case 500:
      case 502:
      case 503:
      case 504:
        throw new QueryServiceUnavailableError(error);
      default:
        throw new QueryServiceError(
          `Query Service error: ${response.statusText}`,
          response.status,
          error
        );
    }
  }

  private extractResourceFromUrl(url: string): string {
    const matches = url.match(/\/([a-zA-Z]+)\/[^\/]+$/);
    return matches ? matches[1] : 'resource';
  }

  private extractIdFromUrl(url: string): string {
    const matches = url.match(/\/([^\/]+)$/);
    return matches ? matches[1] : 'unknown';
  }

  private createTenantHeaders(tenantId: string): Record<string, string> {
    return {
      'x-tenant-id': tenantId
    };
  }

  private async retryRequest<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.retries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on 4xx errors (client errors)
        if (error instanceof QueryServiceError && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        if (attempt <= this.config.retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          logger.warn(`${operationName} attempt ${attempt} failed, retrying in ${delay}ms`, {
            error: lastError.message,
            attempt,
            maxRetries: this.config.retries
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`${operationName} failed after ${this.config.retries + 1} attempts`, {
      error: lastError!.message
    });
    throw lastError!;
  }

  async getConversation(conversationId: string, tenantId: string): Promise<QueryServiceConversation> {
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<QueryServiceConversation>(
        `/conversations/${conversationId}`,
        {
          headers: this.createTenantHeaders(tenantId)
        }
      );
      return response.data;
    }, 'getConversation');
  }

  async getMessage(messageId: string, tenantId: string): Promise<QueryServiceMessage> {
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<QueryServiceMessage>(
        `/messages/${messageId}`,
        {
          headers: this.createTenantHeaders(tenantId)
        }
      );
      return response.data;
    }, 'getMessage');
  }

  async getMessageEvents(messageId: string, tenantId: string): Promise<QueryServiceMessageEvent[]> {
    return this.retryRequest(async () => {
      const response = await this.axiosInstance.get<QueryServiceMessageEvent[]>(
        `/messages/${messageId}/events`,
        {
          headers: this.createTenantHeaders(tenantId)
        }
      );
      return response.data;
    }, 'getMessageEvents');
  }

  async listConversations(
    tenantId: string, 
    filters?: ConversationListFilters
  ): Promise<QueryServiceConversationListResponse> {
    return this.retryRequest(async () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              value.forEach(item => params.append(key, item.toString()));
            } else {
              params.append(key, value.toString());
            }
          }
        });
      }

      const response = await this.axiosInstance.get<QueryServiceConversationListResponse>(
        '/conversations',
        {
          headers: this.createTenantHeaders(tenantId),
          params
        }
      );
      return response.data;
    }, 'listConversations');
  }

  async getConversationMessages(
    conversationId: string,
    tenantId: string,
    filters?: MessageListFilters
  ): Promise<QueryServiceMessageListResponse> {
    return this.retryRequest(async () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, value.toString());
          }
        });
      }

      const response = await this.axiosInstance.get<QueryServiceMessageListResponse>(
        `/conversations/${conversationId}/messages`,
        {
          headers: this.createTenantHeaders(tenantId),
          params
        }
      );
      return response.data;
    }, 'getConversationMessages');
  }

  async healthCheck(): Promise<{ status: string; version?: string; uptime?: number }> {
    try {
      const response = await this.axiosInstance.get('/health', {
        timeout: 2000 // Shorter timeout for health checks
      });
      return response.data;
    } catch (error) {
      logger.warn('Query Service health check failed', { error: (error as Error).message });
      throw new QueryServiceUnavailableError(error);
    }
  }

  // Utility method to check if service is available
  async isHealthy(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }
}
