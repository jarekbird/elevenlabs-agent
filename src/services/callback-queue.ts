/**
 * Callback Queue Service
 * Manages callback tasks for async cursor-runner operations
 * Stores tasks in Redis with key pattern: cursor_task:{taskId}
 */

import Redis from "ioredis";
import { logger } from "../logger.js";

export interface CallbackTask {
  conversationId: string;
  sessionPayload: unknown; // Raw push-capable payload from ElevenLabs
  wsUrl: string;
  pending: boolean;
  createdAt: string;
  completedAt?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  taskId: string;
  requestId?: string;
  result?: unknown;
  error?: string;
}

export class CallbackQueueService {
  private redis: Redis;
  private readonly TTL = 86400; // 24 hours in seconds
  private readonly KEY_PREFIX = "cursor_task:";

  constructor(redisClient?: Redis) {
    if (redisClient) {
      this.redis = redisClient;
    } else {
      const redisUrl = process.env.REDIS_URL || "redis://redis:6379/0";
      this.redis = new Redis(redisUrl, {
        retryStrategy: (times) => {
          if (times > 3) {
            return null;
          }
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      this.redis.on("error", (error) => {
        logger.error("Redis connection error in CallbackQueueService", {
          error: error.message,
        });
      });

      this.redis.on("connect", () => {
        logger.info("Redis connected for callback queue");
      });

      this.redis.connect().catch((error) => {
        logger.warn("Redis connection failed for callback queue", {
          error: error.message,
        });
      });
    }
  }

  /**
   * Create a new callback task
   */
  async createTask(
    task: Omit<CallbackTask, "createdAt" | "pending">,
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}${task.taskId}`;
    const callbackTask: CallbackTask = {
      ...task,
      pending: true,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.redis.setex(key, this.TTL, JSON.stringify(callbackTask));
      logger.info("Callback task created", {
        taskId: task.taskId,
        conversationId: task.conversationId,
      });
    } catch (error) {
      logger.error("Failed to create callback task", {
        taskId: task.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get a callback task by taskId
   */
  async getTask(taskId: string): Promise<CallbackTask | null> {
    const key = `${this.KEY_PREFIX}${taskId}`;

    try {
      const data = await this.redis.get(key);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as CallbackTask;
    } catch (error) {
      logger.error("Failed to get callback task", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update a callback task (mark as completed, add result, etc.)
   * This is race-condition safe - uses Redis SETEX to update atomically
   */
  async updateTask(
    taskId: string,
    updates: Partial<
      Pick<CallbackTask, "pending" | "completedAt" | "result" | "error">
    >,
  ): Promise<void> {
    const key = `${this.KEY_PREFIX}${taskId}`;

    try {
      const existing = await this.getTask(taskId);
      if (!existing) {
        logger.warn("Attempted to update non-existent callback task", {
          taskId,
        });
        return;
      }

      const updated: CallbackTask = {
        ...existing,
        ...updates,
      };

      // Get remaining TTL to preserve expiration
      const ttl = await this.redis.ttl(key);
      const expiration = ttl > 0 ? ttl : this.TTL;

      await this.redis.setex(key, expiration, JSON.stringify(updated));

      logger.info("Callback task updated", { taskId, updates });
    } catch (error) {
      logger.error("Failed to update callback task", {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Mark a task as completed
   */
  async markCompleted(
    taskId: string,
    result?: unknown,
    error?: string,
  ): Promise<void> {
    await this.updateTask(taskId, {
      pending: false,
      completedAt: new Date().toISOString(),
      result,
      error,
    });
  }

  /**
   * Shutdown and close Redis connection
   */
  async shutdown(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info("CallbackQueueService Redis connection closed");
    } catch (error) {
      logger.error("Error closing CallbackQueueService Redis connection", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
