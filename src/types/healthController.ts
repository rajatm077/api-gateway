// Health controller types

export interface HealthCheckResponse {
  success: boolean;
  data: {
    status: string;
    service: string;
    version: string;
    uptime: number;
    timestamp: string;
    environment: string;
    nodeVersion: string;
  };
}

export interface LivenessProbeResponse {
  status: 'alive' | 'error';
  timestamp: string;
  uptime: number;
  error?: string;
}

export interface ReadinessProbeResponse {
  status: 'ready' | 'not ready' | 'error';
  checks?: {
    redis: boolean;
    kafka: boolean;
    serviceRegistry: boolean;
  };
  responseTime?: number;
  timestamp: string;
  message?: string;
}

export interface SystemMetrics {
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  platform: string;
  nodeVersion: string;
}

export interface DependencyStatus {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
  version?: string;
  ping?: string;
  isConnected?: boolean;
}

export interface DeepHealthCheckResponse {
  success: boolean;
  data?: {
    service: string;
    version: string;
    timestamp: string;
    uptime: number;
    dependencies: {
      redis: DependencyStatus;
      kafka: DependencyStatus;
    };
    system: SystemMetrics;
    status: 'healthy' | 'unhealthy';
    totalResponseTime: number;
  };
  error?: string;
  message?: string;
}
