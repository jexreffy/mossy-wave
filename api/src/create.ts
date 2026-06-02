import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { db, TABLE } from './_db';

interface NoteInput {
  content: string;
  url?: string;
  imageKey?: string;
}

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  let body: NoteInput;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const content = body.content?.trim();
  if (!content || content.length > 500) {
    return { statusCode: 422, body: JSON.stringify({ error: 'content is required and must be <= 500 chars' }) };
  }

  // User identity comes from the validated Cognito JWT — no trusting client headers
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub ?? 'anonymous';

  const noteId = randomUUID();
  const createdAt = new Date().toISOString();

  const item = {
    noteId,
    dummy: 'NOTE',
    content,
    ...(body.url ? { url: body.url } : {}),
    ...(body.imageKey ? { imageKey: body.imageKey } : {}),
    userId,
    createdAt,
    // Auto-expire notes after 30 days
    ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };

  await db.send(new PutCommand({ TableName: TABLE, Item: item }));

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  };
}
