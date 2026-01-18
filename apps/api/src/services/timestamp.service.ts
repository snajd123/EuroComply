import { createHash } from 'crypto';
import { AsnConvert } from '@peculiar/asn1-schema';
import { TimeStampResp, PKIStatus } from '@peculiar/asn1-tsp';
import { SignedData } from '@peculiar/asn1-cms';
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

    // Create timestamp request (RFC 3161 TimeStampReq)
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
        body: Buffer.from(tsRequest),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TSA request failed: ${response.statusText}`);
      }

      const tsResponseBuffer = await response.arrayBuffer();
      const token = Buffer.from(tsResponseBuffer).toString('base64');

      // Parse the actual timestamp from the TSA response
      const timestamp = this.parseTimestampFromResponse(tsResponseBuffer);

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
   * Create ASN.1 DER encoded timestamp request per RFC 3161.
   * Uses manual byte construction for simplicity and reliability.
   */
  private createTimestampRequest(hash: string): Uint8Array {
    const hashBytes = Buffer.from(hash, 'hex');

    // SHA-256 OID: 2.16.840.1.101.3.4.2.1
    const sha256Oid = new Uint8Array([
      0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01,
    ]);

    // AlgorithmIdentifier ::= SEQUENCE { algorithm OID, parameters ANY OPTIONAL }
    const algorithmId = this.encodeSequence(
      new Uint8Array([...sha256Oid, 0x05, 0x00]) // OID + NULL parameters
    );

    // MessageImprint ::= SEQUENCE { hashAlgorithm AlgorithmIdentifier, hashedMessage OCTET STRING }
    const hashedMessage = new Uint8Array([0x04, hashBytes.length, ...hashBytes]);
    const messageImprint = this.encodeSequence(
      new Uint8Array([...algorithmId, ...hashedMessage])
    );

    // TimeStampReq ::= SEQUENCE { version INTEGER, messageImprint, ... }
    const version = new Uint8Array([0x02, 0x01, 0x01]); // INTEGER 1
    const certReq = new Uint8Array([0x01, 0x01, 0xff]); // BOOLEAN TRUE

    return this.encodeSequence(
      new Uint8Array([...version, ...messageImprint, ...certReq])
    );
  }

  /**
   * Encode content as ASN.1 SEQUENCE.
   */
  private encodeSequence(content: Uint8Array): Uint8Array {
    if (content.length < 128) {
      return new Uint8Array([0x30, content.length, ...content]);
    } else if (content.length < 256) {
      return new Uint8Array([0x30, 0x81, content.length, ...content]);
    } else {
      return new Uint8Array([
        0x30,
        0x82,
        content.length >> 8,
        content.length & 0xff,
        ...content,
      ]);
    }
  }

  /**
   * Parse the genTime (timestamp) from a TimeStampResp.
   */
  private parseTimestampFromResponse(responseBuffer: ArrayBuffer): string {
    try {
      const tsResponse = AsnConvert.parse(responseBuffer, TimeStampResp);

      // Check status
      const status = tsResponse.status.status;
      if (status !== PKIStatus.granted && status !== PKIStatus.grantedWithMods) {
        const statusString = tsResponse.status.statusString?.join(', ') ?? 'Unknown error';
        throw new Error(`TSA returned error status ${status}: ${statusString}`);
      }

      // Extract the TSTInfo from the signed content
      const timeStampToken = tsResponse.timeStampToken;
      if (!timeStampToken) {
        throw new Error('No timestamp token in TSA response');
      }

      // Get the encapsulated content (TSTInfo)
      // Parse the SignedData content from the timestamp token
      const signedData = AsnConvert.parse(timeStampToken.content, SignedData);
      const encapContent = signedData.encapContentInfo;
      if (!encapContent?.eContent) {
        throw new Error('No encapsulated content in timestamp token');
      }

      // Extract genTime from TSTInfo
      const genTime = this.extractGenTimeFromTSTInfo(encapContent.eContent);
      return genTime;
    } catch (error) {
      throw new Error(
        `Failed to parse timestamp response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract genTime from TSTInfo ASN.1 structure.
   * Searches for GeneralizedTime (tag 0x18) in the structure.
   */
  private extractGenTimeFromTSTInfo(tstInfoBytes: ArrayBuffer): string {
    const bytes = new Uint8Array(tstInfoBytes);

    for (let i = 0; i < bytes.length - 15; i++) {
      if (bytes[i] === 0x18) {
        // GeneralizedTime tag
        const length = bytes[i + 1];
        if (length && length >= 14 && length <= 20) {
          const timeBytes = bytes.slice(i + 2, i + 2 + length);
          const timeStr = String.fromCharCode(...timeBytes);
          // Convert GeneralizedTime (YYYYMMDDHHMMSSZ) to ISO format
          if (timeStr.match(/^\d{14}(\.\d+)?Z?$/)) {
            const year = timeStr.slice(0, 4);
            const month = timeStr.slice(4, 6);
            const day = timeStr.slice(6, 8);
            const hour = timeStr.slice(8, 10);
            const minute = timeStr.slice(10, 12);
            const second = timeStr.slice(12, 14);
            const fraction = timeStr.includes('.')
              ? timeStr.slice(14).replace('Z', '')
              : '';
            return `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}Z`;
          }
        }
      }
    }

    throw new Error('Could not find genTime in TSTInfo');
  }

  /**
   * Create deterministic SHA-256 hash of a JSON payload.
   * Uses recursive key sorting for canonical JSON serialization.
   */
  static hashPayload(payload: Record<string, unknown>): string {
    if (payload === null || payload === undefined) {
      throw new Error('Cannot hash null or undefined payload');
    }
    if (typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Payload must be a plain object');
    }
    const canonical = JSON.stringify(TimestampService.sortObjectKeys(payload));
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Recursively sort object keys for deterministic serialization.
   */
  private static sortObjectKeys(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => TimestampService.sortObjectKeys(item));
    }
    if (typeof obj === 'object') {
      const sorted: Record<string, unknown> = {};
      const keys = Object.keys(obj as Record<string, unknown>).sort();
      for (const key of keys) {
        sorted[key] = TimestampService.sortObjectKeys(
          (obj as Record<string, unknown>)[key]
        );
      }
      return sorted;
    }
    return obj;
  }

  /**
   * Verify an RFC3161 timestamp token.
   * Parses the token, checks status, and extracts the timestamp.
   */
  async verifyTimestamp(
    token: string,
    originalHash: string
  ): Promise<{ valid: boolean; timestamp: string; error?: string }> {
    try {
      const tokenBuffer = Buffer.from(token, 'base64');
      const tsResponse = AsnConvert.parse(tokenBuffer, TimeStampResp);

      // Check status
      const status = tsResponse.status.status;
      if (status !== PKIStatus.granted && status !== PKIStatus.grantedWithMods) {
        return {
          valid: false,
          timestamp: '',
          error: `Invalid TSA status: ${status}`,
        };
      }

      const timeStampToken = tsResponse.timeStampToken;
      if (!timeStampToken) {
        return {
          valid: false,
          timestamp: '',
          error: 'No timestamp token in response',
        };
      }

      // Extract timestamp
      const encapContent = timeStampToken.content.encapContentInfo;
      if (!encapContent?.eContent) {
        return {
          valid: false,
          timestamp: '',
          error: 'No encapsulated content',
        };
      }

      const timestamp = this.extractGenTimeFromTSTInfo(encapContent.eContent);

      return {
        valid: true,
        timestamp,
      };
    } catch (error) {
      return {
        valid: false,
        timestamp: '',
        error: error instanceof Error ? error.message : 'Unknown verification error',
      };
    }
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
