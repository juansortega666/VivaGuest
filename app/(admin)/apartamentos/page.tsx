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
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA RUTA NO TIENE ARCHIVO DE CARGA DE SEGMENTO, Y ES DELIBERADO. MEDIDO EL
 * 2026-09-17 EN EL PLAN 08-02.
 *
 * Lo tuvo, con un esqueleto de geometria real que reproducia el banner de
 * montaje, la toolbar y las diez primeras filas de la tabla. Se borro porque era
 * la causa medida de que ABRIR UN PANEL LATERAL mandara la lista al tope.
 *
 * `loading.tsx` es el fallback de Suspense DEL SEGMENTO, y tambien se aplica
 * cuando solo cambian los parametros de la consulta. Abrir `?apartamento={id}`
 * es exactamente eso. La cabecera de `app/(admin)/finanzas/page.tsx` ya lo dejo
 * escrito con ocho corridas; esta medicion lo confirma sobre esta ruta y añade
 * el mecanismo.
 *
 * El A/B, tres corridas por rama, apartando el archivo del arbol:
 *
 *     CON el archivo:  scrollY  1057 -> 0        3 de 3
 *     SIN el archivo:  scrollY  1057 -> 1057     3 de 3
 *
 * El mecanismo: el fallback SE ACTIVA aunque NO LLEGUE A PINTARSE (cero
 * apariciones en doce corridas, porque la respuesta del servidor vuelve en
 * ~70 ms). Al activarse, el contenido del segmento se desmonta un instante, el
 * documento pierde altura, el navegador recorta la posicion a cero, y cuando el
 * contenido vuelve la posicion ya se perdio. Por eso nadie llama a `scrollTo` y
 * por eso el estado de React del cliente SI sobrevive: un fallback de Suspense
 * no desmonta el arbol, lo oculta.
 *
 * El escenario de control cierra el caso: un enlace de cliente que NO abre
 * ningun panel pierde el scroll igual. **No es el panel**, y por eso
 * `components/ui/sheet.tsx` no se toca.
 *
 * **Lo que se pierde:** el esqueleto de la PRIMERA carga de esta ruta. Es un
 * coste real y acotado, identico al que se acepto en `/finanzas`, y es mucho
 * menor que un criterio del ROADMAP incumplido.
 *
 * **Lo que NO se toca:** los demas archivos de carga del arbol. Esta fase borra
 * exactamente dos, este y el de `/operacion`.
 *
 * **Y queda PROHIBIDO reintroducirlo** "para recuperar el esqueleto", ni ahora
 * ni despues, sin volver a correr la medicion de `08-02-MEDICION.md` §3.
 * ════════════════════════════════════════════════════════════════════════════
 */

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
