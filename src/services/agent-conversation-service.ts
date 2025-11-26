/**
 * Service for managing agent conversations via cursor-runner API
 */
import { logger } from '../logger.js';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  source?: 'voice' | 'text' | 'tool_output';
  timestamp?: string;
}

export interface AgentConversation {
  conversationId: string;
  messages: AgentMessage[];
  createdAt: string;
  lastAccessedAt: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export class AgentConversationService {
  private readonly CURSOR_RUNNER_URL: string;

  constructor() {
    this.CURSOR_RUNNER_URL =
      process.env.CURSOR_RUNNER_URL || 'http://cursor-runner:3001';
  }

  /**
   * Create a new agent conversation
   */
  async createConversation(agentId?: string): Promise<AgentConversation> {
    const url = `${this.CURSOR_RUNNER_URL}/agent-conversations/api/new`;
    const body = agentId ? { agentId } : {};

    logger.info('Creating agent conversation', { agentId, url });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({
          error: response.statusText,
        }))) as { error?: string };
        throw new Error(
          `Failed to create agent conversation: ${response.status} - ${
            errorData.error || response.statusText
          }`
        );
      }

      const data = (await response.json()) as {
        success: boolean;
        conversationId: string;
      };

      // Fetch the created conversation to return full details
      return this.getConversation(data.conversationId);
    } catch (error) {
      logger.error('Error creating agent conversation', {
        error: (error as Error).message,
        agentId,
      });
      throw error;
    }
  }

  /**
   * Get an agent conversation by ID
   */
  async getConversation(conversationId: string): Promise<AgentConversation> {
    const url = `${this.CURSOR_RUNNER_URL}/agent-conversations/api/${conversationId}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Agent conversation ${conversationId} not found`);
        }
        const errorData = (await response.json().catch(() => ({
          error: response.statusText,
        }))) as { error?: string };
        throw new Error(
          `Failed to get agent conversation: ${response.status} - ${
            errorData.error || response.statusText
          }`
        );
      }

      return (await response.json()) as AgentConversation;
    } catch (error) {
      logger.error('Error getting agent conversation', {
        error: (error as Error).message,
        conversationId,
      });
      throw error;
    }
  }

  /**
   * Add a message to an agent conversation
   */
  async addMessage(
    conversationId: string,
    message: AgentMessage
  ): Promise<void> {
    const url = `${this.CURSOR_RUNNER_URL}/agent-conversations/api/${conversationId}/message`;

    logger.info('Adding message to agent conversation', {
      conversationId,
      role: message.role,
      contentLength: message.content.length,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({
          error: response.statusText,
        }))) as { error?: string };
        throw new Error(
          `Failed to add message to agent conversation: ${response.status} - ${
            errorData.error || response.statusText
          }`
        );
      }
    } catch (error) {
      logger.error('Error adding message to agent conversation', {
        error: (error as Error).message,
        conversationId,
      });
      throw error;
    }
  }
}

