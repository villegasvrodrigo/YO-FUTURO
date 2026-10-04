import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { InsightOnTheWay, INSIGHT_ON_THE_WAY_COPY, INSIGHT_CHECK_MS } = await import('./InsightOnTheWay');

describe('InsightOnTheWay', () => {
  it('says the insight is on its way, in the card style, announced to screen readers', () => {
    const html = renderToString(<InsightOnTheWay />);

    expect(html).toContain(renderToString(<>{INSIGHT_ON_THE_WAY_COPY}</>));
    expect(html).toContain('role="status"');
    expect(html).toContain('bg-dusk-2');
  });

  it('checks every few seconds', () => {
    expect(INSIGHT_CHECK_MS).toBe(4000);
  });
});
