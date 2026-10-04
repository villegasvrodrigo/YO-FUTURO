import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { PreparingTodayView, requestToday, WRITING_COPY, FAILED_COPY, LIMIT_COPY } = await import('./PreparingToday');

const escaped = (text: string) => renderToString(<>{text}</>);
const last = { content: 'El mensaje de ayer.' };
const lastDay = { date: '2026-10-03', isToday: false };
const view = (state: 'writing' | 'failed' | 'limit', retrying = false) =>
  renderToString(<PreparingTodayView state={state} retrying={retrying} onRetry={() => {}} lastMessage={last} lastDay={lastDay} />);

describe('PreparingTodayView', () => {
  it("while writing: the waiting card, the size of a message card, and never yesterday's message", () => {
    const html = view('writing');

    expect(html).toContain(escaped(WRITING_COPY));
    expect(html).toContain('Tu mensaje de hoy');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('El mensaje de ayer.');
    expect(html).not.toContain('Reintentar');
  });

  it('when the AI fails: the kind notice, "Reintentar", and the last message clearly dated', () => {
    const html = view('failed');

    expect(html).toContain(escaped(FAILED_COPY));
    expect(html).toContain('>Reintentar</button>');
    expect(html).toContain('El mensaje de ayer.');
    expect(html).toContain(escaped('Tu último mensaje'));
    expect(html).toContain('dateTime="2026-10-03"');
    expect(html).not.toContain('Generado hoy');
  });

  it('while retrying, it shows the waiting card again (no second tap possible)', () => {
    const html = view('failed', true);

    expect(html).toContain(escaped(WRITING_COPY));
    expect(html).not.toContain('Reintentar');
  });

  it('at the daily limit: the notice without a retry button', () => {
    const html = view('limit');

    expect(html).toContain(escaped(FAILED_COPY));
    expect(html).toContain(escaped(LIMIT_COPY));
    expect(html).not.toContain('Reintentar');
  });

  it('never shows technical details', () => {
    for (const state of ['writing', 'failed', 'limit'] as const) {
      // Only what the person reads (tags and attributes like role="status" left out).
      const visibleText = view(state).replace(/<[^>]*>/g, ' ');
      expect(visibleText).not.toMatch(/error|status|502|429|undefined/i);
    }
  });
});

describe('requestToday', () => {
  const respond = (status: number, body: string) =>
    vi.fn().mockResolvedValue(new Response(body, { status })) as unknown as typeof fetch;

  it('posts to /api/daily/today and reads the answer', async () => {
    const fetchFn = respond(200, '{"status":"ready"}');

    expect(await requestToday(fetchFn)).toBe('ready');
    expect(vi.mocked(fetchFn).mock.calls[0][0]).toBe('/api/daily/today');
    expect(vi.mocked(fetchFn).mock.calls[0][1]).toMatchObject({ method: 'POST' });
  });

  it('limit, failure, a broken answer or no connection never throw', async () => {
    expect(await requestToday(respond(429, '{"status":"limit"}'))).toBe('limit');
    expect(await requestToday(respond(502, '{"status":"failed"}'))).toBe('failed');
    expect(await requestToday(respond(500, '<html>'))).toBe('failed');
    expect(await requestToday(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch)).toBe('failed');
  });
});
