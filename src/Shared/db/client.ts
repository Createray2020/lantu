// Neon (HTTP) + Drizzle client。相容雲端/無伺服器環境。
// 延遲初始化：連線只在「第一次實際查詢」時建立，避免在 build 收集頁面資料階段
// 於模組載入時就存取 DATABASE_URL 而失敗。
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | null = null;

function getDb(): DB {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 未設定（請確認環境變數）');
  _db = drizzle(neon(url), { schema });
  return _db;
}

// 以 Proxy 對外暴露 db：任何屬性存取都會觸發延遲建立，行為與原本的 db 相同。
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export { schema };
