/**
 * Express server for elevenlabs-agent service
 */
import express from 'express';
import { logger } from './logger.js';
/**
 * HTTP Server for elevenlabs-agent API
 */
export class Server {
    app;
    port;
    server;
    constructor() {
        this.app = express();
        this.port = parseInt(process.env.PORT || '3004', 10);
        this.setupMiddleware();
        this.setupRoutes();
    }
    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // JSON body parsing
        this.app.use(express.json());
        // Request logging
        this.app.use((req, res, next) => {
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
    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
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
    async start() {
        return new Promise((resolve) => {
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
    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('HTTP Server stopped');
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
}
//# sourceMappingURL=server.js.map