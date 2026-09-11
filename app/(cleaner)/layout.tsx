import { BannerAvisos } from '@/app/(cleaner)/_components/BannerAvisos';
import { exigirSesion } from '@/lib/auth/guards';
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
   * exactamente el estado S4. Sin este dato, el hook no tendria con que comparar
   * y **repararia en silencio en cada arranque de la app**, rotando el endpoint
   * y dejando huerfanos los avisos ya encolados al anterior.
   *
   * NO es una credencial que se filtre a nadie: es el endpoint del propio
   * telefono del propio usuario, y la policy `push_subs_own_all` ya acota la
   * consulta a sus filas. El `.eq('user_id', …)` es la segunda capa.
   *
   * DEUDA DECLARADA: se toma UNA suscripcion, la viva mas reciente. Un aseador
   * con DOS telefonos vivos haria que el segundo no coincidiera y se reparase en
   * cada arranque. El hook de `hooks/usarEstadoDeAvisos.ts` recibe un endpoint y
   * no un conjunto, y ampliarlo seria una modificacion de aquel modulo. Con ocho
   * aseadores de un telefono cada uno, el caso no existe hoy.
   */
  const { data: suscripcion } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
          endpointRegistrado={suscripcion?.endpoint ?? null}
        />

        {children}
      </main>
    </div>
  );
}
