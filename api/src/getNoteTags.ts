import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getPool } from './_rds';
import { logger } from './_logger';

/**
 * GET /notes/{id}/tags
 * Returns the tags for a specific note — a simple JOIN query.
 */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const start = Date.now();
  const noteId = event.pathParameters?.id;

  if (!noteId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing note id' }) };
  }

  try {
    const result = await getPool().query<{ name: string }>(
      `SELECT t.name
       FROM tags t
       JOIN note_tags nt ON t.id = nt.tag_id
       WHERE nt.note_id = $1
       ORDER BY t.name ASC`,
      [noteId],
    );

    logger.info('get note tags', { noteId, count: result.rows.length, durationMs: Date.now() - start });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.rows.map(r => r.name)),
    };
  } catch (err) {
    logger.error('get note tags failed', { error: String(err), noteId, durationMs: Date.now() - start });
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
}
