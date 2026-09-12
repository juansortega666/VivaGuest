import { BannerAvisos } from '@/app/(cleaner)/_components/BannerAvisos';
import { exigirSesion } from '@/lib/auth/guards';
import { leerEndpointDePushPropio } from '@/lib/data/avisos';
import { publicEnv } from '@/lib/env';

/**
 * Shell del aseador. Una columna de 480px como maximo, pensada para telefono.
 *
 * FUERA DE ALCANCE EN ESTA FASE, y no se construye nada de esto aqui: navegacion
 * inferior, checklist por cuarto, camara y cola offline. Eso es Fase 6.
 *
 * El manifest, el service worker y el banner de avisos SI son de esta fase y ya
 * existen: los dos primeros en `app/manifest.ts` y `app/sw.ts`, y el tercero es
 * el primer hijo de `<main>` de aqui abajo.
 *
 * El guard de sesion NO autoriza nada: la frontera es la RLS. Lo que evita es
 * renderizar un shell entero a alguien sin sesion, que ademas seria un shell
 * vacio y confuso. El middleware ya redirige antes de llegar aqui; esto es la
 * segunda capa, por si el middleware se salta (CVE-2025-29927 y sucesores).
 *
 * El objetivo de toque de 44px (`min-h-toque`) aplica SOLO dentro de este arbol
 * (UI-SPEC §2), y 56px (`min-h-toque-comodo`) en las acciones que deciden la
 * fase: el aseador usa el telefono con guantes o las manos mojadas. La escala
 * tipografica de este arbol es la movil de `05-UI-SPEC` §3.1, con sufijo, y
 * `scripts/ci/check-escala-movil.sh` lo impone.
 */
export default async function CleanerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user } = await exigirSesion();

  /**
   * El endpoint que el servidor tiene registrado para este aseador.
   *
   * Baja al cliente porque es contra esto que el hook compara la suscripcion
   * viva del navegador: una suscripcion que el navegador rehizo por su cuenta es
   * exactamente el estado S4.
   *
   * La consulta vive en `lib/data/avisos.ts` y no escrita aqui desde el plan
   * 05-15, cuando la franja de permiso del admin (§13) paso a necesitar la misma
   * lectura: dos copias del mismo `select` serian dos sitios donde cambiar la
   * forma del dato. Las razones de por que no es opcional y de por que no filtra
   * ninguna credencial estan escritas alli.
   */
  const endpointRegistrado = await leerEndpointDePushPropio(supabase, user.id);

  return (
    <div className="min-h-svh bg-canvas">
      <main className="mx-auto flex w-full max-w-aseador flex-col gap-lg p-lg">
        {/*
          PRIMER HIJO DE `<main>`, encima del `<h1>` de cada pagina (§7). No es
          sticky, no es modal, no flota y no roba el foco. Mientras no sepa en
          que estado esta el telefono no renderiza nada (§15.2).
        */}
        <BannerAvisos
          clavePublica={publicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
          endpointRegistrado={endpointRegistrado}
        />

        {children}
      </main>
    </div>
  );
}
