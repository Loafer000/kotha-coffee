import fs from 'fs';
import path from 'path';
import { createClient, type Client } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

let clientInstance: Client | null = null;

/**
 * Returns the active LibSQL / SQLite database client.
 * In local mode (DATABASE_URL unset or starts with 'file:' or ':memory:'),
 * connects to local SQLite file (data/kotha.db) or in-memory.
 * In cloud mode (DATABASE_URL starting with libsql://), connects using DATABASE_AUTH_TOKEN.
 */
export function getDbClient(): Client {
  if (clientInstance) {
    return clientInstance;
  }

  const rawUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

  if (!rawUrl || rawUrl.trim() === '' || rawUrl.startsWith('file:') || rawUrl === ':memory:') {
    let fileUrl: string;

    if (rawUrl === ':memory:' || rawUrl === 'file::memory:') {
      fileUrl = 'file::memory:';
    } else if (rawUrl && rawUrl.startsWith('file:')) {
      fileUrl = rawUrl;
      const filePath = rawUrl.replace('file:', '');
      const dir = path.dirname(filePath);
      if (dir && dir !== '.' && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } else {
      // Default local SQLite file: data/kotha.db
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dbPath = path.join(dataDir, 'kotha.db').replace(/\\/g, '/');
      fileUrl = `file:${dbPath}`;
    }

    clientInstance = createClient({
      url: fileUrl
    });
    // Ensure WAL mode and busy timeout are configured on local SQLite connections
    configureLocalPragmas(clientInstance).catch(() => {});
  } else {
    // Turso cloud / remote LibSQL mode
    clientInstance = createClient({
      url: rawUrl,
      authToken: authToken
    });
  }

  return clientInstance;
}

/**
 * Configures PRAGMA journal_mode = WAL and PRAGMA busy_timeout = 5000 on local SQLite connections.
 */
export async function configureLocalPragmas(client: Client): Promise<void> {
  try {
    await client.execute('PRAGMA journal_mode = WAL;');
    await client.execute('PRAGMA busy_timeout = 5000;');
  } catch {
    // In-memory or remote engines may not support or require local pragmas
  }
}

/**
 * Allows overriding or resetting the client instance (useful for unit testing with in-memory DB)
 */
export function setDbClient(client: Client | null): void {
  clientInstance = client;
}

/**
 * Closes the active database connection
 */
export async function closeDbClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.close();
    clientInstance = null;
  }
}
