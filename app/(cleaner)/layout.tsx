import { exigirSesion } from '@/lib/auth/guards';

/**
 * Shell del aseador. Una columna de 480px como maximo, pensada para telefono.
 *
 * FUERA DE ALCANCE EN ESTA FASE, y no se construye nada de esto aqui: manifest,
 * service worker, banner de instalacion, navegacion inferior, checklist, camara y
 * cola offline. Todo eso es Fase 5 y Fase 6. Este arbol existe SOLO para que
 * PLAT-07 (el aseador entra y aterriza en su superficie) tenga a donde aterrizar.
 *
 * El guard de sesion NO autoriza nada: la frontera es la RLS. Lo que evita es
 * renderizar un shell entero a alguien sin sesion, que ademas seria un shell
 * vacio y confuso. El middleware ya redirige antes de llegar aqui; esto es la
 * segunda capa, por si el middleware se salta (CVE-2025-29927 y sucesores).
 *
 * El objetivo de toque de 44px (`min-h-toque`) aplica SOLO dentro de este arbol
 * (UI-SPEC §2): el aseador usa el telefono con guantes o las manos mojadas.
 */
export default async function CleanerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await exigirSesion();

  return (
    <div className="min-h-svh bg-canvas">
      <main className="mx-auto flex w-full max-w-aseador flex-col gap-lg p-lg">
        {children}
      </main>
    </div>
  );
}
