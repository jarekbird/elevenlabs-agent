/**
 * Types for ElevenLabs webhook payloads
 */

/**
 * ElevenLabs agent tool request payload
 */
export interface AgentToolRequest {
  agent_id: string;
  session_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  conversation_id?: string;
}

/**
 * ElevenLabs callback payload (from cursor-runner)
 */
export interface CallbackPayload {
  success: boolean;
  requestId: string;
  conversationId?: string;
  output?: string;
  error?: string;
  timestamp: string;
}

/**
 * Signed URL response
 */
export interface SignedUrlResponse {
  url: string;
  expiresAt: string;
}

