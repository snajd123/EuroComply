import winston from 'winston';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  if (stack) {
    log += `\n${stack}`;
  }
  return log;
});

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true })
  ),
  defaultMeta: { service: 'eurocomply-api' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production'
          ? json()
          : combine(colorize(), devFormat),
    }),
  ],
});

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: json(),
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: json(),
    })
  );
}

export default logger;
