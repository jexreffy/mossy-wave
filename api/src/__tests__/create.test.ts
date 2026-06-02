import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

vi.mock('../_db', () => ({
  db: { send: vi.fn() },
  TABLE: 'test-table',
}));
vi.mock('aws-xray-sdk-core', () => ({
  default: { captureAWSv3Client: (c: unknown) => c },
  captureAWSv3Client: (c: unknown) => c,
}));

import { db } from '../_db';
import { handler } from '../create';

const mockSend = vi.mocked(db.send);

function makeEvent(body: object, sub = 'user-123'): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    body: JSON.stringify(body),
    requestContext: {
      authorizer: { jwt: { claims: { sub }, scopes: '' } },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('create handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a note and returns 201 with the item', async () => {
    mockSend.mockResolvedValueOnce({} as never);

    const result = await handler(makeEvent({ content: 'Test note' }));
    const body = JSON.parse((result as any).body);

    expect(result).toMatchObject({ statusCode: 201 });
    expect(body).toMatchObject({ content: 'Test note', userId: 'user-123' });
    expect(body.noteId).toBeTruthy();
    expect(body.createdAt).toBeTruthy();
  });

  it('stores imageKey when provided', async () => {
    mockSend.mockResolvedValueOnce({} as never);

    const result = await handler(makeEvent({ content: 'With image', imageKey: 'images/u/test.jpg' }));
    const body = JSON.parse((result as any).body);

    expect(body.imageKey).toBe('images/u/test.jpg');
  });

  it('returns 422 when content is missing', async () => {
    const result = await handler(makeEvent({ url: 'https://example.com' }));
    expect(result).toMatchObject({ statusCode: 422 });
  });

  it('returns 422 when content exceeds 500 chars', async () => {
    const result = await handler(makeEvent({ content: 'x'.repeat(501) }));
    expect(result).toMatchObject({ statusCode: 422 });
  });

  it('returns 400 for invalid JSON body', async () => {
    const event = {
      body: 'not-json',
      requestContext: { authorizer: { jwt: { claims: { sub: 'u1' }, scopes: '' } } },
    } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

    const result = await handler(event);
    expect(result).toMatchObject({ statusCode: 400 });
  });

  it('returns 500 when DynamoDB throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent({ content: 'Hello' }));
    expect(result).toMatchObject({ statusCode: 500 });
  });
});
