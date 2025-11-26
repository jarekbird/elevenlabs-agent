/**
 * elevenlabs-agent - Main entry point
 *
 * Node.js service for ElevenLabs agent integration with cursor-runner.
 * Handles webhooks from ElevenLabs, manages sessions, and coordinates with cursor-runner.
 */
import { Server } from './server.js';
/**
 * Main application class
 */
declare class ElevenLabsAgent {
    server: Server;
    constructor();
    /**
     * Initialize the application
     */
    initialize(): Promise<void>;
    /**
     * Shutdown the application gracefully
     */
    shutdown(): Promise<void>;
    /**
     * Validate configuration
     */
    validateConfig(): void;
}
export { ElevenLabsAgent };
//# sourceMappingURL=index.d.ts.map