import { CircleDashed } from 'lucide-react';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';
import { listarAseadoresConAsignaciones } from '@/lib/data/aseadores';
import { createClient } from '@/lib/supabase/server';

import { EstadoVacio } from '../_components/EstadoVacio';
import { TablaAseadores } from './_components/TablaAseadores';

export const metadata: Metadata = {
  title: 'Aseadores · VivaGuest',
};

/**
 * `/aseadores` — ASEADOR-03 (UI-SPEC §11.1).
 *
 * RSC: construye el cliente con el JWT del admin y lee. La lectura va por
 * PostgREST y la filtra la RLS (`profiles_admin_all`, `properties_admin_all`); no
 * hay ninguna ruta de API nueva ni ninguna funcion nueva en `public`.
 *
 * El layout de `(admin)` ya declara `force-dynamic`, asi que esta pagina nunca se
 * cachea: son datos por usuario.
 */
export default async function AseadoresPage() {
  const supabase = await createClient();
  const aseadores = await listarAseadoresConAsignaciones(supabase);

  return (
    <div className="flex flex-col gap-xl">
      {/* Cabecera de pagina de §6.2: titulo a la izquierda, accion primaria a la
          derecha, en la misma linea. */}
      <div className="flex items-center justify-between gap-lg">
        <h1 className="text-display text-foreground">Aseadores</h1>

        {/*
          EL BOTON QUEDA MONTADO Y SIN DIALOGO EN ESTE PLAN. El diálogo de alta
          (ASEADOR-01) llega en el 02-08 y ahi se cablea, con su propio guard: la
          Server Action que cree la cuenta es un endpoint HTTP publico y no la
          autoriza el hecho de renderizarse aqui dentro.

          Que hoy no haga nada es aceptable dentro de la fase; que no exista
          rompería el layout que el 02-08 espera encontrar.
        */}
        <Button type="button">Crear aseador</Button>
      </div>

      {aseadores.length === 0 ? (
        <EstadoVacio
          // `CircleDashed` sale de la lista cerrada de §14.3. Lee como "aqui
          // todavia no hay nada"; en §5 marca el estado Informativa, pero ese
          // estado solo existe en la tabla de apartamentos, asi que no se cruzan
          // en ninguna pantalla. Traer un icono de fuera de la lista seria
          // modificar el contrato de diseño.
          icono={CircleDashed}
          encabezado="Todavía no hay aseadores."
          cuerpo="Las cuentas las creas tú: el aseador no puede registrarse por su cuenta."
          accion={<Button type="button">Crear aseador</Button>}
        />
      ) : (
        <TablaAseadores aseadores={aseadores} />
      )}
    </div>
  );
}
