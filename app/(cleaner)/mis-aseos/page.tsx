import type { Metadata } from 'next';
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

      {/* Cerrar sesion no necesita ni un gramo de JavaScript de cliente. */}
      <form action={cerrarSesion} className="pt-xl">
        <Button type="submit" variant="outline" className="min-h-toque w-full text-body-movil">
          Cerrar sesión
        </Button>
      </form>
    </>
  );
}
