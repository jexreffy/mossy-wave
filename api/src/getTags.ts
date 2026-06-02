import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getPool } from './_rds';
import { logger } from './_logger';

/**
 * GET /tags
 * Returns all tags with usage counts, ordered by most-used.
 * This query demonstrates SQL's strength over NoSQL for aggregations:
 *   SELECT t.name, COUNT(*) FROM tags t JOIN note_tags nt ... GROUP BY t.name ORDER BY count DESC
 */
export async function handler(_event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const start = Date.now();
  try {
    const result = await getPool().query<{ name: string; count: string }>(`
      SELECT t.name, COUNT(nt.note_id)::int AS count
      FROM tags t
      LEFT JOIN note_tags nt ON t.id = nt.tag_id
      GROUP BY t.name
      ORDER BY count DESC, t.name ASC
      LIMIT 30
    `);

    logger.info('get tags', { tagCount: result.rows.length, durationMs: Date.now() - start });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.rows),
    };
  } catch (err) {
    logger.error('get tags failed', { error: String(err), durationMs: Date.now() - start });
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
}
