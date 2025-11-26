/**
 * Express server for elevenlabs-agent service
 */
import express, { type Request, type Response, type Application, type Router } from 'express';
import type { Server as HttpServer } from 'http';
import Redis from 'ioredis';
import { logger } from './logger.js';
import { setupWebhookRoutes } from './routes/webhook-routes.js';

/**
 * HTTP Server for elevenlabs-agent API
 */
export class Server {
  public app: Application;
  public port: number;
  public server?: HttpServer;
  public redis?: Redis;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3004', 10);
    this.initializeRedis();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Initialize Redis connection
   */
  private initializeRedis(): void {
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379/0';
    this.redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying after 3 attempts
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', { error: error.message });
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected');
    });

    // Try to connect, but don't fail if it doesn't work
    this.redis.connect().catch((error) => {
      logger.warn('Redis connection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // JSON body parsing
    this.app.use(express.json());

    // Request logging
    this.app.use((req: Request, res: Response, next) => {
      logger.info('HTTP Request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    const router: Router = express.Router();

    // Health check endpoint with Redis connectivity status
    this.app.get('/health', async (req: Request, res: Response) => {
      logger.info('Health check requested', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        service: 'elevenlabs-agent',
      });

      // Check Redis connectivity
      let redisStatus = 'unknown';
      if (this.redis) {
        try {
          const status = this.redis.status;
          if (status === 'ready' || status === 'connect') {
            // Try to ping to verify connection is actually working
            const pingResult = await this.redis.ping();
            redisStatus = pingResult === 'PONG' ? 'connected' : 'disconnected';
          } else {
            redisStatus = 'disconnected';
          }
        } catch (error) {
          redisStatus = 'error';
          logger.warn('Redis health check failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      res.json({
        status: 'ok',
        service: 'elevenlabs-agent',
        redis: redisStatus,
      });
    });

    // Setup webhook routes
    setupWebhookRoutes(router, this.redis);
    this.app.use('/', router);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info('HTTP Server started', {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
        });
        resolve();
      });
    });
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      const shutdownPromises: Promise<void>[] = [];

      // Close HTTP server
      if (this.server) {
        shutdownPromises.push(
          new Promise<void>((serverResolve) => {
            this.server!.close(() => {
              logger.info('HTTP Server stopped');
              serverResolve();
            });
          })
        );
      }

      // Close Redis connection
      if (this.redis) {
        shutdownPromises.push(
          new Promise<void>((redisResolve) => {
            this.redis!.quit().then(() => {
              logger.info('Redis connection closed');
              redisResolve();
            }).catch((error) => {
              logger.warn('Error closing Redis connection', {
                error: error instanceof Error ? error.message : String(error),
              });
              redisResolve();
            });
          })
        );
      }

      // Wait for all shutdown operations to complete
      Promise.all(shutdownPromises).then(() => {
        logger.info('Server shutdown complete');
        resolve();
      });
    });
  }
}

