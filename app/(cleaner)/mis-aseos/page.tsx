import { ChevronRight, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { cerrarSesion } from '@/app/_actions/sesion';
import { ListaDeAseos } from '@/app/(cleaner)/_components/ListaDeAseos';
import { Button } from '@/components/ui/button';
import { NoAutorizado, exigirSesion } from '@/lib/auth/guards';
import { leerAseosDeHoy } from '@/lib/data/aseos-del-aseador';
import { formatFechaBog } from '@/lib/domain/dates';

export const metadata: Metadata = {
  title: 'Mis aseos · VivaGuest',
};

/**
 * `/mis-aseos` — el home del aseador. PWA-01.
 *
 * DEJA DE SER STUB. Desde la Fase 2 esta pantalla solo demostraba que un aseador
 * entraba a su superficie; ahora lista su trabajo del dia.
 *
 * Componente de servidor: la carga inicial la resuelve el servidor y el
 * `loading.tsx` pinta la forma exacta de lo que va a aparecer.
 *
 * EL INSTANTE DE LA LECTURA SE LEE AQUI, UNA VEZ, y baja por props a todo lo que
 * lo necesita. Llamar al reloj dentro de cada tarjeta daria respuestas distintas
 * a la misma pregunta dentro de la misma pantalla.
 */
export default async function MisAseosPage() {
  const contexto = await exigirSesion().catch((error: unknown) => {
    if (error instanceof NoAutorizado) return null;
    throw error;
  });

  if (!contexto) redirect('/login');

  const ahoraMs = Date.now();
  const datos = await leerAseosDeHoy(contexto.supabase, ahoraMs);

  return (
    <>
      <div className="flex flex-col gap-xs">
        <h1 className="text-display-movil text-foreground">Mis aseos</h1>
        <p className="text-body-movil text-muted-foreground">{formatFechaBog(datos.hoy)}</p>
      </div>

      <ListaDeAseos datos={datos} />

      {/*
        LA ENTRADA A SUS PAGOS (07-UI-SPEC §10.2).

        Va AL PIE de la lista, debajo del trabajo del dia, porque el trabajo del
        dia es a lo que la aseadora abre esta app. El dinero se consulta una vez
        al mes.

        NO SE ANADE NAVEGACION PERSISTENTE, y es una decision, no una carencia:
        este arbol nunca la ha tenido, y una barra inferior nueva es un cambio de
        paradigma que le tocaria tambien a la ficha del aseo y al asistente de
        evidencia, ninguno de los dos en el alcance de esta fase.

        56px de alto, que es el destino de toque comodo de este arbol y no el
        piso de 44: la usa una persona de pie, con guantes o con las manos
        mojadas.
      */}
      <Link
        href="/mis-pagos"
        className="transicion flex min-h-toque-comodo w-full items-center justify-between gap-md rounded-md border border-border bg-background px-lg py-md"
      >
        <span className="flex items-center gap-md text-body-movil text-foreground">
          <Wallet size={20} strokeWidth={2} aria-hidden="true" />
          Mis pagos
        </span>
        <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
      </Link>

      {/* Cerrar sesion no necesita ni un gramo de JavaScript de cliente. */}
      <form action={cerrarSesion} className="pt-xl">
        <Button type="submit" variant="outline" className="min-h-toque w-full text-body-movil">
          Cerrar sesión
        </Button>
      </form>
    </>
  );
}
