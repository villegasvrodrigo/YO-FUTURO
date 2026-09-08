import { describe, it, expect, vi } from 'vitest';
import { sendDailyEmail } from './send';

describe('sendDailyEmail', () => {
  it('returns sent status and provider id on success', async () => {
    const fakeClient = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null }),
      },
    } as any;

    const result = await sendDailyEmail('ana@example.com', 'Sigue adelante.', fakeClient);

    expect(result).toEqual({ providerId: 'email-123', status: 'sent', error: null });
  });

  it('returns failed status and error message on failure', async () => {
    const fakeClient = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: null, error: { message: 'invalid domain' } }),
      },
    } as any;

    const result = await sendDailyEmail('ana@example.com', 'Sigue adelante.', fakeClient);

    expect(result).toEqual({ providerId: null, status: 'failed', error: 'invalid domain' });
  });

  it('returns failed status instead of throwing when the client rejects', async () => {
    const fakeClient = {
      emails: {
        send: vi.fn().mockRejectedValue(new Error('network timeout')),
      },
    } as any;

    const result = await sendDailyEmail('ana@example.com', 'Sigue adelante.', fakeClient);

    expect(result).toEqual({
      providerId: null,
      status: 'failed',
      error: 'Error: network timeout',
    });
  });
});
