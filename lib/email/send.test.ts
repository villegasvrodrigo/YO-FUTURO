import { describe, it, expect, vi } from 'vitest';
import { sendDailyEmail } from './send';

describe('sendDailyEmail', () => {
  it('returns sent status and provider id on success', async () => {
    const fakeClient = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null }),
      },
    } as any;

    const result = await sendDailyEmail('ana@example.com', 'Sigue adelante.', 'Tu mensaje de hoy · miércoles 23 de septiembre', { client: fakeClient });

    expect(result).toEqual({ providerId: 'email-123', status: 'sent', error: null });
  });

  it('sends the given subject and the body as plain text only (no HTML)', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null });
    const fakeClient = { emails: { send } } as never;

    await sendDailyEmail('ana@example.com', 'Sigue adelante.', 'Tu mensaje de hoy · miércoles 23 de septiembre', { client: fakeClient });

    const payload = send.mock.calls[0][0];
    expect(payload.to).toBe('ana@example.com');
    expect(payload.subject).toBe('Tu mensaje de hoy · miércoles 23 de septiembre');
    expect(payload.text).toBe('Sigue adelante.');
    expect(payload.html).toBeUndefined();
  });

  it('sends the HTML version together with the same plain text, subject and sender', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null });
    const fakeClient = { emails: { send } } as never;

    await sendDailyEmail('ana@example.com', 'Sigue adelante.', 'Tu mensaje de hoy · miércoles 23 de septiembre', {
      client: fakeClient,
      html: '<!DOCTYPE html><p>Sigue adelante.</p>',
    });

    const payload = send.mock.calls[0][0];
    expect(payload.text).toBe('Sigue adelante.');
    expect(payload.html).toBe('<!DOCTYPE html><p>Sigue adelante.</p>');
    expect(payload.subject).toBe('Tu mensaje de hoy · miércoles 23 de septiembre');
    expect(payload.from).toBe(process.env.RESEND_FROM_ADDRESS || 'Yo Futuro <hola@yofuturo.app>');
  });

  it('a null HTML (it could not be built) sends the plain text only', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email-123' }, error: null });

    await sendDailyEmail('ana@example.com', 'Sigue adelante.', 'Asunto', { client: { emails: { send } } as never, html: null });

    expect(send.mock.calls[0][0].html).toBeUndefined();
    expect(send.mock.calls[0][0].text).toBe('Sigue adelante.');
  });

  it('returns failed status and error message on failure', async () => {
    const fakeClient = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: null, error: { message: 'invalid domain' } }),
      },
    } as any;

    const result = await sendDailyEmail('ana@example.com', 'Sigue adelante.', 'Tu mensaje de hoy · miércoles 23 de septiembre', { client: fakeClient });

    expect(result).toEqual({ providerId: null, status: 'failed', error: 'invalid domain' });
  });

  it('returns failed status instead of throwing when the client rejects', async () => {
    const fakeClient = {
      emails: {
        send: vi.fn().mockRejectedValue(new Error('network timeout')),
      },
    } as any;

    const result = await sendDailyEmail('ana@example.com', 'Sigue adelante.', 'Tu mensaje de hoy · miércoles 23 de septiembre', { client: fakeClient });

    expect(result).toEqual({
      providerId: null,
      status: 'failed',
      error: 'Error: network timeout',
    });
  });
});
