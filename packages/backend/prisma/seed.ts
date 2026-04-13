import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';

const dbUrl = process.env.DATABASE_URL ?? 'file:///home/container/data/ts6webui.db';
const dbPath = dbUrl.replace(/^file:\/\//, '');
const db = new Database(dbPath);
db.pragma('journal_mode = MEMORY');
const adapter = new PrismaBetterSqlite3(db);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed default app settings (no default admin — use /setup wizard instead)
  await prisma.appSetting.upsert({
    where: { key: 'max_music_bots' },
    update: {},
    create: { key: 'max_music_bots', value: '5' },
  });

  console.log('Seed completed: app settings created. Visit /setup to create your admin account.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
