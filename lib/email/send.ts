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
  const { data, error } = await client.emails.send({
    from: 'Yo Futuro <hola@yofuturo.app>',
    to: toEmail,
    subject: 'Tu mensaje de hoy de tu yo futuro',
    text: messageContent,
  });

  if (error) {
    return { providerId: null, status: 'failed', error: error.message };
  }

  return { providerId: data?.id ?? null, status: 'sent', error: null };
}
