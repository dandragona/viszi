export const db = {
  async connect(): Promise<void> {
    /* pretend to connect */
  },
  async query(_sql: string): Promise<unknown[]> {
    return [];
  },
};
