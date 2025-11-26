/**
 * Express server for elevenlabs-agent service
 */
import { type Application } from 'express';
import type { Server as HttpServer } from 'http';
import Redis from 'ioredis';
/**
 * HTTP Server for elevenlabs-agent API
 */
export declare class Server {
    app: Application;
    port: number;
    server?: HttpServer;
    redis?: Redis;
    constructor();
    /**
     * Initialize Redis connection
     */
    private initializeRedis;
    /**
     * Setup Express middleware
     */
    private setupMiddleware;
    /**
     * Setup API routes
     */
    private setupRoutes;
    /**
     * Start the server
     */
    start(): Promise<void>;
    /**
     * Stop the server gracefully
     */
    stop(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map