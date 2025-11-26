/**
 * Service for managing agent sessions in Redis
 */
import Redis from 'ioredis';
import { logger } from '../logger.js';

export interface AgentSession {
  sessionId: string;
  agentId: string;
  conversationId?: string;
  createdAt: string;
  lastAccessedAt: string;
  metadata?: Record<string, unknown>;
}

export class SessionService {
  private redis: Redis;
  private readonly SESSION_PREFIX = 'elevenlabs:session:';
  private readonly SESSION_TTL = 3600; // 1 hour in seconds
  private redisAvailable: boolean = false;

  constructor(redis: Redis) {
    this.redis = redis;

    this.redis.on('error', (error) => {
      logger.error('Redis connection error in SessionService', { error: error.message });
      this.redisAvailable = false;
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected for session storage');
      this.redisAvailable = true;
    });
  }

  /**
   * Create or update a session
   */
  async createOrUpdateSession(session: AgentSession): Promise<void> {
    if (!this.redisAvailable) {
      logger.warn('Redis not available, skipping session storage');
      return;
    }

    try {
      const key = `${this.SESSION_PREFIX}${session.sessionId}`;
      const value = JSON.stringify({
        ...session,
        lastAccessedAt: new Date().toISOString(),
      });

      await this.redis.setex(key, this.SESSION_TTL, value);
      logger.debug('Session created/updated', { sessionId: session.sessionId });
    } catch (error) {
      logger.error('Failed to create/update session', {
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      this.redisAvailable = false;
    }
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<AgentSession | null> {
    if (!this.redisAvailable) {
      return null;
    }

    try {
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      const value = await this.redis.get(key);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as AgentSession;
    } catch (error) {
      logger.error('Failed to get session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.redisAvailable) {
      return;
    }

    try {
      const key = `${this.SESSION_PREFIX}${sessionId}`;
      await this.redis.del(key);
      logger.debug('Session deleted', { sessionId });
    } catch (error) {
      logger.error('Failed to delete session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Update session's conversation ID
   */
  async updateSessionConversation(
    sessionId: string,
    conversationId: string
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.conversationId = conversationId;
      await this.createOrUpdateSession(session);
    }
  }

  /**
   * List all sessions for an agent
   */
  async listAgentSessions(agentId: string): Promise<AgentSession[]> {
    if (!this.redisAvailable) {
      return [];
    }

    try {
      const pattern = `${this.SESSION_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      const sessions: AgentSession[] = [];

      for (const key of keys) {
        const value = await this.redis.get(key);
        if (value) {
          const session = JSON.parse(value) as AgentSession;
          if (session.agentId === agentId) {
            sessions.push(session);
          }
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Failed to list agent sessions', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

