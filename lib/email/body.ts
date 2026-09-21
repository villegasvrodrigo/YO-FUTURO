/**
 * The plain-text body of the daily email: the message itself and, only when there are
 * tasks, a separator, the title "Tus tareas de hoy:" and the tasks numbered 1., 2., 3.
 *
 * With no tasks (null, undefined or an empty list) it returns `content` exactly as it
 * came in, character for character, so the email is the same as it was before tasks
 * existed. It never throws: whatever odd data it gets, the worst case is `content` back.
 */
export function buildEmailText(content: string, tasks: string[] | null | undefined): string {
  try {
    if (!Array.isArray(tasks)) return content;

    // One line per task: internal line breaks are folded into spaces so a task can't
    // break the numbered list; blank or non-text entries are skipped.
    const lines = tasks
      .filter((task): task is string => typeof task === 'string')
      .map((task) => task.replace(/\s+/g, ' ').trim())
      .filter((task) => task !== '');
    if (lines.length === 0) return content;

    const list = lines.map((task, i) => `${i + 1}. ${task}`).join('\n');
    return `${content.trimEnd()}\n\n—\n\nTus tareas de hoy:\n\n${list}`;
  } catch {
    return content;
  }
}
