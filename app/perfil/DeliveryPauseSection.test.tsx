import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DeliveryPauseSection } from './DeliveryPauseSection';

// renderToString escapes accents in text; compare against the escaped copy.
const escaped = (text: string) => renderToString(<>{text}</>);

describe('DeliveryPauseSection (server render)', () => {
  it('when active: says so and offers to pause', () => {
    const html = renderToString(<DeliveryPauseSection profileId="p1" initialPaused={false} />);

    expect(html).toContain('Correos diarios');
    expect(html).toContain('>activos<');
    expect(html).toContain('Pausar mis correos');
    expect(html).not.toContain('Reanudar mis correos');
  });

  it('when paused: says so and offers to resume', () => {
    const html = renderToString(<DeliveryPauseSection profileId="p1" initialPaused={true} />);

    expect(html).toContain('>en pausa<');
    expect(html).toContain('Reanudar mis correos');
    expect(html).not.toContain('Pausar mis correos');
  });

  it('explains what the pause does, and shows no result message before any click', () => {
    const html = renderToString(<DeliveryPauseSection profileId="p1" initialPaused={false} />);

    expect(html).toContain(escaped('no recibirás mensaje, tareas ni insight'));
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });
});
