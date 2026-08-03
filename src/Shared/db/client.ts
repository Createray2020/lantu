// Neon (HTTP) + Drizzle client。相容雲端/無伺服器環境。
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL 未設定（請確認 .env.local）');
}

const sql = neon(url);
export const db = drizzle(sql, { schema });
export { schema };
