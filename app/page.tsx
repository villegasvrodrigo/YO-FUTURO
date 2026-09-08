import Link from 'next/link';

export default function LandingPage() {
  return (
    <main>
      <h1>YO FUTURO</h1>
      <p>
        Cada día, tu yo futuro te escribe un mensaje — generado con IA a partir
        de tus metas, tus valores y quién quieres llegar a ser.
      </p>
      <nav>
        <Link href="/signup">Crear cuenta</Link>
        <Link href="/login">Entrar</Link>
      </nav>
    </main>
  );
}
