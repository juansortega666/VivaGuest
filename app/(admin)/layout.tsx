import { redirect } from 'next/navigation';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import { leerCampana } from '@/lib/data/campana';

import { TopNav } from './_components/TopNav';

/**
 * Shell del admin (UI-SPEC §6).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL ROUTE GROUP NO AUTORIZA NADA.
 *
 * Que un boton se renderice dentro de `(admin)` no hace segura la accion que
 * dispara: un Server Action es un endpoint HTTP publico y cualquiera puede
 * invocarlo con su id y su payload, sin pasar jamas por este layout. Por eso
 * CADA action de la fase arranca con su propio `exigirAdmin()`, y por eso la
 * frontera de verdad son `profiles_admin_all` y `properties_admin_all` en
 * Postgres. Este guard es la tercera capa, no la primera.
 *
 * Lo que compra: no renderizar un panel entero a quien no puede leer ni una fila,
 * y fallar con una redireccion en vez de con una pantalla vacia sin causa.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── LA CAMPANA DE ALERTAS SE LEE AQUI, Y NO ES UN DESCUIDO DE CAPAS (D-05-9) ─
 *
 * `leerCampana()` vive en este layout porque la campana vive en `TopNav`, o sea en el
 * SHELL, y en App Router el shell es el layout. **No hay forma de que una pagina
 * rellene una ranura de su layout.** El coste en consultas, la consecuencia sobre D-14
 * y la inversion del toggle `Ver atendidas` a estado de cliente estan escritos enteros
 * en la cabecera de `lib/data/campana.ts`. Se leen antes de tocar esto.
 *
 * El reloj se lee UNA vez aqui y baja por parametro, que es lo que D-14 pide: llamar
 * `Date.now()` dentro de cada lectura daria respuestas distintas a la misma pregunta.
 *
 * `force-dynamic` tampoco es cosmetico. Todo lo que cuelga de aqui son datos por
 * usuario, y una respuesta cacheada se sirve a otro usuario: es la fuga de
 * informacion mas barata de provocar y la mas cara de detectar. Con 39
 * apartamentos y ~8 aseadores no hay ningun beneficio de rendimiento que
 * justifique memoizar la lectura entre peticiones, ni con el helper de cache de
 * Next ni con la directiva de cache de React. Ninguno de los dos aparece en este
 * subarbol, y el nombre literal de ninguno se escribe aqui: en este repo ya han
 * mordido cuatro veces los comentarios que citan el token que un grep vigila.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Solo se traga `NoAutorizado`. Un fallo de entorno o de red tiene que
  // propagarse y romper: convertirlo en una redireccion a /login manda al usuario
  // a teclear otra vez una contrasena que estaba bien, y esconde la causa real.
  const contexto = await exigirAdmin().catch((error: unknown) => {
    if (error instanceof NoAutorizado) return null;
    throw error;
  });

  if (!contexto) redirect('/login');

  const { supabase, user } = contexto;

  // El nombre sale de `profiles`, que es la fuente de verdad del perfil, y no de
  // `user_metadata`: ese lo puede reescribir el propio usuario y solo alimenta el
  // trigger que materializa la fila. Si por lo que sea no hay fila, se cae al
  // email antes que a un espacio en blanco.
  const { data: perfil } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const nombre = perfil?.full_name ?? user.email ?? 'Administrador';

  // UNA sola lectura del reloj para todo el shell (D-14). Ver la cabecera.
  const alertas = await leerCampana(supabase, user.id, Date.now());

  return (
    <div className="min-h-[calc(100svh-var(--alto-barra-pruebas,0px))] bg-canvas">
      <TopNav nombre={nombre} alertas={alertas} />

      {/* Contenedor de contenido de §6.2: 1440px, centrado, 24px de padding
          lateral y superior, 48px por debajo. */}
      <main className="mx-auto w-full max-w-admin px-xl pt-xl pb-3xl">{children}</main>
    </div>
  );
}
