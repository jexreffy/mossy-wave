import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const s3 = new S3Client({ region: process.env.REGION });
const BUCKET = process.env.IMAGES_BUCKET!;

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  let body: { contentType?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const contentType = body.contentType;
  if (!contentType || !ALLOWED_TYPES[contentType]) {
    return {
      statusCode: 422,
      body: JSON.stringify({ error: 'contentType must be image/jpeg, image/png, image/gif, or image/webp' }),
    };
  }

  const userId = event.requestContext.authorizer?.jwt?.claims?.sub ?? 'anonymous';
  const ext = ALLOWED_TYPES[contentType];
  const key = `images/${userId}/${randomUUID()}.${ext}`;

  // Presigned PUT URL — valid for 5 minutes, content-type locked to prevent type switching
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );

  // Public URL the browser can use to display the image after upload
  const objectUrl = `https://${BUCKET}.s3.${process.env.REGION}.amazonaws.com/${key}`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadUrl, objectUrl, key }),
  };
}
