/**
 * Feature flag utilities for controlling feature visibility.
 */
import { logger } from '../logger.js';

/**
 * Check if ElevenLabs agent feature is enabled.
 * Reads from ELEVENLABS_AGENT_ENABLED environment variable.
 * Defaults to false if not set.
 * 
 * @returns true if the feature is enabled, false otherwise
 */
export function isElevenLabsEnabled(): boolean {
  const flag = process.env.ELEVENLABS_AGENT_ENABLED;
  const enabled = flag === 'true' || flag === 'True' || flag === 'TRUE';
  
  if (!enabled && flag !== undefined && flag !== 'false' && flag !== 'False' && flag !== 'FALSE') {
    logger.warn('ELEVENLABS_AGENT_ENABLED has unexpected value', {
      value: flag,
      note: 'Feature will be disabled. Expected "true" or "false"',
    });
  }
  
  return enabled;
}

/**
 * Middleware to check if ElevenLabs agent is enabled.
 * Returns 503 Service Unavailable if feature is disabled.
 * 
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
export function requireElevenLabsEnabled(
  req: any,
  res: any,
  next: any
): void {
  if (!isElevenLabsEnabled()) {
    logger.info('ElevenLabs agent feature is disabled, returning 503', {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'ElevenLabs agent feature is currently disabled',
      enabled: false,
    });
    return;
  }
  next();
}

