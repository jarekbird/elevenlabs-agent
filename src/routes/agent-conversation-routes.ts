/**
 * Agent conversation routes
 * Handles session registration and other agent conversation endpoints
 */
import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import { SessionService } from '../services/session-service.js';
import { requireElevenLabsEnabled } from '../utils/feature-flags.js';
import type Redis from 'ioredis';

/**
 * Setup agent conversation routes
 */
export function setupAgentConversationRoutes(router: Router, redis?: Redis): void {
  const sessionService = redis ? new SessionService(redis) : null;

  /**
   * POST /agent-conversations/api/:id/session
   * Register an active ElevenLabs session for a conversation
   * Body: { sessionUrl: string, sessionId?: string, expiresAt?: string, metadata?: object }
   */
  router.post('/agent-conversations/api/:id/session', requireElevenLabsEnabled, async (req: Request, res: Response) => {
    try {
      const conversationId = req.params.id;
      const body = req.body as {
        sessionUrl: string;
        sessionId?: string;
        sessionPayload?: unknown;
        expiresAt?: string;
        metadata?: Record<string, unknown>;
      };

      logger.info('Session registration requested', {
        conversationId,
        hasSessionUrl: !!body.sessionUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });

      // Validate request
      if (!body.sessionUrl) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: sessionUrl',
        });
        return;
      }

      if (!sessionService) {
        res.status(500).json({
          success: false,
          error: 'Session service not available (Redis not configured)',
        });
        return;
      }

      // Extract wsUrl from sessionUrl (they should be the same for WebSocket connections)
      const wsUrl = body.sessionUrl;

      // Create or update session
      const session = {
        sessionId: body.sessionId || `session-${Date.now()}`,
        agentId: (body.metadata?.agentId as string) || 'default',
        conversationId: conversationId,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
        metadata: {
          ...body.metadata,
          wsUrl: wsUrl,
          sessionUrl: body.sessionUrl,
          sessionPayload: body.sessionPayload || {},
          expiresAt: body.expiresAt,
        },
      };

      await sessionService.createOrUpdateSession(session);

      logger.info('Session registered successfully', {
        conversationId,
        sessionId: session.sessionId,
      });

      res.json({
        success: true,
        message: 'Session registered',
        sessionId: session.sessionId,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to register session', {
        error: err.message,
        stack: err.stack,
        conversationId: req.params.id,
      });

      res.status(500).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}


