import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { logger } from './_logger';

const s3 = new S3Client({ region: process.env.REGION });
const BUCKET = process.env.IMAGES_BUCKET!;

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const start = Date.now();
  const userId = event.requestContext.authorizer?.jwt?.claims?.sub ?? 'anonymous';

  let body: { contentType?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    logger.warn('get upload url bad request', { reason: 'invalid JSON', userId });
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const contentType = body.contentType;
  if (!contentType || !ALLOWED_TYPES[contentType]) {
    logger.warn('get upload url bad request', { reason: 'invalid contentType', contentType, userId });
    return {
      statusCode: 422,
      body: JSON.stringify({ error: 'contentType must be image/jpeg, image/png, image/gif, or image/webp' }),
    };
  }

  try {
    const ext = ALLOWED_TYPES[contentType];
    const key = `images/${userId}/${randomUUID()}.${ext}`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 300 },
    );

    const objectUrl = `https://${BUCKET}.s3.${process.env.REGION}.amazonaws.com/${key}`;
    logger.info('presigned url generated', { key, userId, durationMs: Date.now() - start });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadUrl, objectUrl, key }),
    };
  } catch (err) {
    logger.error('get upload url failed', { error: String(err), userId, durationMs: Date.now() - start });
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
}
