import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { ElevenLabsApiClient } from "../src/services/elevenlabs-api";

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch as any;

describe("ElevenLabsApiClient", () => {
  const originalEnv = process.env.ELEVENLABS_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ELEVENLABS_API_KEY = "test-api-key";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ELEVENLABS_API_KEY = originalEnv;
    } else {
      delete process.env.ELEVENLABS_API_KEY;
    }
  });

  describe("getSignedUrl", () => {
    it("requests signed URL for default agent", async () => {
      const mockResponse = {
        signed_url: "wss://example.com/signed-url",
        expires_at: "2025-01-01T12:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: async () => mockResponse,
      } as any);

      const client = new ElevenLabsApiClient();
      const result = await client.getSignedUrl();

      expect(result.signedUrl).toBe("wss://example.com/signed-url");
      expect(result.expiresAt).toBe("2025-01-01T12:00:00Z");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "xi-api-key": "test-api-key",
          }),
        }),
      );
    });

    it("requests signed URL for specific agent", async () => {
      const mockResponse = {
        signed_url: "wss://example.com/signed-url",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: async () => mockResponse,
      } as any);

      const client = new ElevenLabsApiClient();
      const result = await client.getSignedUrl("agent-123");

      expect(result.signedUrl).toBe("wss://example.com/signed-url");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
        ),
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("agent_id=agent-123"),
        expect.any(Object),
      );
    });

    it("handles API errors with status codes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers(),
        text: async () => JSON.stringify({ message: "Invalid API key" }),
      } as any);

      const client = new ElevenLabsApiClient();
      await expect(client.getSignedUrl()).rejects.toMatchObject({
        message: expect.stringContaining("Invalid API key"),
        status: 401,
      });
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const client = new ElevenLabsApiClient();
      await expect(client.getSignedUrl()).rejects.toThrow(
        "Failed to get signed URL",
      );
    });

    it("handles timeout errors", async () => {
      // Mock fetch to reject with AbortError
      const abortError = new Error("AbortError");
      abortError.name = "AbortError";

      mockFetch.mockImplementationOnce(() => {
        return Promise.reject(abortError);
      });

      const client = new ElevenLabsApiClient();
      await expect(client.getSignedUrl()).rejects.toThrow(
        "Request to ElevenLabs API timed out",
      );
    });

    it("throws error when API key is not configured", async () => {
      delete process.env.ELEVENLABS_API_KEY;
      const client = new ElevenLabsApiClient();
      await expect(client.getSignedUrl()).rejects.toThrow(
        "ELEVENLABS_API_KEY is required",
      );
    });

    it("handles invalid response structure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: async () => ({ invalid: "response" }),
      } as any);

      const client = new ElevenLabsApiClient();
      await expect(client.getSignedUrl()).rejects.toThrow(
        "Invalid response from ElevenLabs API",
      );
    });

    it("handles response with signedUrl (camelCase)", async () => {
      const mockResponse = {
        signedUrl: "wss://example.com/signed-url",
        expiresAt: "2025-01-01T12:00:00Z",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: async () => mockResponse,
      } as any);

      const client = new ElevenLabsApiClient();
      const result = await client.getSignedUrl();

      expect(result.signedUrl).toBe("wss://example.com/signed-url");
      expect(result.expiresAt).toBe("2025-01-01T12:00:00Z");
    });
  });

  describe("isConfigured", () => {
    it("returns true when API key is set", () => {
      process.env.ELEVENLABS_API_KEY = "test-key";
      const client = new ElevenLabsApiClient();
      expect(client.isConfigured()).toBe(true);
    });

    it("returns false when API key is not set", () => {
      delete process.env.ELEVENLABS_API_KEY;
      const client = new ElevenLabsApiClient();
      expect(client.isConfigured()).toBe(false);
    });
  });
});
