import { Pool } from 'pg';
import { logger } from './_logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT ?? '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 1,                        // 1 connection per Lambda container — avoids overwhelming t3.micro
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: { rejectUnauthorized: false }, // RDS uses self-signed cert; production: use RDS CA bundle
    });

    pool.on('error', (err) => logger.error('pg pool error', { error: String(err) }));

    // Run schema migrations on first cold start — idempotent so safe to run every time
    pool.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id   SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS note_tags (
        note_id    VARCHAR(36) NOT NULL,
        tag_id     INTEGER     NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (note_id, tag_id)
      );

      CREATE INDEX IF NOT EXISTS note_tags_tag_id_idx ON note_tags(tag_id);
    `).then(() => {
      logger.info('db schema ready');
    }).catch(err => {
      logger.error('db migration failed', { error: String(err) });
    });
  }
  return pool;
}
