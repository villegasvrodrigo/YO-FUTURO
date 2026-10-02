import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Welcome, WelcomeDone, WelcomeStepView } from './Welcome';
import { buildWelcomeSteps } from './welcomeContent';

const steps = buildWelcomeSteps({
  name: 'Rodrigo',
  futureSelfAge: 50,
  deliveryHour: 8,
  timezone: 'America/Mexico_City',
  sender: 'hola@yofuturo.app',
  hasAnyMessage: false,
  chatEnabled: true,
  now: new Date('2026-10-02T15:00:00Z'),
});
const plain = (html: string) => html.replace(/<!-- -->/g, '');
const escaped = (text: string) => renderToString(<>{text}</>);

describe('Welcome', () => {
  it('opens full screen on the first step, with "Saltar introducción" and "Siguiente" (no "Atrás" yet)', () => {
    const html = plain(renderToString(<Welcome steps={steps} name="Rodrigo" replay={false} />));

    expect(html).toContain('role="dialog"');
    expect(html).toContain('fixed inset-0 z-50');
    expect(html).toContain('PASO 1 DE 5');
    expect(html).toContain(escaped('Saltar introducción'));
    expect(html).toContain('>Siguiente</button>');
    expect(html).not.toContain('Atrás');
    expect(html).not.toContain('>Empezar<');
    // The step bar: one segment per step, the first one lit.
    expect(html.match(/<li class="h-1 flex-1 rounded-full/g)).toHaveLength(5);
  });

  it('a step shows its title, texts, notice and note', () => {
    const html = plain(renderToString(<WelcomeStepView step={steps[1]} index={1} total={5} />));

    expect(html).toContain('PASO 2 DE 5');
    expect(html).toContain('Todos los días te llega un correo');
    expect(html).toContain('a las 8:00 a. m.');
    expect(html).toContain(escaped('El primer día revisa tu carpeta de Spam o Promociones.').slice(0, 30));
    expect(html).toContain(escaped('Puedes cambiar la hora o pausar los correos cuando quieras desde Perfil.'));
  });

  it('the closing line after finishing', () => {
    expect(renderToString(<WelcomeDone name="Rodrigo" />)).toContain('Todo listo, Rodrigo. Tu yo futuro ya está contigo.');
  });
});
