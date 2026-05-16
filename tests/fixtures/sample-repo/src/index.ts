import { db } from './db';
import { startServer } from './server';

export async function main(): Promise<void> {
  await db.connect();
  await startServer();
}
