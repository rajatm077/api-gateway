import { Kafka, Producer, Message, ProducerRecord } from 'kafkajs';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { MessagePayload, KafkaConfig, RetryConfig } from '../types/kafkaProducerService';

export class KafkaProducerService {
  private producer: Producer;
  private isConnected: boolean;
  private retryConfig: RetryConfig;
  private kafka: Kafka;
  
  constructor(kafkaConfig: KafkaConfig) {
    // 1. Create Kafka client with configuration
    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
      ...(kafkaConfig.ssl && { ssl: true }),
      ...(kafkaConfig.sasl && { 
        sasl: {
          mechanism: kafkaConfig.sasl.mechanism as any,
          username: kafkaConfig.sasl.username,
          password: kafkaConfig.sasl.password
        }
      }),
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });
    
    // 2. Create producer instance with options
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true,
      maxInFlightRequests: 1,
      transactionTimeout: 30000
    });
    
    // 3. Set retry configuration
    this.retryConfig = {
      maxRetries: 3,
      initialRetryTime: 100,
      backoffFactor: 2
    };
    
    // 4. Initialize connection flag as false
    this.isConnected = false;
    
    // 5. Setup producer event listeners
    this.producer.on('producer.connect', () => {
      logger.info('Kafka producer connected');
      this.isConnected = true;
    });
    
    this.producer.on('producer.disconnect', () => {
      logger.warn('Kafka producer disconnected');
      this.isConnected = false;
    });
    
    this.producer.on('producer.network.request_timeout', (payload) => {
      logger.error('Kafka producer request timeout', { payload });
    });
  }
  
  async connect(): Promise<void> {
    try {
      // 1. Check if already connected
      if (this.isConnected) {
        logger.warn('Kafka producer already connected');
        return;
      }
      
      // 2. Call producer.connect()
      await this.producer.connect();
      
      // 3. Set isConnected flag to true
      this.isConnected = true;
      
      // 4. Log successful connection
      logger.info('Kafka producer connected successfully');
      
    } catch (error: any) {
      // 5. Handle connection errors
      logger.error('Failed to connect Kafka producer', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  async publishMessage(topic: string, message: MessagePayload): Promise<void> {
    // 1. Validate connection status
    if (!this.isConnected) {
      throw new Error('Kafka producer not connected');
    }
    
    try {
      // 2. Prepare Kafka message
      const kafkaMessage: Message = {
        key: this.determinePartitionKey(message),
        value: JSON.stringify(message),
        headers: {
          'correlation-id': message.correlationId,
          'tenant-id': message.tenantId,
          'timestamp': Date.now().toString(),
          'message-id': message.messageId
        }
      };
      
      const record: ProducerRecord = {
        topic,
        messages: [kafkaMessage]
      };
      
      // 3. Send message with producer.send()
      const result = await this.producer.send(record);
      
      // 4. Handle success
      logger.info('Message published successfully', {
        messageId: message.messageId,
        topic,
        partition: result[0].partition,
        offset: result[0].offset
      });
      
    } catch (error: any) {
      // 5. Handle failure
      logger.error('Failed to publish message', {
        error: error.message,
        messageId: message.messageId,
        topic,
        tenantId: message.tenantId
      });
      throw error;
    }
  }
  
  async publishBatch(topic: string, messages: MessagePayload[]): Promise<void> {
    // 1. Validate connection and messages array
    if (!this.isConnected) {
      throw new Error('Kafka producer not connected');
    }
    
    if (!messages || messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }
    
    try {
      // 2. Prepare batch for Kafka
      const kafkaMessages: Message[] = messages.map(message => ({
        key: this.determinePartitionKey(message),
        value: JSON.stringify(message),
        headers: {
          'correlation-id': message.correlationId,
          'tenant-id': message.tenantId,
          'timestamp': Date.now().toString(),
          'message-id': message.messageId
        }
      }));
      
      const record: ProducerRecord = {
        topic,
        messages: kafkaMessages
      };
      
      // 3. Send batch with producer.sendBatch()
      const results = await this.producer.send(record);
      
      // 6. Log batch completion statistics
      logger.info('Batch published successfully', {
        topic,
        messageCount: messages.length,
        partitions: results.map(r => ({ partition: r.partition, offset: r.offset }))
      });
      
    } catch (error: any) {
      logger.error('Failed to publish batch', {
        error: error.message,
        topic,
        messageCount: messages.length
      });
      throw error;
    }
  }
  
  async publishWithRetry(topic: string, message: MessagePayload, retries: number = 3): Promise<void> {
    let lastError: Error | null = null;
    
    // 1. Set retry attempt counter
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // 2. Try publishing message
        await this.publishMessage(topic, message);
        return; // Success, exit retry loop
        
      } catch (error: any) {
        lastError = error;
        
        // If this was the last attempt, break
        if (attempt === retries) {
          break;
        }
        
        // Calculate exponential backoff delay
        const delay = this.retryConfig.initialRetryTime * Math.pow(this.retryConfig.backoffFactor, attempt);
        
        logger.warn('Message publish failed, retrying', {
          messageId: message.messageId,
          topic,
          attempt: attempt + 1,
          retryDelay: delay,
          error: error.message
        });
        
        // Wait before retry
        await this.sleep(delay);
      }
    }
    
    // 3. After all retries exhausted
    if (lastError) {
      logger.error('Message publish failed after all retries', {
        messageId: message.messageId,
        topic,
        attempts: retries + 1,
        finalError: lastError.message
      });
      
      // Send to DLQ
      await this.sendToDeadLetterQueue(message, lastError);
      
      throw lastError;
    }
  }
  
  async disconnect(): Promise<void> {
    try {
      // 1. Check if connected
      if (!this.isConnected) {
        logger.warn('Kafka producer already disconnected');
        return;
      }
      
      // 2. Call producer.disconnect()
      await this.producer.disconnect();
      
      // 3. Set isConnected to false
      this.isConnected = false;
      
      // 4. Log disconnection
      logger.info('Kafka producer disconnected successfully');
      
    } catch (error: any) {
      logger.error('Error disconnecting Kafka producer', {
        error: error.message
      });
      throw error;
    }
  }
  
  private async sendToDeadLetterQueue(message: MessagePayload, error: Error): Promise<void> {
    try {
      // 1. Create DLQ message with error details
      const dlqMessage = {
        originalMessage: message,
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        },
        attempts: this.retryConfig.maxRetries + 1,
        dlqId: uuidv4()
      };
      
      // 2. Publish to DLQ topic
      const dlqRecord: ProducerRecord = {
        topic: 'dead-letter-queue',
        messages: [{
          key: message.messageId,
          value: JSON.stringify(dlqMessage),
          headers: {
            'original-topic': message.correlationId,
            'tenant-id': message.tenantId,
            'error-type': error.constructor.name,
            'dlq-timestamp': Date.now().toString()
          }
        }]
      };
      
      await this.producer.send(dlqRecord);
      
      // 3. Log DLQ entry for monitoring
      logger.error('Message sent to dead letter queue', {
        messageId: message.messageId,
        dlqId: dlqMessage.dlqId,
        originalError: error.message
      });
      
    } catch (dlqError: any) {
      // 4. Don't retry DLQ messages
      logger.error('Failed to send message to DLQ', {
        messageId: message.messageId,
        dlqError: dlqError.message,
        originalError: error.message
      });
    }
  }
  
  private determinePartitionKey(message: MessagePayload): string {
    // 1. Priority order for partition key
    if (message.conversationId) {
      return message.conversationId; // Maintains conversation ordering
    }
    
    if (message.tenantId && message.channel) {
      return `${message.tenantId}:${message.channel}`; // Tenant + channel isolation
    }
    
    return message.messageId; // Fallback
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Utility methods
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
  
  async getTopicMetadata(topic: string): Promise<any> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
      await admin.disconnect();
      return metadata;
    } catch (error: any) {
      logger.error('Failed to fetch topic metadata', {
        topic,
        error: error.message
      });
      throw error;
    }
  }
  
  async isHealthy(): Promise<boolean> {
    try {
      // Check if producer is connected and functional
      if (!this.isConnected || !this.producer) {
        return false;
      }
      
      // Try to get metadata as a health check
      const admin = this.kafka.admin();
      await admin.connect();
      
      // Get cluster metadata - this is a lightweight operation
      const metadata = await admin.describeCluster();
      await admin.disconnect();
      
      // If we can get metadata, Kafka is healthy
      return metadata.brokers.length > 0;
    } catch (error: any) {
      logger.debug('Kafka health check failed', {
        error: error.message,
        isConnected: this.isConnected
      });
      return false;
    }
  }
}