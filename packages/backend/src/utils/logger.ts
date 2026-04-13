import pino from 'pino';

const usePretty = process.env.NODE_ENV !== 'production' || process.env.LOG_PRETTY === 'true';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: usePretty
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
