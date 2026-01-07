/**
 * QR Service Tests
 * Tests for QR code generation
 */

import { describe, it, expect } from 'vitest';
import { qrService } from './qr.service.js';

// ===========================================
// DATA URL GENERATION TESTS
// ===========================================

describe('qrService.generate (Data URL)', () => {
  it('should generate a data URL QR code', async () => {
    const data = 'https://eurocomply.io/verify/pass_123';
    const result = await qrService.generate(data);

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('should generate valid base64 data', async () => {
    const data = 'test-data';
    const result = await qrService.generate(data);

    const base64Part = result.replace('data:image/png;base64,', '');
    // Should be valid base64 (no errors when decoding)
    expect(() => Buffer.from(base64Part, 'base64')).not.toThrow();
  });

  it('should generate different QR codes for different data', async () => {
    const result1 = await qrService.generate('data1');
    const result2 = await qrService.generate('data2');

    expect(result1).not.toBe(result2);
  });

  it('should generate same QR code for same data', async () => {
    const data = 'https://eurocomply.io/verify/pass_123';
    const result1 = await qrService.generate(data);
    const result2 = await qrService.generate(data);

    expect(result1).toBe(result2);
  });

  it('should handle URL data', async () => {
    const url = 'https://api.eurocomply.io/v1/passports/pass_abc123/verify';
    const result = await qrService.generate(url);

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('should handle special characters', async () => {
    const data = 'https://example.com/path?param=value&other=123';
    const result = await qrService.generate(data);

    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('should handle unicode data', async () => {
    const data = 'Produkt: Baumwolle 100%';
    const result = await qrService.generate(data);

    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});

// ===========================================
// BUFFER GENERATION TESTS
// ===========================================

describe('qrService.generateBuffer (PNG)', () => {
  it('should generate a PNG buffer', async () => {
    const data = 'https://eurocomply.io/verify/pass_123';
    const result = await qrService.generateBuffer(data);

    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('should have PNG signature', async () => {
    const data = 'test';
    const result = await qrService.generateBuffer(data);

    // PNG files start with magic bytes: 89 50 4E 47
    const pngSignature = [0x89, 0x50, 0x4e, 0x47];
    const firstBytes = Array.from(result.subarray(0, 4));

    expect(firstBytes).toEqual(pngSignature);
  });

  it('should generate different buffers for different data', async () => {
    const buffer1 = await qrService.generateBuffer('data1');
    const buffer2 = await qrService.generateBuffer('data2');

    expect(buffer1.equals(buffer2)).toBe(false);
  });

  it('should generate same buffer for same data', async () => {
    const data = 'consistent-data';
    const buffer1 = await qrService.generateBuffer(data);
    const buffer2 = await qrService.generateBuffer(data);

    expect(buffer1.equals(buffer2)).toBe(true);
  });

  it('should handle long URLs', async () => {
    const longUrl = 'https://api.eurocomply.io/v1/passports/' + 'a'.repeat(100) + '/verify';
    const result = await qrService.generateBuffer(longUrl);

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ===========================================
// SVG GENERATION TESTS
// ===========================================

describe('qrService.generateSvg', () => {
  it('should generate SVG string', async () => {
    const data = 'https://eurocomply.io/verify/pass_123';
    const result = await qrService.generateSvg(data);

    expect(result).toContain('<svg');
    expect(result).toContain('</svg>');
  });

  it('should include viewBox attribute', async () => {
    const data = 'test';
    const result = await qrService.generateSvg(data);

    expect(result).toContain('viewBox');
  });

  it('should contain path elements', async () => {
    const data = 'test';
    const result = await qrService.generateSvg(data);

    expect(result).toContain('path');
  });

  it('should generate different SVGs for different data', async () => {
    const svg1 = await qrService.generateSvg('data1');
    const svg2 = await qrService.generateSvg('data2');

    expect(svg1).not.toBe(svg2);
  });

  it('should generate valid XML', async () => {
    const data = 'test';
    const result = await qrService.generateSvg(data);

    // Basic XML validation - should start with < and end with >
    expect(result.trim().startsWith('<')).toBe(true);
    expect(result.trim().endsWith('>')).toBe(true);
  });
});

// ===========================================
// OPTIONS TESTS
// ===========================================

describe('QR Options', () => {
  it('should use custom width', async () => {
    const smallQr = await qrService.generateBuffer('test', { width: 100 });
    const largeQr = await qrService.generateBuffer('test', { width: 500 });

    // Larger width = larger file size
    expect(largeQr.length).toBeGreaterThan(smallQr.length);
  });

  it('should support different error correction levels', async () => {
    const lowEc = await qrService.generateBuffer('test', { errorCorrectionLevel: 'L' });
    const highEc = await qrService.generateBuffer('test', { errorCorrectionLevel: 'H' });

    // Both should produce valid QR codes (size depends on compression)
    expect(lowEc).toBeInstanceOf(Buffer);
    expect(highEc).toBeInstanceOf(Buffer);
    expect(lowEc.length).toBeGreaterThan(0);
    expect(highEc.length).toBeGreaterThan(0);
  });

  it('should handle custom colors in data URL', async () => {
    const customColor = await qrService.generate('test', {
      color: {
        dark: '#FF0000',
        light: '#00FF00',
      },
    });

    expect(customColor).toMatch(/^data:image\/png;base64,/);
  });

  it('should handle custom margin', async () => {
    const smallMargin = await qrService.generateBuffer('test', { margin: 0 });
    const largeMargin = await qrService.generateBuffer('test', { margin: 10 });

    // Larger margin = larger image
    expect(largeMargin.length).toBeGreaterThan(smallMargin.length);
  });

  it('should apply default options when none provided', async () => {
    // Should not throw when no options provided
    const result = await qrService.generate('test');
    expect(result).toBeDefined();
  });

  it('should merge partial options with defaults', async () => {
    // Should work with only some options
    const result = await qrService.generate('test', { width: 400 });
    expect(result).toBeDefined();
  });
});

// ===========================================
// EDGE CASES
// ===========================================

describe('Edge Cases', () => {
  it('should reject empty string', async () => {
    // QRCode library throws for empty input
    await expect(qrService.generate('')).rejects.toThrow('No input text');
  });

  it('should handle very long data', async () => {
    // QR codes can hold up to ~3000 alphanumeric characters
    const longData = 'a'.repeat(1000);
    const result = await qrService.generate(longData);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('should handle JSON data', async () => {
    const jsonData = JSON.stringify({ productId: 'prod_123', verified: true });
    const result = await qrService.generate(jsonData);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('should handle GS1 Digital Link format', async () => {
    const gs1Link = 'https://id.gs1.org/01/08076800195057/10/LOT123';
    const result = await qrService.generate(gs1Link);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});
