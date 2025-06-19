import { EventEmitter } from 'events';
import os from 'os';
import { logger } from '../utils/logger';
import { SessionManager } from './sessionManager';
import { SessionHistoryManager } from '../database/sessionHistory';

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  sessions: {
    active: number;
    byUser: Map<string, number>;
  };
  database: {
    healthy: boolean;
    size?: number;
  };
}

export class SystemMonitor extends EventEmitter {
  private sessionManager: SessionManager;
  private sessionHistoryManager: SessionHistoryManager;
  private monitoringInterval?: NodeJS.Timeout;
  private metricsHistory: SystemMetrics[] = [];
  private readonly MAX_HISTORY_SIZE = 100;

  constructor(
    sessionManager: SessionManager,
    sessionHistoryManager: SessionHistoryManager
  ) {
    super();
    this.sessionManager = sessionManager;
    this.sessionHistoryManager = sessionHistoryManager;
  }

  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    logger.info(`Starting system monitoring with ${intervalMs}ms interval`);
    
    // Initial metrics collection
    this.collectMetrics();

    // Set up periodic collection
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      logger.info('System monitoring stopped');
    }
  }

  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.gatherMetrics();
      
      // Store in history
      this.metricsHistory.push(metrics);
      if (this.metricsHistory.length > this.MAX_HISTORY_SIZE) {
        this.metricsHistory.shift();
      }

      // Emit metrics event
      this.emit('metrics', metrics);

      // Check for anomalies
      this.checkAnomalies(metrics);
    } catch (error: any) {
      logger.error(`Failed to collect metrics: ${error.message}`);
    }
  }

  private async gatherMetrics(): Promise<SystemMetrics> {
    const cpuUsage = this.getCPUUsage();
    const memoryInfo = this.getMemoryInfo();
    const sessionInfo = this.getSessionInfo();
    const dbHealth = await this.getDatabaseHealth();

    return {
      timestamp: new Date(),
      cpu: {
        usage: cpuUsage,
        loadAverage: os.loadavg()
      },
      memory: memoryInfo,
      sessions: sessionInfo,
      database: dbHealth
    };
  }

  private getCPUUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);

    return usage;
  }

  private getMemoryInfo() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percentage: (usedMem / totalMem) * 100
    };
  }

  private getSessionInfo() {
    const activeSessions = this.sessionManager.getActiveSessions();
    const byUser = new Map<string, number>();

    activeSessions.forEach(session => {
      const count = byUser.get(session.userId) || 0;
      byUser.set(session.userId, count + 1);
    });

    return {
      active: activeSessions.length,
      byUser
    };
  }

  private async getDatabaseHealth() {
    try {
      const healthy = await this.sessionHistoryManager.healthCheck();
      return { healthy };
    } catch (error: any) {
      logger.error(`Database health check failed: ${error.message}`);
      return { healthy: false };
    }
  }

  private checkAnomalies(metrics: SystemMetrics): void {
    // Check CPU usage
    if (metrics.cpu.usage > 90) {
      logger.warn(`High CPU usage detected: ${metrics.cpu.usage}%`);
      this.emit('anomaly', { type: 'high_cpu', value: metrics.cpu.usage });
    }

    // Check memory usage
    if (metrics.memory.percentage > 85) {
      logger.warn(`High memory usage detected: ${metrics.memory.percentage.toFixed(2)}%`);
      this.emit('anomaly', { type: 'high_memory', value: metrics.memory.percentage });
    }

    // Check database health
    if (!metrics.database.healthy) {
      logger.error('Database health check failed');
      this.emit('anomaly', { type: 'database_unhealthy' });
    }

    // Check for too many sessions
    if (metrics.sessions.active > 100) {
      logger.warn(`High number of active sessions: ${metrics.sessions.active}`);
      this.emit('anomaly', { type: 'high_session_count', value: metrics.sessions.active });
    }
  }

  getLatestMetrics(): SystemMetrics | undefined {
    return this.metricsHistory[this.metricsHistory.length - 1];
  }

  getMetricsHistory(): SystemMetrics[] {
    return [...this.metricsHistory];
  }

  // Get average metrics over a time period
  getAverageMetrics(minutes: number = 5): Partial<SystemMetrics> | null {
    const now = Date.now();
    const cutoff = now - (minutes * 60 * 1000);
    
    const relevantMetrics = this.metricsHistory.filter(m => 
      m.timestamp.getTime() >= cutoff
    );

    if (relevantMetrics.length === 0) {
      return null;
    }

    const avgCpu = relevantMetrics.reduce((sum, m) => sum + m.cpu.usage, 0) / relevantMetrics.length;
    const avgMemory = relevantMetrics.reduce((sum, m) => sum + m.memory.percentage, 0) / relevantMetrics.length;
    const avgSessions = relevantMetrics.reduce((sum, m) => sum + m.sessions.active, 0) / relevantMetrics.length;

    return {
      cpu: {
        usage: avgCpu,
        loadAverage: os.loadavg()
      },
      memory: {
        total: os.totalmem(),
        used: os.totalmem() - os.freemem(),
        free: os.freemem(),
        percentage: avgMemory
      },
      sessions: {
        active: Math.round(avgSessions),
        byUser: new Map()
      }
    };
  }
}