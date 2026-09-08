import { CircleDashed } from 'lucide-react';
import type { Metadata } from 'next';

import { listarAseadoresConAsignaciones } from '@/lib/data/aseadores';
import { createClient } from '@/lib/supabase/server';

import { EstadoVacio } from '../_components/EstadoVacio';
import { DialogoCrearAseador } from './_components/DialogoCrearAseador';
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
          El diálogo trae su propio disparador con el copy `Crear aseador` de §15.
          La autorización NO la da renderizarlo aquí: `crearAseador()` arranca con
          `exigirAdmin()` porque una Server Action es un endpoint HTTP público.
        */}
        <DialogoCrearAseador />
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
          // El de la cabecera y este son mutuamente excluyentes: nunca se
          // renderizan los dos a la vez, así que no hay dos disparadores
          // compitiendo por el mismo nombre accesible.
          accion={<DialogoCrearAseador />}
        />
      ) : (
        <TablaAseadores aseadores={aseadores} />
      )}
    </div>
  );
}
