import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

// Mock the DB module — handler imports { db, TABLE } from '../_db'
vi.mock('../_db', () => ({
  db: { send: vi.fn() },
  TABLE: 'test-table',
}));

// Mock X-Ray (not available outside Lambda runtime)
vi.mock('aws-xray-sdk-core', () => ({
  default: { captureAWSv3Client: (c: unknown) => c },
  captureAWSv3Client: (c: unknown) => c,
}));

import { db } from '../_db';
import { handler } from '../list';

const mockSend = vi.mocked(db.send);
const fakeEvent = {} as APIGatewayProxyEventV2;

describe('list handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with items from DynamoDB', async () => {
    const items = [
      { noteId: 'abc', content: 'Hello', userId: 'u1', createdAt: '2024-01-01T00:00:00Z', dummy: 'NOTE' },
      { noteId: 'def', content: 'World', userId: 'u2', createdAt: '2024-01-02T00:00:00Z', dummy: 'NOTE' },
    ];
    mockSend.mockResolvedValueOnce({ Items: items } as never);

    const result = await handler(fakeEvent);

    expect(result).toMatchObject({ statusCode: 200 });
    expect(JSON.parse((result as any).body)).toEqual(items);
  });

  it('returns empty array when no items exist', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] } as never);

    const result = await handler(fakeEvent);

    expect(result).toMatchObject({ statusCode: 200 });
    expect(JSON.parse((result as any).body)).toEqual([]);
  });

  it('returns 500 when DynamoDB throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('DynamoDB unavailable'));

    const result = await handler(fakeEvent);

    expect(result).toMatchObject({ statusCode: 500 });
    expect(JSON.parse((result as any).body)).toMatchObject({ error: 'Internal server error' });
  });
});
