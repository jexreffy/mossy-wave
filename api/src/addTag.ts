import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getPool } from './_rds';
import { logger } from './_logger';

/**
 * POST /notes/{id}/tags
 * Body: { tag: string }
 *
 * INSERT INTO tags ... ON CONFLICT DO NOTHING  ← upsert pattern
 * INSERT INTO note_tags ...                    ← many-to-many join
 *
 * This demonstrates a transaction and upsert — patterns that are
 * natural in SQL but awkward to replicate in DynamoDB.
 */
export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const start = Date.now();
  const noteId = event.pathParameters?.id;
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub ?? '';

  if (!noteId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing note id' }) };
  }

  let body: { tag?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const tag = body.tag?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!tag || tag.length < 1 || tag.length > 30) {
    return { statusCode: 422, body: JSON.stringify({ error: 'tag must be 1-30 alphanumeric/hyphen characters' }) };
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert tag — get or create
    const tagResult = await client.query<{ id: number }>(
      `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tag],
    );
    const tagId = tagResult.rows[0].id;

    // Add to note_tags (ignore if already exists)
    await client.query(
      `INSERT INTO note_tags (note_id, tag_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [noteId, tagId],
    );

    await client.query('COMMIT');
    logger.info('tag added', { noteId, tag, userId, durationMs: Date.now() - start });

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('add tag failed', { error: String(err), noteId, tag, userId, durationMs: Date.now() - start });
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  } finally {
    client.release();
  }
}
