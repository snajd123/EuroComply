export class WaltIdError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'WaltIdError';
  }
}

export class WaltIdConnectionError extends WaltIdError {
  constructor(service: string, cause?: Error) {
    super(
      `Failed to connect to walt.id ${service}`,
      'CONNECTION_ERROR',
      undefined,
      { service, cause: cause?.message }
    );
    this.name = 'WaltIdConnectionError';
  }
}

export class WaltIdSigningError extends WaltIdError {
  constructor(message: string, keyId?: string) {
    super(message, 'SIGNING_ERROR', undefined, { keyId });
    this.name = 'WaltIdSigningError';
  }
}

export class WaltIdKeyNotFoundError extends WaltIdError {
  constructor(keyId: string) {
    super(`Key not found: ${keyId}`, 'KEY_NOT_FOUND', 404, { keyId });
    this.name = 'WaltIdKeyNotFoundError';
  }
}

export class WaltIdVerificationError extends WaltIdError {
  constructor(message: string, checks?: Record<string, boolean>) {
    super(message, 'VERIFICATION_ERROR', undefined, { checks });
    this.name = 'WaltIdVerificationError';
  }
}
