import { Resend } from 'resend';

export interface SendEmailResult {
  providerId: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}

export async function sendDailyEmail(
  toEmail: string,
  messageContent: string,
  client: Resend = new Resend(process.env.RESEND_API_KEY)
): Promise<SendEmailResult> {
  let response: Awaited<ReturnType<Resend['emails']['send']>>;

  try {
    response = await client.emails.send({
      from: process.env.RESEND_FROM_ADDRESS || 'Yo Futuro <hola@yofuturo.app>',
      to: toEmail,
      subject: 'Tu mensaje de hoy de tu yo futuro',
      text: messageContent,
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
