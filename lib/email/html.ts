import { siteUrl, SIGNATURE } from './body';
import { dailyDateLabel } from './subject';

// The HTML version of the daily email, sent together with the plain-text one (buildEmailText).
// Built for email clients (Gmail, Apple Mail, Outlook): tables for the layout, every style
// inline, no images, no external fonts. The design was approved as /tmp/correo-preview.html.
//
// Colors:
//   #12141c  app background (--ink in app/globals.css): the button.
//   #c9a063  app gold (--brass): the button text, on the dark button.
//   #ab8955  gold for small details on the light background: --brass mixed with --brass-dim
//            (#7d6741), a little muted so it reads gold, not orange.
//   #dccbaa  the same gold, light: the separator line.

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = 'Arial, Helvetica, sans-serif';

// How much of the message shows as the preview line in the inbox list.
const PREHEADER_LENGTH = 110;

/** Makes text safe inside HTML (and inside quoted attributes): & < > " ' are escaped. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The message as paragraphs: a blank line starts a new paragraph, a single line break stays
 * a line break inside it. Empty paragraphs are dropped.
 */
export function messageParagraphs(content: string): string[] {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}

// Same cleaning as the plain-text email: only text, internal line breaks folded, no blanks.
function cleanTasks(tasks: unknown): string[] {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .filter((task): task is string => typeof task === 'string')
    .map((task) => task.replace(/\s+/g, ' ').trim())
    .filter((task) => task !== '');
}

function paragraphHtml(paragraph: string, first: boolean): string {
  const text = paragraph
    .split('\n')
    .map((line) => escapeHtml(line.trim()))
    .join('<br>');
  return `<p class="message" style="margin:${first ? 28 : 18}px 0 0 0; font-family:${SERIF}; font-size:18px; line-height:1.7; color:#2b2a33;">${text}</p>`;
}

function taskRowHtml(task: string, dashboard: string, last: boolean): string {
  const bottom = last ? 0 : 14;
  return `<tr>
  <td valign="top" width="34" style="padding:2px 0 ${bottom}px 0;">
    <a href="${dashboard}" target="_blank" style="text-decoration:none; display:block;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="16" height="16" style="width:16px; height:16px; border:1.5px solid #9a958a; border-radius:4px; background-color:#ffffff; font-size:1px; line-height:1px;">&nbsp;</td>
      </tr></table>
    </a>
  </td>
  <td valign="top" style="padding:0 0 ${bottom}px 0;">
    <a href="${dashboard}" target="_blank" style="text-decoration:none; font-family:${SANS}; font-size:16px; line-height:1.55; color:#3a3946;">${escapeHtml(task)}</a>
  </td>
</tr>`;
}

function tasksBlockHtml(tasks: string[], dashboard: string): string {
  if (tasks.length === 0) return '';
  const rows = tasks.map((task, i) => taskRowHtml(task, dashboard, i === tasks.length - 1)).join('\n');
  return `<!-- Gold separator -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 28px 0;">
  <tr><td style="height:1px; line-height:1px; font-size:1px; background-color:#dccbaa;">&nbsp;</td></tr>
</table>
<!-- Tasks: an empty box and the text, both links to the dashboard, where they are checked for real. -->
<h2 style="margin:0 0 16px 0; font-family:${SERIF}; font-size:22px; font-weight:normal; color:#2b2a33;">Tus tareas de hoy</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-tasks>
${rows}
</table>
<p style="margin:16px 0 0 0; font-family:${SANS}; font-size:13px; line-height:1.5; color:#9a958a;">Toca una tarea para marcarla en tu dashboard.</p>`;
}

/**
 * The HTML of the daily email: header with that day's date (in the person's time zone), the
 * message as paragraphs with the signature, the tasks (only when there are any; the whole
 * block disappears otherwise), the "Ir a mi dashboard" button and the privacy link. Every
 * piece of text is escaped. Returns null — never throws — if anything goes wrong: the email
 * then goes out as plain text only, as before.
 */
export function buildEmailHtml(
  content: string,
  tasks: string[] | null | undefined,
  now: Date,
  timezone: string
): string | null {
  try {
    const paragraphs = messageParagraphs(typeof content === 'string' ? content : '');
    if (paragraphs.length === 0) return null;

    const site = siteUrl();
    const dashboard = escapeHtml(`${site}/dashboard`);
    const privacy = escapeHtml(`${site}/privacidad`);
    const date = dailyDateLabel(now, timezone);
    const preheader = escapeHtml(paragraphs.join(' ').replace(/\s+/g, ' ').slice(0, PREHEADER_LENGTH));

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Tu mensaje de hoy</title>
<style>
  @media only screen and (max-width: 600px) {
    .outer { padding: 16px 10px !important; }
    .card-pad { padding: 28px 22px !important; }
    .title { font-size: 26px !important; }
    .message { font-size: 17px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f6f1e7;">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#f6f1e7;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f1e7;">
<tr>
<td class="outer" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background-color:#fffdf8; border:1px solid #ece3d2; border-radius:12px;">
<tr><td style="height:4px; line-height:4px; font-size:4px; background-color:#ab8955; border-radius:12px 12px 0 0;">&nbsp;</td></tr>
<tr>
<td class="card-pad" style="padding:36px 40px 32px 40px;">
<p style="margin:0 0 6px 0; font-family:${SERIF}; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#ab8955;">Yo futuro</p>
<h1 class="title" style="margin:0; font-family:${SERIF}; font-size:30px; line-height:1.2; font-weight:normal; color:#2b2a33;">Tu mensaje de hoy</h1>
${date ? `<p style="margin:6px 0 0 0; font-family:${SERIF}; font-size:16px; font-style:italic; color:#ab8955;">${escapeHtml(date)}</p>` : ''}
${paragraphs.map((paragraph, i) => paragraphHtml(paragraph, i === 0)).join('\n')}
<p style="margin:22px 0 0 0; font-family:${SERIF}; font-size:17px; font-style:italic; color:#ab8955;">${escapeHtml(SIGNATURE)}</p>
${tasksBlockHtml(cleanTasks(tasks), dashboard)}
<!-- Button (table-based so it also works in Outlook): the app's dark background, gold text. -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:32px auto 0 auto;">
<tr>
<td align="center" bgcolor="#12141c" style="border-radius:8px; background-color:#12141c;">
<a href="${dashboard}" target="_blank" style="display:inline-block; padding:14px 30px; font-family:${SANS}; font-size:16px; font-weight:bold; color:#c9a063; text-decoration:none; border-radius:8px;">Ir a mi dashboard</a>
</td>
</tr>
</table>
</td>
</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr>
<td align="center" style="padding:18px 16px 0 16px; font-family:${SANS}; font-size:12px; line-height:1.5; color:#9a958a;">
<a href="${privacy}" target="_blank" style="color:#9a958a; text-decoration:underline;">Aviso de privacidad</a>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
  } catch {
    return null;
  }
}
