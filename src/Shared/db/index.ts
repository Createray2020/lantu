// Shared/db Contract：對外只暴露 db 與 schema。
export { db, schema } from './client';
export * as tables from './schema';
