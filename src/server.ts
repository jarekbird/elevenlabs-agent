/**
 * Express server for elevenlabs-agent service
 */
import express, { type Request, type Response, type Application } from 'express';
import type { Server as HttpServer } from 'http';
import { logger } from './logger.js';

/**
 * HTTP Server for elevenlabs-agent API
 */
export class Server {
  public app: Application;
  public port: number;
  public server?: HttpServer;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3004', 10);
    this.setupMiddleware();
    this.setupRoutes();
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
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      logger.info('Health check requested', {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        service: 'elevenlabs-agent',
      });
      res.json({ status: 'ok', service: 'elevenlabs-agent' });
    });
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
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('HTTP Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

