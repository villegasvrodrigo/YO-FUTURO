export type PrivacyBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

/**
 * Splits the privacy text into blocks: "## " titles, "- " lists and paragraphs, one per
 * chunk separated by blank lines (see the format notes in content.ts).
 */
export function parsePrivacyText(text: string): PrivacyBlock[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk !== '')
    .map((chunk): PrivacyBlock => {
      if (chunk.startsWith('## ')) {
        return { kind: 'heading', text: chunk.slice(3).replace(/\s+/g, ' ').trim() };
      }
      const lines = chunk.split('\n').map((line) => line.trim());
      if (lines.every((line) => line.startsWith('- '))) {
        return { kind: 'list', items: lines.map((line) => line.slice(2).trim()) };
      }
      return { kind: 'paragraph', text: lines.join(' ') };
    });
}

const EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

/** Splits `text` into plain pieces and email addresses, so the page can link the emails. */
export function splitEmails(text: string): { text: string; email: boolean }[] {
  return text
    .split(EMAIL)
    .filter((piece) => piece !== '')
    .map((piece) => ({ text: piece, email: EMAIL.test(piece) }));
}
