import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import PrivacidadPage from './page';
import { PrivacyLink } from '@/app/_components/PrivacyLink';

describe('PrivacidadPage (server render)', () => {
  it('shows the title and a way back to the home page', () => {
    const html = renderToString(<PrivacidadPage />);

    expect(html).toContain('Aviso de privacidad');
    expect(html).toContain('href="/"');
  });
});

describe('PrivacyLink', () => {
  it('is a text link to /privacidad', () => {
    const html = renderToString(<PrivacyLink />);

    expect(html).toContain('href="/privacidad"');
    expect(html).toContain('>Aviso de privacidad<');
  });
});

describe('the privacy notice text', () => {
  it('renders its sections, the list of services and a mailto link for the contact email', () => {
    const html = renderToString(<PrivacidadPage />);

    for (const heading of ['Qué guardo:', 'Para qué lo uso:', 'Quién más ve tus datos:', 'Qué no hago:', 'Tus datos:', 'Contacto:']) {
      expect(html).toContain(`>${heading}</h2>`);
    }
    expect((html.match(/<li>/g) ?? []).length).toBe(4);
    expect(html).toContain('href="mailto:contacto@villegasvrodrigo.com"');
    expect(html).not.toContain('Texto pendiente');
  });

  it('shows the title only once', () => {
    const html = renderToString(<PrivacidadPage />);

    expect(html.split('Aviso de privacidad').length - 1).toBe(1);
  });
});
