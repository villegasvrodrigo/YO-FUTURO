// Used when SITE_URL is missing or isn't a valid http(s) address, so the link line can
// always go out.
const DEFAULT_SITE_URL = 'https://yofuturo.rodrigovillegasvilla.com';

/**
 * The site address for links in the email: SITE_URL if it is a valid http(s) address,
 * otherwise DEFAULT_SITE_URL. Trailing slashes are dropped. Read on every call, never throws.
 */
export function siteUrl(): string {
  try {
    const raw = process.env.SITE_URL?.trim();
    if (raw) {
      const url = new URL(raw);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return raw.replace(/\/+$/, '');
      }
    }
  } catch {
    // Not a valid address: fall back below.
  }
  return DEFAULT_SITE_URL;
}

/** The plain-text line that closes every daily email. */
export function dashboardLine(): string {
  return `Marca tus tareas en ${siteUrl()}/dashboard`;
}

// `text` followed by one blank line and the dashboard line. Only the line when `text` is
// empty or isn't text at all.
function withDashboardLine(text: unknown): string {
  const body = typeof text === 'string' ? text.trimEnd() : '';
  return body === '' ? dashboardLine() : `${body}\n\n${dashboardLine()}`;
}

/**
 * The plain-text body of the daily email: the message itself; when there are tasks, a
 * separator, the title "Tus tareas de hoy:" and the tasks numbered 1., 2., 3.; and ALWAYS,
 * last, the line "Marca tus tareas en <site>/dashboard" after one blank line.
 *
 * With no tasks (null, undefined or an empty list) the message keeps its text exactly as
 * it came in, except for trailing whitespace, and only the dashboard line is added. It
 * never throws: whatever odd data it gets, the worst case is the message plus that line.
 */
export function buildEmailText(content: string, tasks: string[] | null | undefined): string {
  try {
    if (!Array.isArray(tasks)) return withDashboardLine(content);

    // One line per task: internal line breaks are folded into spaces so a task can't
    // break the numbered list; blank or non-text entries are skipped.
    const lines = tasks
      .filter((task): task is string => typeof task === 'string')
      .map((task) => task.replace(/\s+/g, ' ').trim())
      .filter((task) => task !== '');
    if (lines.length === 0) return withDashboardLine(content);

    const list = lines.map((task, i) => `${i + 1}. ${task}`).join('\n');
    return withDashboardLine(`${content.trimEnd()}\n\n—\n\nTus tareas de hoy:\n\n${list}`);
  } catch {
    return withDashboardLine(content);
  }
}
