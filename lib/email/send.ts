import { Resend } from 'resend';

export interface SendEmailResult {
  providerId: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}

export interface SendEmailOptions {
  // The HTML version (buildEmailHtml), sent together with the plain text. Without it (or
  // null), the email goes out as plain text only.
  html?: string | null;
  client?: Resend;
}

/**
 * Sends the daily email: always the plain text (`messageContent`), plus the HTML version
 * when given. Never throws: a failure comes back as status 'failed'.
 */
export async function sendDailyEmail(
  toEmail: string,
  messageContent: string,
  subject: string,
  options: SendEmailOptions = {}
): Promise<SendEmailResult> {
  let response: Awaited<ReturnType<Resend['emails']['send']>>;

  try {
    const client = options.client ?? new Resend(process.env.RESEND_API_KEY);
    response = await client.emails.send({
      from: process.env.RESEND_FROM_ADDRESS || 'Yo Futuro <hola@yofuturo.app>',
      to: toEmail,
      subject,
      text: messageContent,
      ...(options.html ? { html: options.html } : {}),
    });
  } catch (err) {
    // Fallo de red, timeout o excepción del SDK: se devuelve el resultado
    // fallido en lugar de propagar, para que quien llama pueda actualizar
    // el mensaje a `failed` y registrarlo en `email_log`.
    return { providerId: null, status: 'failed', error: String(err) };
  }

  const { data, error } = response;

  if (error) {
    return { providerId: null, status: 'failed', error: error.message };
  }

  return { providerId: data?.id ?? null, status: 'sent', error: null };
}
