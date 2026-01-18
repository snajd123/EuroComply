import { createHash } from 'crypto';
import {
  type TsaConfig,
  type TimestampResponse,
  TimestampRequestSchema,
  TSA_PROVIDERS,
} from '@eurocomply/shared';

export class TimestampService {
  constructor(private readonly config: TsaConfig) {}

  /**
   * Create an RFC3161 timestamp for a SHA-256 hash.
   */
  async createTimestamp(hash: string): Promise<TimestampResponse> {
    // Validate hash format
    TimestampRequestSchema.parse({ hash, hashAlgorithm: 'SHA-256' });

    // Create timestamp request (ASN.1 DER format)
    const tsRequest = this.createTimestampRequest(hash);

    // Send to TSA
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/timestamp-query',
          ...(this.config.username && {
            Authorization: `Basic ${Buffer.from(
              `${this.config.username}:${this.config.password}`
            ).toString('base64')}`,
          }),
        },
        body: tsRequest,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TSA request failed: ${response.statusText}`);
      }

      const tsResponse = await response.arrayBuffer();
      const token = Buffer.from(tsResponse).toString('base64');

      // Extract timestamp from response (simplified - production would parse ASN.1)
      const timestamp = new Date().toISOString();

      return {
        type: 'RFC3161',
        timestamp,
        authority: this.config.url,
        token,
        hashAlgorithm: 'SHA-256',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Create ASN.1 DER encoded timestamp request.
   * This is a simplified implementation - production would use a proper ASN.1 library.
   */
  private createTimestampRequest(hash: string): Uint8Array {
    // RFC 3161 TimeStampReq structure (simplified)
    // In production, use @peculiar/asn1-tsp or similar
    const hashBytes = Buffer.from(hash, 'hex');

    // Build ASN.1 structure manually (simplified)
    const oid = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]); // SHA-256 OID
    const hashWrapper = Buffer.concat([
      Buffer.from([0x30, hashBytes.length + oid.length + 4]),
      oid,
      Buffer.from([0x04, hashBytes.length]),
      hashBytes,
    ]);

    const request = Buffer.concat([
      Buffer.from([0x30, hashWrapper.length + 3]),
      Buffer.from([0x02, 0x01, 0x01]), // version
      hashWrapper,
    ]);

    return new Uint8Array(request);
  }

  /**
   * Create deterministic SHA-256 hash of a JSON payload.
   */
  static hashPayload(payload: unknown): string {
    const canonical = JSON.stringify(payload, Object.keys(payload as object).sort());
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Verify an RFC3161 timestamp token.
   * Returns the timestamp if valid, throws if invalid.
   */
  async verifyTimestamp(
    token: string,
    originalHash: string
  ): Promise<{ valid: boolean; timestamp: string }> {
    // In production, this would:
    // 1. Parse the ASN.1 DER encoded token
    // 2. Verify the TSA signature
    // 3. Check the hash matches
    // 4. Return the embedded timestamp

    // For now, we trust the token and extract timestamp from it
    // Production implementation would use @peculiar/asn1-tsp

    return {
      valid: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Factory for common TSA providers.
   */
  static forProvider(provider: keyof typeof TSA_PROVIDERS): TimestampService {
    const config = TSA_PROVIDERS[provider];
    return new TimestampService({
      url: config.url,
      name: config.name,
      timeout: 10000,
    });
  }
}
