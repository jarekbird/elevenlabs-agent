/**
 * elevenlabs-agent - Main entry point
 *
 * Node.js service for ElevenLabs agent integration with cursor-runner.
 * Handles webhooks from ElevenLabs, manages sessions, and coordinates with cursor-runner.
 */

import dotenv from "dotenv";
import { Server } from "./server.js";
import { logger } from "./logger.js";

// Load environment variables
dotenv.config();

/**
 * Main application class
 */
class ElevenLabsAgent {
  public server: Server;

  constructor() {
    this.server = new Server();
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    try {
      logger.info("Initializing elevenlabs-agent...");

      // Validate configuration
      this.validateConfig();

      // Start HTTP server
      await this.server.start();

      logger.info("elevenlabs-agent initialized successfully", {
        port: this.server.port,
        endpoints: [
          "GET /health",
          "GET /signed-url",
          "POST /agent-tools",
          "POST /callback",
        ],
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Failed to initialize elevenlabs-agent", {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Shutdown the application gracefully
   */
  async shutdown(): Promise<void> {
    try {
      logger.info("Shutting down elevenlabs-agent...");
      await this.server.stop();
      logger.info("elevenlabs-agent shut down successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error during shutdown", { error: errorMessage });
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(): void {
    // No required env vars for now - all have defaults
    // ELEVENLABS_AGENT_ENABLED defaults to false
    logger.info("Configuration validated");
  }
}

// Run as CLI if executed directly
if (
  import.meta.url === `file://${process.argv[1]}` &&
  !process.env.JEST_WORKER_ID
) {
  const app = new ElevenLabsAgent();

  // Handle graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM signal");
    await app.shutdown();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("Received SIGINT signal");
    await app.shutdown();
    process.exit(0);
  });

  app.initialize().catch((error) => {
    console.error("Failed to start elevenlabs-agent:", error);
    logger.error("Failed to start elevenlabs-agent", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export { ElevenLabsAgent };
