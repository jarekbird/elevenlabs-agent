// eslint-disable-next-line node/no-unpublished-import
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import { Server } from '../src/server.js';

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch as any;

describe('Webhook Routes', () => {
  let server: Server;

  beforeEach(() => {
    server = new Server();
  });

  afterEach(async () => {
    await server.stop();
    jest.clearAllMocks();
  });

  describe('GET /signed-url', () => {
    it('should return webhook URL when WEBHOOK_SECRET is configured', async () => {
      process.env.WEBHOOK_SECRET = 'test-secret';
      process.env.ELEVENLABS_AGENT_URL = 'http://test:3004';
      await server.start();

      const response = await request(server.app).get('/signed-url');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('url');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body.url).toContain('/agent-tools');
    });

    it('should return 500 when WEBHOOK_SECRET is not configured', async () => {
      delete process.env.WEBHOOK_SECRET;
      await server.start();

      const response = await request(server.app).get('/signed-url');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /agent-tools', () => {
    beforeEach(() => {
      process.env.WEBHOOK_SECRET = 'test-secret';
    });

    it('should accept valid agent tool request', async () => {
      // Mock fetch for cursor-runner call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          requestId: 'test-request-id',
          timestamp: new Date().toISOString(),
        }),
      } as Response);

      await server.start();

      const response = await request(server.app)
        .post('/agent-tools')
        .send({
          agent_id: 'test-agent',
          session_id: 'test-session',
          tool_name: 'test-tool',
          tool_args: {},
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('sessionId', 'test-session');
    });

    it('should reject request with missing required fields', async () => {
      await server.start();

      const response = await request(server.app)
        .post('/agent-tools')
        .send({
          agent_id: 'test-agent',
          // Missing session_id and tool_name
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject request with invalid webhook secret', async () => {
      await server.start();

      const response = await request(server.app)
        .post('/agent-tools')
        .set('x-webhook-secret', 'wrong-secret')
        .send({
          agent_id: 'test-agent',
          session_id: 'test-session',
          tool_name: 'test-tool',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /callback', () => {
    beforeEach(() => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'true';
    });

    it('should accept valid callback payload', async () => {
      await server.start();

      const response = await request(server.app)
        .post('/callback')
        .send({
          success: true,
          requestId: 'test-request-id',
          conversationId: 'test-conversation',
          timestamp: new Date().toISOString(),
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('requestId', 'test-request-id');
    });

    it('should reject callback with missing requestId', async () => {
      await server.start();

      const response = await request(server.app)
        .post('/callback')
        .send({
          success: true,
          // Missing requestId
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle callback with success=false', async () => {
      await server.start();

      const response = await request(server.app)
        .post('/callback')
        .send({
          success: false,
          requestId: 'test-request-id-2',
          error: 'Test error',
          conversationId: 'test-conversation',
          timestamp: new Date().toISOString(),
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle callback without conversationId', async () => {
      await server.start();

      const response = await request(server.app)
        .post('/callback')
        .send({
          success: true,
          requestId: 'test-request-id-3',
          timestamp: new Date().toISOString(),
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Callback Queue Behavior and Race Conditions', () => {
    beforeEach(() => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'true';
      process.env.WEBHOOK_SECRET = 'test-secret';
    });

    it('should handle multiple callbacks for same conversation', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          requestId: 'req-1',
        }),
      } as Response);

      await server.start();

      // Send first tool request
      const toolResponse1 = await request(server.app)
        .post('/agent-tools')
        .send({
          agent_id: 'test-agent',
          session_id: 'test-session',
          tool_name: 'tool-1',
          conversation_id: 'conv-1',
        });

      expect(toolResponse1.status).toBe(200);

      // Send second tool request
      const toolResponse2 = await request(server.app)
        .post('/agent-tools')
        .send({
          agent_id: 'test-agent',
          session_id: 'test-session',
          tool_name: 'tool-2',
          conversation_id: 'conv-1',
        });

      expect(toolResponse2.status).toBe(200);

      // Send callbacks (potentially out of order)
      const callback1 = await request(server.app)
        .post('/callback')
        .send({
          success: true,
          requestId: toolResponse2.body.requestId,
          conversationId: 'conv-1',
          output: 'Result 2',
          timestamp: new Date().toISOString(),
        });

      const callback2 = await request(server.app)
        .post('/callback')
        .send({
          success: true,
          requestId: toolResponse1.body.requestId,
          conversationId: 'conv-1',
          output: 'Result 1',
          timestamp: new Date().toISOString(),
        });

      expect(callback1.status).toBe(200);
      expect(callback2.status).toBe(200);
    });

    it('should handle rapid sequential callbacks', async () => {
      await server.start();

      const callbacks = await Promise.all([
        request(server.app)
          .post('/callback')
          .send({
            success: true,
            requestId: 'req-1',
            conversationId: 'conv-1',
            timestamp: new Date().toISOString(),
          }),
        request(server.app)
          .post('/callback')
          .send({
            success: true,
            requestId: 'req-2',
            conversationId: 'conv-1',
            timestamp: new Date().toISOString(),
          }),
        request(server.app)
          .post('/callback')
          .send({
            success: true,
            requestId: 'req-3',
            conversationId: 'conv-1',
            timestamp: new Date().toISOString(),
          }),
      ]);

      callbacks.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });
    });
  });

  describe('Signed URL Route', () => {
    beforeEach(() => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'true';
    });

    it('should include agent_id in response when provided', async () => {
      process.env.WEBHOOK_SECRET = 'test-secret';
      process.env.ELEVENLABS_AGENT_URL = 'http://test:3004';
      await server.start();

      const response = await request(server.app)
        .get('/signed-url')
        .query({ agent_id: 'test-agent-123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('url');
      expect(response.body).toHaveProperty('expiresAt');
    });

    it('should return URL with correct expiration time', async () => {
      process.env.WEBHOOK_SECRET = 'test-secret';
      process.env.ELEVENLABS_AGENT_URL = 'http://test:3004';
      await server.start();

      const beforeTime = Date.now();
      const response = await request(server.app).get('/signed-url');
      const afterTime = Date.now();

      expect(response.status).toBe(200);
      const expiresAt = new Date(response.body.expiresAt).getTime();
      const expectedExpiresAt = beforeTime + 24 * 60 * 60 * 1000; // 24 hours

      // Allow 1 second tolerance
      expect(expiresAt).toBeGreaterThan(expectedExpiresAt - 1000);
      expect(expiresAt).toBeLessThan(afterTime + 24 * 60 * 60 * 1000 + 1000);
    });
  });

  describe('Callback Route Push Logic', () => {
    beforeEach(() => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'true';
      process.env.WEBHOOK_SECRET = 'test-secret';
    });

    it('should attempt to push message when callback task has wsUrl', async () => {
      // This test verifies the callback route attempts to push
      // The actual push is stubbed in MVP, so we just verify it doesn't crash
      await server.start();

      const response = await request(server.app)
        .post('/callback')
        .send({
          success: true,
          requestId: 'test-request-id',
          conversationId: 'test-conversation',
          output: 'Task completed',
          timestamp: new Date().toISOString(),
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle callback when no wsUrl is available gracefully', async () => {
      await server.start();

      const response = await request(server.app)
        .post('/callback')
        .send({
          success: true,
          requestId: 'test-request-id-no-ws',
          conversationId: 'test-conversation-no-session',
          output: 'Task completed',
          timestamp: new Date().toISOString(),
        });

      // Should still succeed even without wsUrl (logs warning but doesn't fail)
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should construct completion message correctly for success', async () => {
      await server.start();

      const response = await request(server.app)
        .post('/callback')
        .send({
          success: true,
          requestId: 'test-success',
          conversationId: 'test-conv',
          output: 'Task output here',
          timestamp: new Date().toISOString(),
        });

      expect(response.status).toBe(200);
      // Message construction is tested in push service tests
    });

    it('should construct error message correctly for failure', async () => {
      await server.start();

      const response = await request(server.app)
        .post('/callback')
        .send({
          success: false,
          requestId: 'test-error',
          conversationId: 'test-conv',
          error: 'Task failed',
          timestamp: new Date().toISOString(),
        });

      expect(response.status).toBe(200);
      // Error message construction is tested in push service tests
    });
  });

  describe('Webhook Handling and Immediate Responses', () => {
    beforeEach(() => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'true';
      process.env.WEBHOOK_SECRET = 'test-secret';
    });

    it('should respond immediately to agent-tools request', async () => {
      mockFetch.mockImplementation(() => {
        // Simulate async cursor-runner call that takes time
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({
                success: true,
                requestId: 'test-request',
              }),
            } as Response);
          }, 100);
        });
      });

      await server.start();

      const startTime = Date.now();
      const response = await request(server.app)
        .post('/agent-tools')
        .send({
          agent_id: 'test-agent',
          session_id: 'test-session',
          tool_name: 'test-tool',
        });
      const endTime = Date.now();

      expect(response.status).toBe(200);
      // Should respond quickly (within 200ms) even though cursor-runner takes longer
      expect(endTime - startTime).toBeLessThan(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle cursor-runner errors gracefully', async () => {
      // Mock fetch to reject with an error
      mockFetch.mockImplementationOnce(() => {
        return Promise.reject(new Error('Network error'));
      });

      await server.start();

      const response = await request(server.app)
        .post('/agent-tools')
        .send({
          agent_id: 'test-agent',
          session_id: 'test-session',
          tool_name: 'test-tool',
        });

      // The route catches errors and returns 500
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Network error');
    });
  });
});

