// eslint-disable-next-line node/no-unpublished-import
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { Server } from '../src/server.js';

describe('Webhook Routes', () => {
  let server: Server;

  beforeEach(() => {
    server = new Server();
  });

  afterEach(async () => {
    await server.stop();
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
  });
});

