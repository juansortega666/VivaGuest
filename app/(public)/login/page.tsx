import type { Metadata } from 'next';

import { Card, CardContent } from '@/components/ui/card';

import { FormularioLogin } from './_components/FormularioLogin';

export const metadata: Metadata = {
  title: 'Entrar · VivaGuest',
};

/**
 * `/login` — PLAT-01 y PLAT-02 (UI-SPEC §12.1).
 *
 * No hace ninguna comprobacion de sesion: de eso se encarga el middleware, que
 * manda a su raiz a quien ya tenga sesion valida. Duplicar la comprobacion aqui
 * seria una segunda tabla de ruteo que mantener sincronizada.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-canvas p-lg">
      {/*
        El wordmark va en `--foreground`, NO en el color de marca. El coral de la
        identidad (`--brand-identity`) da 2.64:1 contra blanco y no llega al 4.5:1
        que WCAG exige para texto; su sitio son el logo y las areas grandes, no una
        palabra de 24px. Poppins si es la tipografia de marca y el login es uno de
        los tres sitios donde vive (UI-SPEC §3, ACTUALIZACION 2026-09-01).
      */}
      <h1 className="mb-2xl font-brand text-display text-foreground">VivaGuest</h1>

      {/* 400px es la medida del contrato. `w-full` debajo de esa anchura para que
          en un telefono no se salga de la pantalla. */}
      <Card className="w-full max-w-login">
        <CardContent>
          <FormularioLogin />
        </CardContent>
      </Card>
    </main>
  );
}
