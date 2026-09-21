const ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed':
    'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada (o la carpeta de spam).',
};

const GENERIC_MESSAGE = 'No se pudo iniciar sesión. Intenta de nuevo.';

/** Traduce los mensajes de error de Supabase Auth a español; usa un genérico para los no mapeados. */
export function translateLoginError(message: string): string {
  return ERROR_MESSAGES[message] ?? GENERIC_MESSAGE;
}
