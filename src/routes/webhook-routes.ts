/**
 * Webhook routes for ElevenLabs agent integration
 */
import { Router, type Request, type Response } from "express";
import { logger } from "../logger.js";
import type { AgentToolRequest, CallbackPayload } from "../types/webhook.js";
import { SessionService } from "../services/session-service.js";
import { CursorRunnerService } from "../services/cursor-runner-service.js";
import { AgentConversationService } from "../services/agent-conversation-service.js";
import { ElevenLabsApiClient } from "../services/elevenlabs-api.js";
import { ElevenLabsPushService } from "../services/elevenlabs-push-service.js";
import { CallbackQueueService } from "../services/callback-queue.js";
import { requireElevenLabsEnabled } from "../utils/feature-flags.js";
import type Redis from "ioredis";

/**
 * Setup webhook routes
 */
export function setupWebhookRoutes(router: Router, redis?: Redis): void {
  const sessionService = redis ? new SessionService(redis) : null;
  const cursorRunnerService = new CursorRunnerService();
  const agentConversationService = new AgentConversationService();
  const elevenlabsApi = new ElevenLabsApiClient();
  const pushService = new ElevenLabsPushService();
  const callbackQueue = redis ? new CallbackQueueService(redis) : null;

  /**
   * GET /signed-url
   * Get a signed URL from ElevenLabs API for connecting to an agent
   * Query params: agentId (optional)
   */
  router.get(
    "/signed-url",
    requireElevenLabsEnabled,
    async (req: Request, res: Response) => {
      try {
        const agentId = req.query.agentId as string | undefined;

        logger.info("Signed URL requested", {
          agentId,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });

        if (!elevenlabsApi.isConfigured()) {
          res.status(500).json({
            success: false,
            error: "ELEVENLABS_API_KEY not configured",
          });
          return;
        }

        const result = await elevenlabsApi.getSignedUrl(agentId);

        res.json({
          signedUrl: result.signedUrl,
          expiresAt: result.expiresAt,
        });
      } catch (error) {
        const err = error as Error & { status?: number; code?: string };
        logger.error("Failed to get signed URL from ElevenLabs", {
          error: err.message,
          status: err.status,
          code: err.code,
          stack: err.stack,
        });

        // Use appropriate status code if available
        const statusCode =
          err.status && err.status >= 400 && err.status < 600
            ? err.status
            : 500;

        res.status(statusCode).json({
          success: false,
          error: err.message || "Failed to get signed URL from ElevenLabs",
          timestamp: new Date().toISOString(),
        });
      }
    },
  );

  /**
   * POST /agent-tools
   * Webhook endpoint for ElevenLabs agent tool requests
   * Body: AgentToolRequest
   */
  router.post(
    "/agent-tools",
    requireElevenLabsEnabled,
    async (req: Request, res: Response) => {
      try {
        const body = req.body as AgentToolRequest;

        logger.info("Agent tool request received", {
          agentId: body.agent_id,
          sessionId: body.session_id,
          toolName: body.tool_name,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });

        // Validate request
        if (!body.agent_id || !body.session_id || !body.tool_name) {
          res.status(400).json({
            success: false,
            error: "Missing required fields: agent_id, session_id, tool_name",
          });
          return;
        }

        // Verify webhook secret if both are provided
        const webhookSecret = process.env.WEBHOOK_SECRET;
        const providedSecret = req.headers["x-webhook-secret"] as string;
        if (
          webhookSecret &&
          providedSecret &&
          providedSecret !== webhookSecret
        ) {
          logger.warn("Invalid webhook secret", {
            agentId: body.agent_id,
            ip: req.ip,
          });
          res.status(401).json({
            success: false,
            error: "Invalid webhook secret",
          });
          return;
        }

        // Get or create session
        let session = sessionService
          ? await sessionService.getSession(body.session_id)
          : null;
        let agentConversationId: string | undefined;

        if (!session && sessionService) {
          // Create new session and agent conversation
          try {
            const agentConversation =
              await agentConversationService.createConversation(body.agent_id);
            agentConversationId = agentConversation.conversationId;

            session = {
              sessionId: body.session_id,
              agentId: body.agent_id,
              conversationId: body.conversation_id || agentConversationId,
              agentConversationId: agentConversationId,
              createdAt: new Date().toISOString(),
              lastAccessedAt: new Date().toISOString(),
            };
            await sessionService.createOrUpdateSession(session);

            // Store the tool request as a message in the agent conversation
            await agentConversationService.addMessage(agentConversationId, {
              role: "user",
              content: `Tool request: ${body.tool_name}${body.tool_args ? ` with args: ${JSON.stringify(body.tool_args)}` : ""}`,
              source: "voice",
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            logger.error("Failed to create agent conversation", {
              error: (error as Error).message,
              sessionId: body.session_id,
            });
            // Continue without agent conversation if creation fails
          }
        } else if (session && sessionService) {
          session.lastAccessedAt = new Date().toISOString();
          if (body.conversation_id) {
            session.conversationId = body.conversation_id;
          }
          agentConversationId = session.agentConversationId;

          // If session doesn't have an agent conversation ID, try to get or create one
          if (!agentConversationId) {
            try {
              const agentConversation =
                await agentConversationService.createConversation(
                  body.agent_id,
                );
              agentConversationId = agentConversation.conversationId;
              session.agentConversationId = agentConversationId;
            } catch (error) {
              logger.error(
                "Failed to create agent conversation for existing session",
                {
                  error: (error as Error).message,
                  sessionId: body.session_id,
                },
              );
            }
          }

          await sessionService.createOrUpdateSession(session);

          // Store the tool request as a message in the agent conversation
          if (agentConversationId) {
            try {
              await agentConversationService.addMessage(agentConversationId, {
                role: "user",
                content: `Tool request: ${body.tool_name}${body.tool_args ? ` with args: ${JSON.stringify(body.tool_args)}` : ""}`,
                source: "voice",
                timestamp: new Date().toISOString(),
              });
            } catch (error) {
              logger.error("Failed to add message to agent conversation", {
                error: (error as Error).message,
                agentConversationId,
              });
            }
          }
        }

        // Process tool request based on tool_name
        const conversationId = session?.conversationId || body.conversation_id;
        const callbackUrl = `${process.env.ELEVENLABS_AGENT_URL || "http://elevenlabs-agent:3004"}/callback`;

        // Map tool_name to cursor-runner prompt
        // For now, treat tool_name as the action and tool_args as parameters
        const prompt = buildPromptFromToolRequest(body);

        try {
          // Execute asynchronously with callback
          const result = await cursorRunnerService.executeAsync(
            {
              prompt,
              conversationId,
              queueType: "api",
            },
            callbackUrl,
          );

          // Create callback task to track this async operation
          // Extract wsUrl from session metadata if available
          const wsUrl = session?.metadata?.wsUrl as string | undefined;
          const sessionPayload = session?.metadata?.sessionPayload as unknown;

          if (callbackQueue && wsUrl && result.requestId) {
            try {
              await callbackQueue.createTask({
                taskId: result.requestId,
                conversationId: conversationId || "",
                sessionPayload: sessionPayload || {},
                wsUrl: wsUrl,
                toolName: body.tool_name,
                toolArgs: body.tool_args,
                requestId: result.requestId,
              });
              logger.info("Callback task created", {
                requestId: result.requestId,
                conversationId,
              });
            } catch (error) {
              logger.warn("Failed to create callback task", {
                error: (error as Error).message,
                requestId: result.requestId,
              });
              // Continue even if callback task creation fails
            }
          }

          res.json({
            success: true,
            message: "Tool request processed",
            sessionId: body.session_id,
            requestId: result.requestId,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          const err = error as Error;
          logger.error("Failed to process tool request with cursor-runner", {
            error: err.message,
            toolName: body.tool_name,
            sessionId: body.session_id,
          });

          res.status(500).json({
            success: false,
            error: err.message,
            sessionId: body.session_id,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        const err = error as Error;
        logger.error("Failed to process agent tool request", {
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
    },
  );

  /**
   * POST /callback
   * Callback endpoint for cursor-runner task completion
   * Body: CallbackPayload
   */
  router.post(
    "/callback",
    requireElevenLabsEnabled,
    async (req: Request, res: Response) => {
      try {
        const body = req.body as CallbackPayload;

        logger.info("Callback received from cursor-runner", {
          requestId: body.requestId,
          success: body.success,
          conversationId: body.conversationId,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });

        // Validate request
        if (!body.requestId) {
          res.status(400).json({
            success: false,
            error: "Missing required field: requestId",
          });
          return;
        }

        // Find callback task by requestId (which is the taskId)
        let callbackTask = null;
        if (callbackQueue && body.requestId) {
          try {
            callbackTask = await callbackQueue.getTask(body.requestId);
          } catch (error) {
            logger.warn("Failed to get callback task", {
              error: (error as Error).message,
              requestId: body.requestId,
            });
          }
        }

        // Find session by conversationId (fallback if callback task not found)
        let session = null;
        if (body.conversationId && sessionService) {
          session = await sessionService.findSessionByConversationId(
            body.conversationId,
          );
        }

        // Get wsUrl from callback task or session
        const wsUrl =
          callbackTask?.wsUrl ||
          (session?.metadata?.wsUrl as string | undefined);

        // Push message to ElevenLabs if wsUrl is available
        if (wsUrl) {
          try {
            const message = pushService.constructCompletionMessage(
              body.success,
              body.output,
              body.error,
            );
            await pushService.pushMessage(wsUrl, message);
            logger.info("Message pushed to ElevenLabs", {
              requestId: body.requestId,
              success: body.success,
            });
          } catch (error) {
            // Log error but don't crash - callback processing should continue
            logger.error("Failed to push message to ElevenLabs", {
              error: (error as Error).message,
              requestId: body.requestId,
              wsUrl: wsUrl.substring(0, 50) + "...",
            });
          }
        } else {
          logger.warn("No wsUrl available for pushing message", {
            requestId: body.requestId,
            hasCallbackTask: !!callbackTask,
            hasSession: !!session,
          });
        }

        // Update callback task as completed
        if (callbackQueue && callbackTask && body.requestId) {
          try {
            await callbackQueue.markCompleted(
              body.requestId,
              body.success ? { output: body.output } : undefined,
              body.success ? undefined : body.error,
            );
          } catch (error) {
            logger.warn("Failed to mark callback task as completed", {
              error: (error as Error).message,
              requestId: body.requestId,
            });
          }
        }

        if (session && sessionService) {
          // Update session with callback result
          session.lastAccessedAt = new Date().toISOString();
          if (!session.metadata) {
            session.metadata = {};
          }
          session.metadata.lastCallback = {
            requestId: body.requestId,
            success: body.success,
            timestamp: body.timestamp,
          };
          await sessionService.createOrUpdateSession(session);

          // Store callback result in agent conversation
          if (session.agentConversationId) {
            try {
              const messageContent = body.success
                ? `Tool execution completed: ${body.output || "Success"}`
                : `Tool execution failed: ${body.error || "Unknown error"}`;

              await agentConversationService.addMessage(
                session.agentConversationId,
                {
                  role: "assistant",
                  content: messageContent,
                  source: "text", // Use 'text' for tool outputs since frontend only supports 'voice' | 'text'
                  timestamp: new Date().toISOString(),
                },
              );
            } catch (error) {
              logger.error(
                "Failed to add callback message to agent conversation",
                {
                  error: (error as Error).message,
                  agentConversationId: session.agentConversationId,
                },
              );
            }
          }
        }

        logger.info("Callback processed", {
          requestId: body.requestId,
          conversationId: body.conversationId,
          success: body.success,
          sessionId: session?.sessionId,
          agentConversationId: session?.agentConversationId,
          messagePushed: !!wsUrl,
        });

        res.json({
          success: true,
          message: "Callback received and processed",
          requestId: body.requestId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const err = error as Error;
        logger.error("Failed to process callback", {
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
    },
  );
}

/**
 * Build a prompt from tool request
 */
function buildPromptFromToolRequest(request: AgentToolRequest): string {
  // Convert tool_name and tool_args into a natural language prompt
  const toolName = request.tool_name;
  const toolArgs = request.tool_args || {};

  // Basic prompt construction - can be enhanced based on specific tools
  if (Object.keys(toolArgs).length > 0) {
    const argsStr = Object.entries(toolArgs)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(", ");
    return `Execute ${toolName} with parameters: ${argsStr}`;
  }

  return `Execute ${toolName}`;
}
