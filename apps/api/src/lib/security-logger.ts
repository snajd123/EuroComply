/**
 * Security event logging for audit and monitoring.
 *
 * Logs security-relevant events in structured JSON format for
 * integration with SIEM systems and security monitoring tools.
 */

export type SecurityEventType =
  | 'AUTH_FAILURE'
  | 'RATE_LIMIT'
  | 'INVALID_INPUT'
  | 'AUTHORIZATION_DENIED'
  | 'SUSPICIOUS_REQUEST';

export interface SecurityEvent {
  type: SecurityEventType;
  ip: string;
  path: string;
  userId?: string;
  organizationId?: string;
  details?: Record<string, unknown>;
}

/**
 * Log a security event for monitoring and audit purposes.
 *
 * Events are logged as structured JSON for easy parsing by
 * log aggregation systems (CloudWatch, Datadog, etc.).
 *
 * @param event - The security event to log
 */
export function logSecurityEvent(event: SecurityEvent): void {
  const logEntry = {
    level: 'SECURITY',
    type: event.type,
    ip: event.ip,
    path: event.path,
    userId: event.userId,
    organizationId: event.organizationId,
    timestamp: new Date().toISOString(),
    details: event.details,
  };

  // Use console.warn for security events so they're distinguishable
  // from normal application logs
  console.warn(JSON.stringify(logEntry));
}

/**
 * Log an authentication failure event.
 */
export function logAuthFailure(
  ip: string,
  path: string,
  reason: string,
  details?: Record<string, unknown>
): void {
  logSecurityEvent({
    type: 'AUTH_FAILURE',
    ip,
    path,
    details: { reason, ...details },
  });
}

/**
 * Log a rate limit hit.
 */
export function logRateLimit(
  ip: string,
  path: string,
  details?: Record<string, unknown>
): void {
  logSecurityEvent({
    type: 'RATE_LIMIT',
    ip,
    path,
    details,
  });
}

/**
 * Log an authorization denial (user authenticated but not authorized).
 */
export function logAuthorizationDenied(
  ip: string,
  path: string,
  userId: string,
  organizationId?: string,
  details?: Record<string, unknown>
): void {
  logSecurityEvent({
    type: 'AUTHORIZATION_DENIED',
    ip,
    path,
    userId,
    organizationId,
    details,
  });
}
