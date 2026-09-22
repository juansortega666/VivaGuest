import type { Metadata } from 'next';

import { Card, CardContent } from '@/components/ui/card';
import { hoyBog } from '@/lib/domain/dates';

import { FormularioLogin } from './_components/FormularioLogin';
import { PanelPublicidad } from './_components/PanelPublicidad';
import { PieDeLogin } from './_components/PieDeLogin';

export const metadata: Metadata = {
  title: 'Entrar · VivaGuest',
};

// `/login` estaba en el manifest de prerenderizado del ultimo build con
// `initialRevalidateSeconds: false`: HTML generado en el build y nunca
// revalidado. Con eso, el ano del pie se congela en el ano del deploy.
// Una hora de ventana es de sobra para un ano en un pie de pagina, y conserva
// el HTML cacheable, que es lo que le importa a un telefono con mala senal.
//
// NO se borre esta linea "porque la pagina es estatica": es precisamente lo que
// hace que deje de serlo del todo. La compuerta que lo defiende vive en
// `page.contrato.test.ts`, porque el defecto exige dos builds en dos fechas
// distintas y ninguna suite de este repo puede mover el reloj del build.
export const revalidate = 3600;

/**
 * `/login` — PLAT-01 y PLAT-02 (UI-SPEC §12.1).
 *
 * No hace ninguna comprobacion de sesion: de eso se encarga el middleware, que
 * manda a su raiz a quien ya tenga sesion valida. Duplicar la comprobacion aqui
 * seria una segunda tabla de ruteo que mantener sincronizada.
 *
 * FASE 10 (10-UI-SPEC.md §2 y §10.1, D10-2/D10-3/D10-6): la pantalla esta
 * partida 45% publicidad · 10% de canal · 45% login a partir de `lg:` (1024px).
 * El reparto vive ENTERO en `@utility rejilla-login` de `app/globals.css`: aqui
 * no hay ni un porcentaje. Debajo de 1024px el panel desaparece por CSS y lo
 * que queda es exactamente la pantalla de antes.
 *
 * Esta pagina NO lee sesion, ni cookies, ni cabeceras, ni la base (T-10-02). Con
 * `revalidate` la ruta pasa a ISR, o sea UN HTML generado una vez y servido a
 * todos los visitantes durante una hora: el dia que alguien meta aqui una
 * lectura de sesion, el primer visitante fijaria su HTML para los demas.
 *
 * Y el reloj se lee AQUI y en ningun otro sitio de la pantalla, con `hoyBog()`
 * (§8.2). `PieDeLogin` recibe el ano por prop y es funcion pura de su prop, asi
 * que es verificable sin intervenir el tiempo.
 *
 * PROHIBIDO `new Date().getFullYear()` para el ano del pie. El proceso corre en
 * UTC en Vercel y en CI: el 31 de diciembre a las 19:00 de Bogota, UTC ya esta en
 * el ano siguiente y el pie adelantaria el ano durante cinco horas, de noche, una
 * vez al ano. `hoyBog()` ya lleva esa advertencia escrita en su propio comentario
 * y ya tiene su caso de la ventana de UTC en `lib/domain/dates.test.ts`.
 *
 * Y ese `new Date().getFullYear()` de ahi arriba es, ademas, lo que hace que el
 * filtro de lineas de comentario de `page.contrato.test.ts` sea necesario: sobre
 * el archivo crudo la prohibicion se dispararia contra su propia documentacion.
 */
export default function LoginPage() {
  return (
    // El fondo se queda en `--canvas` y NO pasa a blanco: es lo que le da borde
    // visible a la `Card` blanca debajo de 1024px, que es literalmente la
    // pantalla de hoy (§6.4). Se muda aqui desde el `<main>` porque ahora hay
    // dos columnas que compartirlo.
    <div className="flex min-h-[calc(100svh-var(--alto-barra-pruebas,0px))] flex-col bg-canvas">
      <div className="flex flex-1 lg:grid lg:rejilla-login">
        {/* COLUMNA 1 */}
        <PanelPublicidad />

        {/* COLUMNA 2: pista vacia de la rejilla, SIN elemento. Un div espaciador
            seria un nodo mas en el arbol de accesibilidad que no separa nada
            (§10.1); el login se coloca con `lg:col-start-3`. */}

        {/* COLUMNA 3 */}
        <main className="flex flex-1 flex-col items-center justify-center p-lg lg:col-start-3 lg:p-xl">
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
      </div>

      {/* HERMANO de la region del split y ULTIMO hijo del contenedor de la
          pantalla: fuera del `<main>`, que envuelve solo el login. Asi el
          `<footer>` es la unica `contentinfo` de la pagina (§10.1). Y no se capa
          a `max-w-admin`: D10-2 lo pide full-width. */}
      <PieDeLogin anio={hoyBog().slice(0, 4)} />
    </div>
  );
}
