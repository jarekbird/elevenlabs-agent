/**
 * Webhook routes for ElevenLabs agent integration
 */
import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import type { AgentToolRequest, CallbackPayload } from '../types/webhook.js';

/**
 * Setup webhook routes
 */
export function setupWebhookRoutes(router: Router): void {
  /**
   * GET /signed-url
   * Generate a signed URL for ElevenLabs agent webhook registration
   * Query params: agent_id (optional)
   */
  router.get('/signed-url', async (req: Request, res: Response) => {
    try {
      const agentId = req.query.agent_id as string | undefined;
      const webhookSecret = process.env.WEBHOOK_SECRET;
      const cursorRunnerUrl = process.env.CURSOR_RUNNER_URL || 'http://cursor-runner:3001';

      if (!webhookSecret) {
        logger.warn('WEBHOOK_SECRET not configured');
        res.status(500).json({
          success: false,
          error: 'Webhook secret not configured',
        });
        return;
      }

      // Build webhook URL
      const baseUrl = process.env.ELEVENLABS_AGENT_URL || 'http://elevenlabs-agent:3004';
      const webhookUrl = `${baseUrl}/agent-tools`;

      logger.info('Signed URL requested', {
        agentId,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      // For now, return the webhook URL
      // In a full implementation, this would generate a signed URL with expiration
      res.json({
        url: webhookUrl,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to generate signed URL', {
        error: err.message,
        stack: err.stack,
      });

      res.status(500).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * POST /agent-tools
   * Webhook endpoint for ElevenLabs agent tool requests
   * Body: AgentToolRequest
   */
  router.post('/agent-tools', async (req: Request, res: Response) => {
    try {
      const body = req.body as AgentToolRequest;

      logger.info('Agent tool request received', {
        agentId: body.agent_id,
        sessionId: body.session_id,
        toolName: body.tool_name,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      // Validate request
      if (!body.agent_id || !body.session_id || !body.tool_name) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: agent_id, session_id, tool_name',
        });
        return;
      }

      // Verify webhook secret if both are provided
      const webhookSecret = process.env.WEBHOOK_SECRET;
      const providedSecret = req.headers['x-webhook-secret'] as string;
      if (webhookSecret && providedSecret && providedSecret !== webhookSecret) {
        logger.warn('Invalid webhook secret', {
          agentId: body.agent_id,
          ip: req.ip,
        });
        res.status(401).json({
          success: false,
          error: 'Invalid webhook secret',
        });
        return;
      }

      // TODO: Process tool request and forward to cursor-runner
      // For now, return acknowledgment
      res.json({
        success: true,
        message: 'Tool request received',
        sessionId: body.session_id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to process agent tool request', {
        error: err.message,
        stack: err.stack,
        body: req.body,
      });

      res.status(500).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * POST /callback
   * Callback endpoint for cursor-runner task completion
   * Body: CallbackPayload
   */
  router.post('/callback', async (req: Request, res: Response) => {
    try {
      const body = req.body as CallbackPayload;

      logger.info('Callback received from cursor-runner', {
        requestId: body.requestId,
        success: body.success,
        conversationId: body.conversationId,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      // Validate request
      if (!body.requestId) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: requestId',
        });
        return;
      }

      // TODO: Process callback and notify ElevenLabs agent
      // For now, return acknowledgment
      res.json({
        success: true,
        message: 'Callback received',
        requestId: body.requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to process callback', {
        error: err.message,
        stack: err.stack,
        body: req.body,
      });

      res.status(500).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

