import { Signer } from '@aws-sdk/rds-signer';

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
  const signer = new Signer({
    hostname: config.hostname,
    port: config.port,
    username: config.username,
    region: config.region,
  });

  return signer.getAuthToken();
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
  const config = getRdsIamConfig();
  if (!config) {
    throw new Error(
      'Missing required environment variables for IAM auth: DB_HOST, DB_PORT, DB_USER, AWS_REGION'
    );
  }

  const dbName = process.env['DB_NAME'] || 'eurocomply';
  const token = await generateRdsAuthToken(config);

  // URL-encode the token (it contains special characters)
  const encodedToken = encodeURIComponent(token);

  // IAM auth requires SSL
  return `postgresql://${config.username}:${encodedToken}@${config.hostname}:${config.port}/${dbName}?sslmode=require`;
}
