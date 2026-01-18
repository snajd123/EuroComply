import { describe, it, expect } from 'vitest';
import {
  DPP_CONTENT_TYPES,
  negotiateContentType,
} from './content-negotiation.js';

describe('DPP_CONTENT_TYPES', () => {
  it('defines credential configuration', () => {
    expect(DPP_CONTENT_TYPES.credential).toEqual({
      file: 'credential.json',
      contentType: 'application/vc+ld+json',
    });
  });

  it('defines preview configuration', () => {
    expect(DPP_CONTENT_TYPES.preview).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('defines qr configuration', () => {
    expect(DPP_CONTENT_TYPES.qr).toEqual({
      file: 'qr.png',
      contentType: 'image/png',
    });
  });
});

describe('negotiateContentType', () => {
  it('returns credential.json for application/vc+ld+json', () => {
    const result = negotiateContentType('application/vc+ld+json');
    expect(result).toEqual({
      file: 'credential.json',
      contentType: 'application/vc+ld+json',
    });
  });

  it('returns credential.json for application/json', () => {
    const result = negotiateContentType('application/json');
    expect(result).toEqual({
      file: 'credential.json',
      contentType: 'application/vc+ld+json',
    });
  });

  it('returns preview.html for text/html', () => {
    const result = negotiateContentType('text/html');
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('returns preview.html for application/xhtml+xml', () => {
    const result = negotiateContentType('application/xhtml+xml');
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('returns qr.png for image/png', () => {
    const result = negotiateContentType('image/png');
    expect(result).toEqual({
      file: 'qr.png',
      contentType: 'image/png',
    });
  });

  it('returns preview.html as default for */*', () => {
    const result = negotiateContentType('*/*');
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('returns preview.html for browser Accept header', () => {
    // Typical browser Accept header
    const browserAccept =
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8';
    const result = negotiateContentType(browserAccept);
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('returns preview.html when no Accept header (undefined)', () => {
    const result = negotiateContentType(undefined);
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  it('returns preview.html for empty Accept header', () => {
    const result = negotiateContentType('');
    expect(result).toEqual({
      file: 'preview.html',
      contentType: 'text/html',
    });
  });

  describe('quality value parsing', () => {
    it('respects quality values and picks highest priority', () => {
      // JSON has higher priority than HTML
      const result = negotiateContentType(
        'text/html;q=0.5,application/json;q=0.9'
      );
      expect(result).toEqual({
        file: 'credential.json',
        contentType: 'application/vc+ld+json',
      });
    });

    it('treats missing quality value as 1.0', () => {
      // text/html without q value should be treated as q=1.0
      const result = negotiateContentType('application/json;q=0.5,text/html');
      expect(result).toEqual({
        file: 'preview.html',
        contentType: 'text/html',
      });
    });

    it('handles complex Accept header with multiple quality values', () => {
      const result = negotiateContentType(
        'image/png;q=0.1,text/html;q=0.5,application/vc+ld+json;q=0.9'
      );
      expect(result).toEqual({
        file: 'credential.json',
        contentType: 'application/vc+ld+json',
      });
    });
  });
});
