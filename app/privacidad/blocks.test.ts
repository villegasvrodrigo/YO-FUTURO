import { describe, it, expect } from 'vitest';
import { parsePrivacyText, splitEmails } from './blocks';

describe('parsePrivacyText', () => {
  it('turns "## " chunks into titles, "- " chunks into lists and the rest into paragraphs', () => {
    const text = `## Qué datos guardamos

Guardamos tu nombre
y tu correo.

- Tu perfil
- Tus metas`;

    expect(parsePrivacyText(text)).toEqual([
      { kind: 'heading', text: 'Qué datos guardamos' },
      { kind: 'paragraph', text: 'Guardamos tu nombre y tu correo.' },
      { kind: 'list', items: ['Tu perfil', 'Tus metas'] },
    ]);
  });

  it('ignores extra blank lines, spaces and Windows line breaks', () => {
    expect(parsePrivacyText('\r\n\r\n  Uno.  \r\n\r\n\r\n   \r\nDos.\r\n')).toEqual([
      { kind: 'paragraph', text: 'Uno.' },
      { kind: 'paragraph', text: 'Dos.' },
    ]);
  });

  it('keeps a chunk that mixes bullets and plain lines as a paragraph', () => {
    expect(parsePrivacyText('Incluye:\n- esto')).toEqual([{ kind: 'paragraph', text: 'Incluye: - esto' }]);
  });

  it('gives nothing for empty text', () => {
    expect(parsePrivacyText('   \n\n  ')).toEqual([]);
  });
});

describe('splitEmails', () => {
  it('separates email addresses from the rest of the text', () => {
    expect(splitEmails('Escríbenos a contacto@villegasvrodrigo.com para cualquier duda.')).toEqual([
      { text: 'Escríbenos a ', email: false },
      { text: 'contacto@villegasvrodrigo.com', email: true },
      { text: ' para cualquier duda.', email: false },
    ]);
  });

  it('leaves text without emails as one plain piece', () => {
    expect(splitEmails('Sin correo aquí.')).toEqual([{ text: 'Sin correo aquí.', email: false }]);
  });
});
