import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

if (process.env.NODE_ENV === 'production' && jwtSecret === 'dev-secret-change-me-in-production') {
  // Use console.error here intentionally — logger may not be initialized before config loads
  console.error('[Config] FATAL: JWT_SECRET is not set. Set it in your environment. Exiting.');
  process.exit(1);
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./data/ts6webui.db',
  jwtSecret,
  jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  tsAllowSelfSigned: process.env.TS_ALLOW_SELF_SIGNED === 'true' || process.env.TS_ALLOW_SELF_SIGNED === '1',
};
