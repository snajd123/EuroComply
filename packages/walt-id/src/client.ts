import {
  type WaltIdConfig,
  type CreateDidRequest,
  type CreateDidResponse,
  type SignRequest,
  type SignResponse,
  type IssueVcRequest,
  type IssueVcResponse,
  type VerifyRequest,
  type VerifyResponse,
  type KeyMetadata,
  WaltIdConfigSchema,
} from './types.js';
import {
  WaltIdError,
  WaltIdConnectionError,
  WaltIdSigningError,
  WaltIdKeyNotFoundError,
} from './errors.js';

export class WaltIdClient {
  private readonly config: WaltIdConfig;

  constructor(config: WaltIdConfig) {
    this.config = WaltIdConfigSchema.parse(config);
  }

  // ============================================
  // DID OPERATIONS (Core API)
  // ============================================

  async createDid(request: CreateDidRequest): Promise<CreateDidResponse> {
    return this.post<CreateDidResponse>(
      `${this.config.coreApiUrl}/v1/did/create`,
      {
        method: request.method,
        keyAlgorithm: request.keyAlgorithm,
      }
    );
  }

  async resolveDid(did: string): Promise<CreateDidResponse['didDocument']> {
    return this.get<CreateDidResponse['didDocument']>(
      `${this.config.coreApiUrl}/v1/did/resolve/${encodeURIComponent(did)}`
    );
  }

  // ============================================
  // KEY OPERATIONS (Custodian)
  // ============================================

  async getKey(keyId: string): Promise<KeyMetadata> {
    try {
      return await this.get<KeyMetadata>(
        `${this.config.custodianUrl}/v1/keys/${keyId}`
      );
    } catch (error) {
      if (error instanceof WaltIdError && error.statusCode === 404) {
        throw new WaltIdKeyNotFoundError(keyId);
      }
      throw error;
    }
  }

  async listKeys(): Promise<KeyMetadata[]> {
    return this.get<KeyMetadata[]>(
      `${this.config.custodianUrl}/v1/keys`
    );
  }

  async deleteKey(keyId: string): Promise<void> {
    await this.delete(`${this.config.custodianUrl}/v1/keys/${keyId}`);
  }

  // ============================================
  // SIGNING OPERATIONS (Signatory)
  // ============================================

  async sign(request: SignRequest): Promise<SignResponse> {
    try {
      return await this.post<SignResponse>(
        `${this.config.signatoryUrl}/v1/credentials/sign`,
        {
          keyId: request.keyId,
          payload: request.payload,
          proofType: request.proofType,
          proofPurpose: request.proofPurpose ?? 'assertionMethod',
        }
      );
    } catch (error) {
      // Preserve WaltIdError context (status codes, details)
      if (error instanceof WaltIdError) {
        throw error;
      }
      throw new WaltIdSigningError(
        error instanceof Error ? error.message : 'Signing failed',
        request.keyId
      );
    }
  }

  async issueVc(request: IssueVcRequest): Promise<IssueVcResponse> {
    return this.post<IssueVcResponse>(
      `${this.config.signatoryUrl}/v1/credentials/issue`,
      {
        issuerDid: request.issuerDid,
        issuerKeyId: request.issuerKeyId,
        subjectDid: request.subjectDid,
        type: request.credentialType,
        credentialSubject: request.credentialSubject,
        credentialStatus: request.credentialStatus,
        expirationDate: request.expirationDate,
      }
    );
  }

  // ============================================
  // VERIFICATION OPERATIONS (Auditor)
  // ============================================

  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    return this.post<VerifyResponse>(
      `${this.config.auditorUrl}/v1/verify`,
      {
        vcJwt: request.vcJwt,
        policies: request.policies,
      }
    );
  }

  // ============================================
  // HTTP HELPERS
  // ============================================

  private async post<T>(url: string, body: unknown): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
      },
      body: JSON.stringify(body),
    });
  }

  private async get<T>(url: string): Promise<T> {
    return this.request<T>(url, {
      method: 'GET',
      headers: {
        ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
      },
    });
  }

  private async delete(url: string): Promise<void> {
    await this.request<void>(url, {
      method: 'DELETE',
      headers: {
        ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey }),
      },
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');

          // Don't retry client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            throw new WaltIdError(
              `Request failed: ${response.statusText}`,
              'REQUEST_FAILED',
              response.status,
              errorBody
            );
          }

          // Retry server errors (5xx) unless last attempt
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          throw new WaltIdError(
            `Request failed after ${maxRetries + 1} attempts: ${response.statusText}`,
            'REQUEST_FAILED',
            response.status,
            errorBody
          );
        }

        return await response.json() as T;
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof WaltIdError) {
          throw error;
        }

        // Retry network errors unless last attempt
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          throw new WaltIdConnectionError('timeout');
        }
        throw new WaltIdConnectionError(
          url,
          error instanceof Error ? error : undefined
        );
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new WaltIdConnectionError(url);
  }
}

// Factory function for creating client from environment
export function createWaltIdClient(env?: {
  WALTID_CORE_URL?: string;
  WALTID_SIGNATORY_URL?: string;
  WALTID_CUSTODIAN_URL?: string;
  WALTID_AUDITOR_URL?: string;
  WALTID_API_KEY?: string;
}): WaltIdClient {
  const config = {
    coreApiUrl: env?.WALTID_CORE_URL ?? 'http://localhost:7000',
    signatoryUrl: env?.WALTID_SIGNATORY_URL ?? 'http://localhost:7001',
    custodianUrl: env?.WALTID_CUSTODIAN_URL ?? 'http://localhost:7002',
    auditorUrl: env?.WALTID_AUDITOR_URL ?? 'http://localhost:7003',
    apiKey: env?.WALTID_API_KEY,
    timeout: 30000,
  };

  // Block HTTP URLs in production (security requirement)
  const isProduction = process.env['NODE_ENV'] === 'production';
  const allowInsecure = process.env['WALTID_ALLOW_INSECURE'] === 'true';

  const urls = [config.coreApiUrl, config.signatoryUrl, config.custodianUrl, config.auditorUrl];
  const insecureUrls = urls.filter((url) => url.startsWith('http://'));

  if (insecureUrls.length > 0) {
    if (isProduction && !allowInsecure) {
      throw new Error(
        '[WaltIdClient] SECURITY ERROR: HTTP URLs are not allowed in production. ' +
        'Configure HTTPS URLs or set WALTID_ALLOW_INSECURE=true (not recommended): ' +
        insecureUrls.join(', ')
      );
    }

    if (process.env['NODE_ENV'] !== 'development' && process.env['NODE_ENV'] !== 'test') {
      console.warn(
        '[WaltIdClient] WARNING: Using insecure HTTP URLs. ' +
        'Configure HTTPS URLs for production: ' + insecureUrls.join(', ')
      );
    }
  }

  return new WaltIdClient(config);
}
