/**
 * Service for communicating with cursor-runner
 */
import { logger } from "../logger.js";

export interface CursorRunnerRequest {
  repository?: string;
  branchName?: string;
  prompt: string;
  conversationId?: string;
  queueType?: "default" | "telegram" | "api";
}

export interface CursorRunnerResponse {
  success: boolean;
  requestId: string;
  output?: string;
  error?: string;
  timestamp: string;
}

export class CursorRunnerService {
  private cursorRunnerUrl: string;

  constructor() {
    this.cursorRunnerUrl =
      process.env.CURSOR_RUNNER_URL || "http://cursor-runner:3001";
  }

  /**
   * Execute a cursor-runner command asynchronously
   */
  async executeAsync(
    request: CursorRunnerRequest,
    callbackUrl: string,
  ): Promise<CursorRunnerResponse> {
    try {
      logger.info("Sending request to cursor-runner", {
        conversationId: request.conversationId,
        callbackUrl,
      });

      const response = await fetch(
        `${this.cursorRunnerUrl}/cursor/execute/async`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...request,
            callbackUrl,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Cursor-runner request failed: ${response.status} - ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        success?: boolean;
        requestId?: string;
        timestamp?: string;
      };
      return {
        success: data.success || false,
        requestId: data.requestId || `req-${Date.now()}`,
        timestamp: data.timestamp || new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Failed to execute cursor-runner request", {
        error: errorMessage,
        request,
      });

      throw error;
    }
  }

  /**
   * Execute a cursor-runner command synchronously
   */
  async executeSync(
    request: CursorRunnerRequest,
  ): Promise<CursorRunnerResponse> {
    try {
      logger.info("Sending synchronous request to cursor-runner", {
        conversationId: request.conversationId,
      });

      const response = await fetch(`${this.cursorRunnerUrl}/cursor/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Cursor-runner request failed: ${response.status} - ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        success?: boolean;
        requestId?: string;
        output?: string;
        error?: string;
        timestamp?: string;
      };
      return {
        success: data.success || false,
        requestId: data.requestId || `req-${Date.now()}`,
        output: data.output,
        error: data.error,
        timestamp: data.timestamp || new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Failed to execute cursor-runner request", {
        error: errorMessage,
        request,
      });

      throw error;
    }
  }
}
