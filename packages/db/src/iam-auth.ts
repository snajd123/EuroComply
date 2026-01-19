import { Signer } from '@aws-sdk/rds-signer';

// =============================================================================
// Debug Logging
// =============================================================================

const DEBUG = process.env['DEBUG'] === 'true' || process.env['NODE_ENV'] === 'development';

function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
}

/**
 * Configuration for RDS IAM authentication.
 */
export interface RdsIamConfig {
  hostname: string;
  port: number;
  username: string;
  region: string;
}

/**
 * Generates an IAM authentication token for RDS.
 * Token is valid for 15 minutes.
 *
 * @see https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html
 */
export async function generateRdsAuthToken(config: RdsIamConfig): Promise<string> {
  debugLog(`[RDS IAM] Generating token for ${config.username}@${config.hostname}:${config.port} in ${config.region}`);

  try {
    const signer = new Signer({
      hostname: config.hostname,
      port: config.port,
      username: config.username,
      region: config.region,
    });

    const token = await signer.getAuthToken();
    debugLog(`[RDS IAM] Token generated successfully (length: ${token.length})`);
    return token;
  } catch (error) {
    console.error('[RDS IAM] Failed to generate token:', error);
    throw error;
  }
}

/**
 * Checks if IAM authentication is enabled via environment variables.
 */
export function isIamAuthEnabled(): boolean {
  return process.env['DB_IAM_AUTH'] === 'true';
}

/**
 * Gets RDS IAM configuration from environment variables.
 * Returns null if not all required variables are set.
 */
export function getRdsIamConfig(): RdsIamConfig | null {
  const hostname = process.env['DB_HOST'];
  const port = process.env['DB_PORT'];
  const username = process.env['DB_USER'];
  const region = process.env['AWS_REGION'];

  if (!hostname || !port || !username || !region) {
    return null;
  }

  return {
    hostname,
    port: parseInt(port, 10),
    username,
    region,
  };
}

/**
 * Builds a PostgreSQL connection URL with IAM authentication token.
 * Includes SSL requirement (mandatory for IAM auth).
 */
export async function buildIamDatabaseUrl(): Promise<string> {
  debugLog('[RDS IAM] Building database URL with IAM authentication...');

  const config = getRdsIamConfig();
  if (!config) {
    const error = 'Missing required environment variables for IAM auth: DB_HOST, DB_PORT, DB_USER, AWS_REGION';
    console.error('[RDS IAM]', error);
    throw new Error(error);
  }

  debugLog('[RDS IAM] Config:', {
    hostname: config.hostname,
    port: config.port,
    username: config.username,
    region: config.region,
  });

  const dbName = process.env['DB_NAME'] || 'eurocomply';
  const token = await generateRdsAuthToken(config);

  // URL-encode the token (it contains special characters)
  const encodedToken = encodeURIComponent(token);

  const url = `postgresql://${config.username}:${encodedToken}@${config.hostname}:${config.port}/${dbName}?sslmode=require`;
  debugLog(`[RDS IAM] Database URL built (token length: ${token.length}, URL length: ${url.length})`);

  return url;
}
