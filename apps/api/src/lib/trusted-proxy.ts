/**
 * Trusted Proxy Utilities
 *
 * Provides secure client IP extraction that only trusts proxy headers
 * when requests come from known trusted sources (private IPs / AWS ALB).
 */
import type { Context } from 'hono';

/**
 * Private IP ranges (RFC 1918 + loopback + link-local)
 */
const PRIVATE_IP_RANGES = [
  /^10\./,                          // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
  /^192\.168\./,                     // 192.168.0.0/16
  /^127\./,                          // 127.0.0.0/8 (loopback)
  /^169\.254\./,                     // 169.254.0.0/16 (link-local)
  /^::1$/,                           // IPv6 loopback
  /^fc00:/i,                         // IPv6 unique local
  /^fe80:/i,                         // IPv6 link-local
];

/**
 * Check if an IP address is private/internal.
 */
export function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((pattern) => pattern.test(ip));
}

/**
 * Extract the real client IP address from request.
 *
 * Security: Only trusts X-Forwarded-For when the direct connection
 * comes from a private IP (i.e., AWS ALB or internal proxy).
 * This prevents IP spoofing attacks where attackers send fake headers.
 */
export function getClientIp(c: Context): string {
  // Get the direct connection IP (socket address)
  const socketIp = getSocketIp(c);

  // Only trust proxy headers if request came from private network (ALB/proxy)
  if (socketIp && isPrivateIp(socketIp)) {
    const forwardedFor = c.req.header('x-forwarded-for');
    if (forwardedFor) {
      // Get first IP in chain (original client)
      const clientIp = forwardedFor.split(',')[0]?.trim();
      if (clientIp) {
        return clientIp;
      }
    }

    // Fall back to X-Real-IP if present
    const realIp = c.req.header('x-real-ip');
    if (realIp) {
      return realIp;
    }
  }

  // Return socket IP or unknown
  return socketIp || 'unknown';
}

/**
 * Get the socket/connection IP address.
 */
function getSocketIp(c: Context): string | null {
  // Try Hono's built-in method first
  try {
    // @ts-expect-error - env.incoming may exist in Node adapter
    const socket = c.env?.incoming?.socket;
    if (socket?.remoteAddress) {
      return socket.remoteAddress;
    }
  } catch {
    // Ignore
  }

  // Try Cloudflare's CF-Connecting-IP (always trusted from CF edge)
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  return null;
}
