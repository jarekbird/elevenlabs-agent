import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { isElevenLabsEnabled, requireElevenLabsEnabled } from '../src/utils/feature-flags';
import type { Request, Response, NextFunction } from 'express';

describe('Feature Flags', () => {
  const originalEnv = process.env.ELEVENLABS_AGENT_ENABLED;

  beforeEach(() => {
    delete process.env.ELEVENLABS_AGENT_ENABLED;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ELEVENLABS_AGENT_ENABLED = originalEnv;
    } else {
      delete process.env.ELEVENLABS_AGENT_ENABLED;
    }
  });

  describe('isElevenLabsEnabled', () => {
    it('returns false when flag is not set', () => {
      expect(isElevenLabsEnabled()).toBe(false);
    });

    it('returns false when flag is empty string', () => {
      process.env.ELEVENLABS_AGENT_ENABLED = '';
      expect(isElevenLabsEnabled()).toBe(false);
    });

    it('returns false when flag is "false"', () => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'false';
      expect(isElevenLabsEnabled()).toBe(false);
    });

    it('returns true when flag is "true"', () => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'true';
      expect(isElevenLabsEnabled()).toBe(true);
    });

    it('returns true when flag is "True" (case-insensitive)', () => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'True';
      expect(isElevenLabsEnabled()).toBe(true);
    });

    it('returns true when flag is "TRUE" (case-insensitive)', () => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'TRUE';
      expect(isElevenLabsEnabled()).toBe(true);
    });
  });

  describe('requireElevenLabsEnabled middleware', () => {
    it('calls next() when feature is enabled', () => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'true';
      const req = {} as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;
      const next = jest.fn() as NextFunction;

      requireElevenLabsEnabled(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 503 when feature is disabled', () => {
      process.env.ELEVENLABS_AGENT_ENABLED = 'false';
      const req = {
        method: 'POST',
        path: '/agent-tools',
        ip: '127.0.0.1',
      } as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;
      const next = jest.fn() as NextFunction;

      requireElevenLabsEnabled(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service Unavailable',
        message: 'ElevenLabs agent feature is currently disabled',
        enabled: false,
      });
    });

    it('returns 503 when flag is not set', () => {
      delete process.env.ELEVENLABS_AGENT_ENABLED;
      const req = {
        method: 'GET',
        path: '/signed-url',
        ip: '127.0.0.1',
      } as Request;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;
      const next = jest.fn() as NextFunction;

      requireElevenLabsEnabled(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });
});

