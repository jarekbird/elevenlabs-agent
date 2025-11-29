/**
 * ElevenLabs API Client
 * Handles communication with ElevenLabs API for signed URLs and agent management
 */

import { logger } from "../logger.js";

export interface SignedUrlResponse {
  signedUrl: string;
  expiresAt?: string;
}

export interface ElevenLabsApiError {
  message: string;
  status?: number;
  code?: string;
}

export class ElevenLabsApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string = "https://api.elevenlabs.io/v1";

  constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      logger.warn("ELEVENLABS_API_KEY not set - signed URL requests will fail");
    }
    this.apiKey = apiKey || "";
  }

  /**
   * Get a signed URL for connecting to an ElevenLabs agent
   * @param agentId - Optional agent ID (uses default if not provided)
   * @returns Promise resolving to signed URL and expiration
   * @throws Error if API request fails
   */
  async getSignedUrl(agentId?: string): Promise<SignedUrlResponse> {
    if (!this.apiKey) {
      throw new Error("ELEVENLABS_API_KEY is required for signed URL requests");
    }

    // Try the conversation endpoint first (newer API)
    // If that fails, fall back to agents endpoint
    const url = agentId
      ? `${this.baseUrl}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`
      : `${this.baseUrl}/convai/conversation/get-signed-url`;

    logger.info("Requesting signed URL from ElevenLabs", {
      agentId: agentId || "default",
      url,
    });

    // Create AbortController for timeout
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(
      () => controller.abort(),
      30000,
    ); // 30 second timeout

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => response.statusText);
        logger.error("ElevenLabs API error", {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          agentId: agentId || "default",
        });

        let errorMessage = `ElevenLabs API error: ${response.status} ${response.statusText}`;

        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            // Handle different error response formats from ElevenLabs
            if (errorData.detail) {
              errorMessage = `ElevenLabs API error: ${errorData.detail} (${response.status})`;
            } else if (errorData.message) {
              errorMessage = `ElevenLabs API error: ${errorData.message} (${response.status})`;
            } else {
              errorMessage = `ElevenLabs API error: ${JSON.stringify(errorData)} (${response.status})`;
            }
          } catch {
            // If parsing fails, use the text as message
            errorMessage = `ElevenLabs API error: ${errorText} (${response.status})`;
          }
        }

        // Create an Error instance with the message so it serializes properly
        const error = new Error(errorMessage) as Error & {
          status?: number;
          code?: string;
        };
        error.status = response.status;

        throw error;
      }

      const data = (await response.json()) as Record<string, unknown>;

      // Validate response structure
      if (!data.signed_url && !data.signedUrl) {
        throw new Error(
          "Invalid response from ElevenLabs API: missing signed_url",
        );
      }

      const signedUrl = (data.signed_url || data.signedUrl) as string;
      const expiresAt = (data.expires_at || data.expiresAt) as
        | string
        | undefined;

      logger.info("Signed URL obtained from ElevenLabs", {
        agentId: agentId || "default",
        expiresAt,
      });

      return {
        signedUrl,
        expiresAt,
      };
    } catch (error) {
      // Clear timeout if it hasn't fired yet
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("aborted"))
      ) {
        logger.error("ElevenLabs API request timeout", {
          agentId: agentId || "default",
        });
        throw new Error("Request to ElevenLabs API timed out");
      }

      // Check if it's an Error with status property (ElevenLabsApiError)
      if (error instanceof Error && "status" in error) {
        // Re-throw with proper message
        const apiError = error as Error & { status?: number; code?: string };
        logger.error("Failed to get signed URL from ElevenLabs", {
          agentId: agentId || "default",
          error: apiError.message,
          status: apiError.status,
          code: apiError.code,
        });
        throw apiError;
      }

      logger.error("Failed to get signed URL from ElevenLabs", {
        agentId: agentId || "default",
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Failed to get signed URL: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}
