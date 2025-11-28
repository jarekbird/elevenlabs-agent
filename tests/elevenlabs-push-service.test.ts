/**
 * Unit tests for ElevenLabsPushService
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ElevenLabsPushService } from '../src/services/elevenlabs-push-service';

describe('ElevenLabsPushService', () => {
  let pushService: ElevenLabsPushService;

  beforeEach(() => {
    pushService = new ElevenLabsPushService();
  });

  describe('constructCompletionMessage', () => {
    it('constructs success message with output', () => {
      const message = pushService.constructCompletionMessage(
        true,
        'Task completed successfully',
        undefined
      );

      expect(message.type).toBe('input_text');
      expect(message.text).toContain('Your code task is complete');
      expect(message.text).toContain('Task completed successfully');
    });

    it('constructs success message without output', () => {
      const message = pushService.constructCompletionMessage(
        true,
        undefined,
        undefined
      );

      expect(message.type).toBe('input_text');
      expect(message.text).toContain('Your code task is complete');
      expect(message.text).toContain('Task completed successfully');
    });

    it('constructs error message with error', () => {
      const message = pushService.constructCompletionMessage(
        false,
        undefined,
        'Task failed with error'
      );

      expect(message.type).toBe('input_text');
      expect(message.text).toContain('Your code task encountered an error');
      expect(message.text).toContain('Task failed with error');
    });

    it('constructs error message without error', () => {
      const message = pushService.constructCompletionMessage(
        false,
        undefined,
        undefined
      );

      expect(message.type).toBe('input_text');
      expect(message.text).toContain('Your code task encountered an error');
      expect(message.text).toContain('Task failed with unknown error');
    });
  });

  describe('pushMessage', () => {
    it('throws error when wsUrl is empty', async () => {
      await expect(pushService.pushMessage('', {
        type: 'input_text',
        text: 'Test message',
      })).rejects.toThrow('WebSocket URL is required');
    });

    it('throws error when wsUrl is not provided', async () => {
      await expect(
        pushService.pushMessage(
          undefined as any,
          {
            type: 'input_text',
            text: 'Test message',
          }
        )
      ).rejects.toThrow('WebSocket URL is required');
    });

    it('handles push message (MVP - currently stubbed)', async () => {
      // For MVP, pushMessage is stubbed and just logs
      // This test verifies it doesn't throw
      await expect(
        pushService.pushMessage('wss://example.com/ws', {
          type: 'input_text',
          text: 'Test message',
        })
      ).resolves.not.toThrow();
    });

    it('handles push message with metadata', async () => {
      // For MVP, pushMessage is stubbed
      await expect(
        pushService.pushMessage('wss://example.com/ws', {
          type: 'input_text',
          text: 'Test message',
          metadata: {
            summary: 'Test summary',
            branch: 'main',
          },
        })
      ).resolves.not.toThrow();
    });
  });
});


