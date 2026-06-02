import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { getPool } from './_rds';
import { logger } from './_logger';

/**
 * DELETE /notes/{id}/tags/{tag}
 */
export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const start = Date.now();
  const noteId = event.pathParameters?.id;
  const tag = event.pathParameters?.tag;
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub ?? '';

  if (!noteId || !tag) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing note id or tag' }) };
  }

  try {
    const result = await getPool().query(
      `DELETE FROM note_tags
       WHERE note_id = $1
         AND tag_id = (SELECT id FROM tags WHERE name = $2)`,
      [noteId, tag.toLowerCase()],
    );

    if (result.rowCount === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Tag not found on note' }) };
    }

    logger.info('tag removed', { noteId, tag, userId, durationMs: Date.now() - start });
    return { statusCode: 204, body: '' };
  } catch (err) {
    logger.error('remove tag failed', { error: String(err), noteId, tag, userId, durationMs: Date.now() - start });
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
}
