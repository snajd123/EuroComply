// Shared types and utilities

export * from './constants.js';
export * from './authorities.js';
export * from './product.js';
export * from './operations-events.js';
export * from './forensic.js';
export * from './timestamp.js';
export * from './status-list-bitstring.js';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function err(code: string, message: string, details?: Record<string, unknown>): ApiResponse<never> {
  return { success: false, error: { code, message, details } };
}
