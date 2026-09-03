import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { listarApartamentos, listarClusters } from '@/lib/data/apartamentos';
import { createClient } from '@/lib/supabase/server';

import { TablaApartamentos } from './_components/TablaApartamentos';

export const metadata: Metadata = {
  title: 'Apartamentos · VivaGuest',
};

/**
 * `/apartamentos` — APTO-11 y la mitad del criterio 5 del ROADMAP (UI-SPEC §7).
 *
 * RSC: construye el cliente con el JWT del admin y lee. La lectura la filtra la
 * RLS (`properties_admin_all`, `profiles_admin_all`); no hay ninguna ruta de API
 * nueva ni ninguna funcion nueva en `public`. El layout de `(admin)` ya declara
 * `force-dynamic`, asi que la pagina nunca se cachea: son datos por usuario.
 *
 * ── NO HAY `EstadoVacio` PARA LA LISTA COMPLETA, Y ES DELIBERADO ────────────
 * Las 39 unidades reales estan sembradas desde la Fase 1. Esta lista no puede
 * estar vacia salvo que alguien borre el catalogo, y en ese caso lo correcto NO
 * es una tarjeta amable: es una tabla vacia que grita que falta algo. El "vacio"
 * del dia uno son 39 filas de placeholders, y lo que aplica ahi es el banner de
 * montaje de §9.1, que vive dentro de la tabla.
 *
 * ── LAS DOS LECTURAS SON UNA SOLA CONSULTA ─────────────────────────────────
 * `listarClusters` es PURA y sale de las filas ya cargadas: `properties.cluster`
 * es `text not null` y no existe ninguna tabla de clusters que consultar. Pedirla
 * a la base seria una segunda ida por un dato que ya esta en memoria.
 */
export default async function ApartamentosPage() {
  const supabase = await createClient();
  const filas = await listarApartamentos(supabase);
  const clusters = listarClusters(filas);

  return (
    <div className="flex flex-col gap-xl">
      {/* Cabecera de pagina de §6.2: titulo a la izquierda, accion primaria a la
          derecha, en la misma linea. */}
      <div className="flex items-center justify-between gap-lg">
        <h1 className="text-display text-foreground">Apartamentos</h1>

        {/*
          El unico boton primario de la pantalla (§4.4: un acento por pantalla).
          Apunta a `/apartamentos/nuevo`, que construye el plan 02-12.
        */}
        <Button render={<Link href="/apartamentos/nuevo" />}>
          <Plus aria-hidden="true" />
          Nuevo apartamento
        </Button>
      </div>

      {/*
        La toolbar y el banner viven DENTRO de la tabla y no aqui: los tres
        controles son estado de cliente y el de pendientes esta dentro del propio
        banner. Repartirlos entre este RSC y el componente de cliente obligaria a
        un tercer componente que envolviera a los dos, que seria este mismo con
        otro nombre.
      */}
      <TablaApartamentos filas={filas} clusters={clusters} />
    </div>
  );
}
