/**
 * Configuration routes for ElevenLabs agent
 */
import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';

/**
 * Setup configuration routes
 */
export function setupConfigRoutes(router: Router): void {
  /**
   * GET /config
   * Get current agent configuration (non-sensitive information)
   */
  router.get('/config', (req: Request, res: Response) => {
    try {
      const config = {
        agentId: process.env.ELEVENLABS_AGENT_ID || null,
        agentUrl: process.env.ELEVENLABS_AGENT_URL || 'http://elevenlabs-agent:3004',
        cursorRunnerUrl: process.env.CURSOR_RUNNER_URL || 'http://cursor-runner:3001',
        webhookSecretConfigured: !!process.env.WEBHOOK_SECRET,
        redisUrl: process.env.REDIS_URL ? 'configured' : 'not configured',
        // Don't expose sensitive values
        hasApiKey: !!process.env.ELEVENLABS_API_KEY,
      };

      logger.info('Configuration requested', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        success: true,
        config,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get configuration', {
        error: err.message,
        stack: err.stack,
      });

      res.status(500).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /config/health
   * Get health status of all dependencies
   */
  router.get('/config/health', async (req: Request, res: Response) => {
    try {
      const health = {
        service: 'elevenlabs-agent',
        status: 'ok',
        dependencies: {
          redis: 'unknown',
          cursorRunner: 'unknown',
        },
        timestamp: new Date().toISOString(),
      };

      // Check Redis connection
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379/0', {
          lazyConnect: true,
          enableOfflineQueue: false,
        });
        await redis.connect();
        await redis.ping();
        health.dependencies.redis = 'connected';
        await redis.quit();
      } catch (error) {
        health.dependencies.redis = 'disconnected';
        logger.warn('Redis health check failed', {
          error: (error as Error).message,
        });
      }

      // Check cursor-runner connection
      try {
        const cursorRunnerUrl = process.env.CURSOR_RUNNER_URL || 'http://cursor-runner:3001';
        const response = await fetch(`${cursorRunnerUrl}/health`);
        if (response.ok) {
          health.dependencies.cursorRunner = 'connected';
        } else {
          health.dependencies.cursorRunner = 'unhealthy';
        }
      } catch (error) {
        health.dependencies.cursorRunner = 'disconnected';
        logger.warn('Cursor-runner health check failed', {
          error: (error as Error).message,
        });
      }

      // Overall status
      if (
        health.dependencies.redis === 'disconnected' ||
        health.dependencies.cursorRunner === 'disconnected'
      ) {
        health.status = 'degraded';
      }

      res.json(health);
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get health status', {
        error: err.message,
        stack: err.stack,
      });

      res.status(500).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

