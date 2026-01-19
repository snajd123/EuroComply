import { describe, it, expect, vi } from 'vitest';
import { getClientIp, isPrivateIp } from '../../lib/trusted-proxy.js';

describe('trusted-proxy', () => {
  describe('isPrivateIp', () => {
    it('should identify private IPv4 addresses in 10.x.x.x range', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.255.255.255')).toBe(true);
    });

    it('should identify private IPv4 addresses in 172.16-31.x.x range', () => {
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
      expect(isPrivateIp('172.15.0.1')).toBe(false); // Not in range
      expect(isPrivateIp('172.32.0.1')).toBe(false); // Not in range
    });

    it('should identify private IPv4 addresses in 192.168.x.x range', () => {
      expect(isPrivateIp('192.168.1.1')).toBe(true);
      expect(isPrivateIp('192.168.255.255')).toBe(true);
    });

    it('should identify loopback addresses', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.255.255.255')).toBe(true);
      expect(isPrivateIp('::1')).toBe(true);
    });

    it('should identify public addresses as non-private', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('203.0.113.50')).toBe(false);
      expect(isPrivateIp('1.2.3.4')).toBe(false);
    });
  });

  describe('getClientIp', () => {
    it('should return socket IP when no proxy headers present', () => {
      const mockContext = {
        req: { header: vi.fn().mockReturnValue(undefined) },
        env: { incoming: { socket: { remoteAddress: '10.0.0.5' } } },
      };
      expect(getClientIp(mockContext as any)).toBe('10.0.0.5');
    });

    it('should trust X-Forwarded-For from private IP (ALB scenario)', () => {
      const mockContext = {
        req: {
          header: vi.fn((name: string) => {
            if (name === 'x-forwarded-for') return '203.0.113.50, 10.0.0.5';
            return undefined;
          }),
        },
        env: { incoming: { socket: { remoteAddress: '10.0.0.5' } } },
      };
      expect(getClientIp(mockContext as any)).toBe('203.0.113.50');
    });

    it('should NOT trust X-Forwarded-For from public IP (direct attack)', () => {
      const mockContext = {
        req: {
          header: vi.fn((name: string) => {
            if (name === 'x-forwarded-for') return '1.2.3.4';
            return undefined;
          }),
        },
        env: { incoming: { socket: { remoteAddress: '203.0.113.100' } } },
      };
      // Should return socket IP, not the spoofed header
      expect(getClientIp(mockContext as any)).toBe('203.0.113.100');
    });

    it('should trust X-Real-IP from private IP when no X-Forwarded-For', () => {
      const mockContext = {
        req: {
          header: vi.fn((name: string) => {
            if (name === 'x-real-ip') return '203.0.113.75';
            return undefined;
          }),
        },
        env: { incoming: { socket: { remoteAddress: '192.168.1.1' } } },
      };
      expect(getClientIp(mockContext as any)).toBe('203.0.113.75');
    });

    it('should return unknown when no socket info available', () => {
      const mockContext = {
        req: { header: vi.fn().mockReturnValue(undefined) },
        env: {},
      };
      expect(getClientIp(mockContext as any)).toBe('unknown');
    });

    it('should use CF-Connecting-IP when TRUST_CLOUDFLARE is enabled and socket unavailable', () => {
      // Set env var for Cloudflare trust
      const originalEnv = process.env['TRUST_CLOUDFLARE'];
      process.env['TRUST_CLOUDFLARE'] = 'true';

      try {
        const mockContext = {
          req: {
            header: vi.fn((name: string) => {
              if (name === 'cf-connecting-ip') return '198.51.100.25';
              return undefined;
            }),
          },
          env: {},
        };
        expect(getClientIp(mockContext as any)).toBe('198.51.100.25');
      } finally {
        // Restore original env var
        if (originalEnv === undefined) {
          delete process.env['TRUST_CLOUDFLARE'];
        } else {
          process.env['TRUST_CLOUDFLARE'] = originalEnv;
        }
      }
    });

    it('should NOT use CF-Connecting-IP when TRUST_CLOUDFLARE is not enabled', () => {
      // Ensure env var is not set
      const originalEnv = process.env['TRUST_CLOUDFLARE'];
      delete process.env['TRUST_CLOUDFLARE'];

      try {
        const mockContext = {
          req: {
            header: vi.fn((name: string) => {
              if (name === 'cf-connecting-ip') return '198.51.100.25';
              return undefined;
            }),
          },
          env: {},
        };
        // Should return 'unknown' when CF is not trusted
        expect(getClientIp(mockContext as any)).toBe('unknown');
      } finally {
        // Restore original env var
        if (originalEnv !== undefined) {
          process.env['TRUST_CLOUDFLARE'] = originalEnv;
        }
      }
    });

    it('should extract first IP from X-Forwarded-For chain', () => {
      const mockContext = {
        req: {
          header: vi.fn((name: string) => {
            if (name === 'x-forwarded-for') return '203.0.113.50, 10.0.0.5, 10.0.0.6';
            return undefined;
          }),
        },
        env: { incoming: { socket: { remoteAddress: '10.0.0.7' } } },
      };
      expect(getClientIp(mockContext as any)).toBe('203.0.113.50');
    });
  });
});
