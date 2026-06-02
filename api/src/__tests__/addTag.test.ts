import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockClient = {
  query: mockQuery,
  release: mockRelease,
};
vi.mock('../_rds', () => ({
  getPool: () => ({ connect: vi.fn().mockResolvedValue(mockClient) }),
}));
vi.mock('aws-xray-sdk-core', () => ({
  default: { captureAWSv3Client: (c: unknown) => c },
  captureAWSv3Client: (c: unknown) => c,
}));

import { handler } from '../addTag';

function makeEvent(noteId: string, body: object, sub = 'user-1'): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    pathParameters: { id: noteId },
    body: JSON.stringify(body),
    requestContext: { authorizer: { jwt: { claims: { sub }, scopes: '' } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('addTag handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: BEGIN → tag upsert → note_tag insert → COMMIT
    mockQuery
      .mockResolvedValueOnce({})                           // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })       // upsert tag
      .mockResolvedValueOnce({})                           // insert note_tags
      .mockResolvedValueOnce({});                          // COMMIT
  });

  it('adds a tag and returns 201', async () => {
    const result = await handler(makeEvent('note-1', { tag: 'aws' }));
    const body = JSON.parse((result as any).body);

    expect(result).toMatchObject({ statusCode: 201 });
    expect(body).toMatchObject({ tag: 'aws' });
    expect(mockRelease).toHaveBeenCalled();
  });

  it('normalises tag to lowercase and strips special chars', async () => {
    await handler(makeEvent('note-1', { tag: 'AWS-Cloud!' }));
    // The upsert query should receive 'aws-cloud' (lowercased, ! stripped)
    const upsertCall = mockQuery.mock.calls[1];
    expect(upsertCall[1][0]).toBe('aws-cloud');
  });

  it('uses a SQL transaction (BEGIN + COMMIT)', async () => {
    await handler(makeEvent('note-1', { tag: 'test' }));
    const queries = mockQuery.mock.calls.map((c: string[][]) => c[0]);
    expect(queries[0]).toBe('BEGIN');
    expect(queries[queries.length - 1]).toBe('COMMIT');
  });

  it('returns 422 for empty tag', async () => {
    const result = await handler(makeEvent('note-1', { tag: '' }));
    expect(result).toMatchObject({ statusCode: 422 });
  });

  it('returns 422 for tag exceeding 30 chars', async () => {
    const result = await handler(makeEvent('note-1', { tag: 'a'.repeat(31) }));
    expect(result).toMatchObject({ statusCode: 422 });
  });

  it('rolls back and returns 500 when DB throws', async () => {
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({})            // BEGIN
      .mockRejectedValueOnce(new Error('constraint violation'))  // upsert fails
      .mockResolvedValueOnce({});           // ROLLBACK

    const result = await handler(makeEvent('note-1', { tag: 'test' }));
    expect(result).toMatchObject({ statusCode: 500 });
    const rollbackCall = mockQuery.mock.calls[2][0];
    expect(rollbackCall).toBe('ROLLBACK');
    expect(mockRelease).toHaveBeenCalled(); // connection always released
  });
});
