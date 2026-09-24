import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import CuentaEliminadaPage from './page';

describe('CuentaEliminadaPage (server render)', () => {
  it('confirms the account was deleted and what that means', () => {
    const html = renderToString(<CuentaEliminadaPage />);

    expect(html).toContain('Tu cuenta fue eliminada.');
    expect(html).toContain('Ya no recibirás');
    expect(html).toContain('puedes crear una cuenta nueva');
  });

  it('offers a way back to the home page', () => {
    const html = renderToString(<CuentaEliminadaPage />);

    expect(html).toContain('href="/"');
    expect(html).toContain('Volver al inicio');
  });
});
