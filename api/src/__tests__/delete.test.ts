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
import { handler } from '../delete';

const mockSend = vi.mocked(db.send);

function makeEvent(noteId: string | undefined, sub: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    pathParameters: noteId ? { id: noteId } : {},
    requestContext: {
      authorizer: { jwt: { claims: { sub }, scopes: '' } },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('delete handler', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes the note and returns 204 when owner matches', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { noteId: 'note-1', userId: 'owner-1' } } as never) // GetCommand
      .mockResolvedValueOnce({} as never); // DeleteCommand

    const result = await handler(makeEvent('note-1', 'owner-1'));
    expect(result).toMatchObject({ statusCode: 204 });
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('returns 403 when userId does not match note owner', async () => {
    mockSend.mockResolvedValueOnce({ Item: { noteId: 'note-1', userId: 'owner-1' } } as never);

    const result = await handler(makeEvent('note-1', 'different-user'));
    expect(result).toMatchObject({ statusCode: 403 });
    expect(mockSend).toHaveBeenCalledTimes(1); // no delete attempted
  });

  it('returns 404 when note does not exist', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined } as never);

    const result = await handler(makeEvent('missing-note', 'owner-1'));
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('returns 400 when noteId is missing', async () => {
    const result = await handler(makeEvent(undefined, 'owner-1'));
    expect(result).toMatchObject({ statusCode: 400 });
  });

  it('returns 500 when DynamoDB throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent('note-1', 'owner-1'));
    expect(result).toMatchObject({ statusCode: 500 });
  });
});
