import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const mockQuery = vi.fn();
vi.mock('../_rds', () => ({
  getPool: () => ({ query: mockQuery }),
}));
vi.mock('aws-xray-sdk-core', () => ({
  default: { captureAWSv3Client: (c: unknown) => c },
  captureAWSv3Client: (c: unknown) => c,
}));

import { handler } from '../getTags';

const fakeEvent = {} as APIGatewayProxyEventV2;

describe('getTags handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 with tag list from SQL GROUP BY query', async () => {
    const tags = [
      { name: 'aws', count: 5 },
      { name: 'demo', count: 3 },
      { name: 'serverless', count: 1 },
    ];
    mockQuery.mockResolvedValueOnce({ rows: tags });

    const result = await handler(fakeEvent);
    const body = JSON.parse((result as any).body);

    expect(result).toMatchObject({ statusCode: 200 });
    expect(body).toEqual(tags);
    // Verify the SQL query uses GROUP BY (key differentiator vs DynamoDB)
    expect(mockQuery.mock.calls[0][0]).toMatch(/GROUP BY/i);
    expect(mockQuery.mock.calls[0][0]).toMatch(/COUNT/i);
  });

  it('returns 200 with empty array when no tags exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await handler(fakeEvent);
    expect(JSON.parse((result as any).body)).toEqual([]);
  });

  it('returns 500 when Postgres throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Connection refused'));
    const result = await handler(fakeEvent);
    expect(result).toMatchObject({ statusCode: 500 });
  });
});
