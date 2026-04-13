import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { ConnectionPool } from './ts-client/connection-pool.js';
import { BotEngine } from './bot-engine/engine.js';
import { VoiceBotManager } from './voice/voice-bot-manager.js';
import { MusicCommandHandler } from './voice/music-command-handler.js';
import { config } from './config.js';
import { setYtCookieFile } from './voice/audio/youtube.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

async function main() {
  // C1: JWT secret startup guard
  if (config.jwtSecret === 'dev-secret-change-me-in-production') {
    if (config.nodeEnv === 'production') {
      logger.error('[FATAL] JWT_SECRET is set to the default value. Set a secure JWT_SECRET environment variable before running in production.');
      process.exit(1);
    }
    logger.warn('[WARN] JWT_SECRET is using the default development value. Set JWT_SECRET in production!');
  }

  // Configure yt-dlp cookie file: env var takes priority, then saved file from data dir
  const cookiePath = process.env.YT_COOKIE_FILE;
  const savedCookiePath = path.resolve('data', 'yt-cookies.txt');
  if (cookiePath && fs.existsSync(cookiePath)) {
    setYtCookieFile(cookiePath);
    logger.info(`[yt-dlp] Using cookie file (env): ${cookiePath}`);
  } else if (fs.existsSync(savedCookiePath)) {
    setYtCookieFile(savedCookiePath);
    logger.info(`[yt-dlp] Using saved cookie file: ${savedCookiePath}`);
  } else if (cookiePath) {
    logger.warn(`[yt-dlp] Cookie file not found: ${cookiePath}`);
  }

  const dbUrl = process.env.DATABASE_URL ?? 'file:./data/ts6manager.db';
  logger.info(`[Startup] DB url: ${dbUrl}`);
  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  logger.info('[Startup] Adapter created, initializing PrismaClient...');
  const prisma = new PrismaClient({ adapter });
  logger.info('[Startup] PrismaClient ready, creating Express app...');
  const app = createApp();
  const server = createServer(app);
  logger.info('[Startup] HTTP server created, setting up WebSocket...');

  // H3: WebSocket with JWT authentication
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: ({ req }, done) => {
      try {
        const wsUrl = new URL(req.url!, `http://${req.headers.host}`);
        const token = wsUrl.searchParams.get('token');
        if (!token) return done(false, 401, 'Missing token');
        jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
        done(true);
      } catch {
        done(false, 401, 'Invalid token');
      }
    },
  });

  // Initialize TS connection pool
  logger.info('[Startup] Initializing connection pool...');
  const connectionPool = new ConnectionPool(prisma);
  await connectionPool.initialize();
  logger.info('[Startup] Connection pool ready.');

  // Make services available via app.locals
  app.locals.prisma = prisma;
  app.locals.connectionPool = connectionPool;
  app.locals.wss = wss;

  // Initialize Bot Engine
  const botEngine = new BotEngine(prisma, connectionPool, wss, app);
  app.locals.botEngine = botEngine;
  await botEngine.start();

  // Initialize Voice Bot Manager (Music Bots)
  const voiceBotManager = new VoiceBotManager(prisma, wss);
  app.locals.voiceBotManager = voiceBotManager;
  await voiceBotManager.start();

  // Wire VoiceBotManager into BotEngine for voice action nodes in flows
  botEngine.setVoiceBotManager(voiceBotManager);

  // Wire Music Command Handler for text-based music bot control (!radio, !play, etc.)
  // Listens directly on each VoiceBot's TS3 connection (no SSH needed)
  const musicCommandHandler = new MusicCommandHandler(prisma, voiceBotManager);
  voiceBotManager.setMusicCommandHandler(musicCommandHandler);

  server.listen(config.port, () => {
    logger.info(`[TS6 WebUI] Backend running on http://localhost:${config.port}`);
    logger.info(`[TS6 WebUI] WebSocket available at ws://localhost:${config.port}/ws`);
    logger.info(`[TS6 WebUI] Environment: ${config.nodeEnv}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('\n[TS6 WebUI] Shutting down...');
    await voiceBotManager.stopAll();
    botEngine.destroy();
    connectionPool.destroy();
    wss.close();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  // Use console.error as fallback — pino drops Error objects when passed as extra args
  console.error('[FATAL] Failed to start server:', err);
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
