import { db } from './db';

interface Router {
  get(path: string, handler: () => unknown): void;
  post(path: string, handler: () => unknown): void;
}

declare const app: Router;

export async function startServer(): Promise<void> {
  app.get('/users', () => db.query('select * from users'));
  app.post('/users', () => db.query('insert into users'));
}
