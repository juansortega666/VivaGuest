import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { listarApartamentos, listarClusters } from '@/lib/data/apartamentos';
import { identificadorValido } from '@/lib/data/finanzas-detalle';
import { leerProximoAseo } from '@/lib/data/panel-apartamento';
import { createClient } from '@/lib/supabase/server';

import { PanelApartamento } from './_components/PanelApartamento';
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
 *
 * ── ESTA PAGINA ES TAMBIEN EL ANFITRION DEL PANEL DE APARTAMENTO (D8-8) ────
 *
 * `?apartamento={uuid}` abre la ficha de lectura encima de la lista, y
 * `&vista=calendario` la cambia a la vista de checkouts que llena el plan 08-10.
 * El patron es el de `app/(admin)/finanzas/pagos/page.tsx`, copiado con sus
 * comentarios: leer el parametro, comprobar su forma, resolverlo contra lo que
 * esta pagina YA LEYO, y solo entonces pedir lo que falte.
 *
 * ── EL FILTRO DE LA TABLA NO SE TOCA, Y ESO ESTA MEDIDO ────────────────────
 *
 * `TablaApartamentos` conserva sus tres piezas de estado de cliente (busqueda,
 * cluster y solo pendientes) exactamente donde estaban. La tentacion razonable
 * era moverlas a la direccion para que sobrevivieran a la apertura del panel;
 * el VEREDICTO 1 de `08-02-MEDICION.md` lo **descarto midiendo**: el filtro
 * SOBREVIVE hoy, 3 de 3 corridas, al abrir y al cerrar, porque un fallback de
 * Suspense no desmonta el arbol de React sino que lo oculta. Lo que se perdia
 * era el scroll, y eso ya lo arreglo el plan 08-04 borrando el archivo de carga
 * de segmento de esta ruta.
 *
 * La consecuencia practica, y es la INSTRUCCION 3 del VEREDICTO: **ninguna
 * clave derivada de los parametros de busqueda en nada que envuelva a la
 * tabla**. Una clave ahi fuerza el remonte del subarbol y borraria las tres
 * piezas que hoy sobreviven, cambiando media mejora por media regresion. La
 * unica clave de este archivo va sobre el panel.
 */
export default async function ApartamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;

  // PRIMERO LA FORMA, ANTES DE TOCAR LA BASE. Una cadena arbitraria en la
  // direccion llegaria a Postgres como argumento de tipo identificador y
  // volveria como `22P02`, o sea un error de sintaxis que la pantalla no sabria
  // explicar. La funcion ya existe y se reutiliza: un regex nuevo seria una
  // segunda definicion de la misma forma.
  const crudo = parametros.apartamento;
  const pedido = identificadorValido(typeof crudo === 'string' ? crudo : undefined);

  const supabase = await createClient();
  const filas = await listarApartamentos(supabase);
  const clusters = listarClusters(filas);

  // El identificador del panel llega de fuera, asi que se comprueba contra lo que
  // esta pagina ya leyo en vez de mandarlo a la base a ver que pasa. No es una
  // frontera de seguridad —la RLS del admin ya deja ver las 39 filas— sino de
  // comportamiento: una direccion escrita a mano tiene que enseñar la pantalla,
  // no un error que nadie sabria explicar.
  //
  // Y ESTE PATRON FUNCIONA AQUI PORQUE LA LISTA NO TIENE FILTRO DE SERVIDOR:
  // `listarApartamentos` trae las 39 filas enteras, asi que un apartamento que
  // existe siempre esta en `filas`. En un anfitrion que leyera una ventana
  // recortada, "no aparece" y "no existe" serian cosas distintas y esta
  // comprobacion mentiria.
  //
  // Si no aparece: `abierto` se queda nulo y el panel simplemente NO SE
  // RENDERIZA. Sin 404, sin toast, sin panel vacio, sin redireccion, y el
  // parametro huerfano SE QUEDA en la direccion: limpiarlo reescribiria un
  // enlace que alguien pego en un chat (§11.4).
  const abierto = pedido === null ? null : (filas.find((f) => f.id === pedido) ?? null);

  // LAS DOS DIRECCIONES SE COMPONEN AQUI, EN EL SERVIDOR, donde los parametros
  // ya estan normalizados, y bajan como props.
  //
  // Hoy `/apartamentos` no gobierna ningun otro parametro, asi que cerrar es la
  // ruta a secas. Se compone igual, y no se escribe como constante dentro del
  // componente, por dos razones medidas: es el patron que los otros tres
  // anfitriones SI necesitan (`alertas` en `/operacion`, `rango` y `ancla` en
  // `/finanzas`), y tener cuatro formas distintas de cerrar es exactamente como
  // se olvida una. La INSTRUCCION 5 del VEREDICTO lo dice del lado de abrir: un
  // `href` con consulta literal borro el `?alertas=atendidas` AL ABRIR, antes de
  // que el cierre tuviera nada que conservar.
  const vivos = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    // Los dos que gobierna el panel se quitan y los vuelve a poner quien los
    // necesite. Todo lo demas viaja intacto.
    if (clave === 'apartamento' || clave === 'vista') continue;
    if (typeof valor === 'string') vivos.set(clave, valor);
    else if (Array.isArray(valor)) for (const uno of valor) vivos.append(clave, uno);
  }

  const cola = vivos.toString();
  const rutaAlCerrar = cola === '' ? '/apartamentos' : `/apartamentos?${cola}`;
  /** Los parametros vivos que el enlace de apertura de cada fila tiene que conservar. */
  const parametrosVivos = cola;

  const conCalendario = new URLSearchParams(vivos);
  if (abierto !== null) conCalendario.set('apartamento', abierto.id);
  conCalendario.set('vista', 'calendario');

  // LA QUINTA CONSULTA DE LA PANTALLA, Y SOLO CUANDO EL PANEL ESTA ABIERTO.
  // Va sin esperar a proposito: la promesa la resuelve la barrera de suspension
  // de dentro del panel, que es la que pinta el esqueleto mientras tanto. Con la
  // direccion sin parametro, esta lectura ni siquiera se dispara.
  const proximoAseo = abierto === null ? null : leerProximoAseo(supabase, abierto.id);

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
      <TablaApartamentos
        filas={filas}
        clusters={clusters}
        parametrosVivos={parametrosVivos}
        abiertoId={abierto?.id ?? null}
      />

      {abierto !== null && proximoAseo !== null && (
        <PanelApartamento
          // LA CLAVE VA AQUI Y EN NINGUN OTRO SITIO. Sobre el panel, para que
          // abrir un segundo apartamento no reutilice el arbol del primero: sin
          // ella no vuelve a hacer su entrada, no recoloca el foco y se veria el
          // nombre nuevo dentro del panel viejo.
          //
          // **NO sobre la barrera de suspension y NO sobre nada que envuelva a
          // la tabla** (INSTRUCCION 3). Ahi forzaria el remonte del subarbol y
          // se llevaria por delante las tres piezas del filtro de cliente, que
          // hoy sobreviven medidas.
          key={abierto.id}
          fila={abierto}
          proximoAseo={proximoAseo}
          rutaAlCerrar={rutaAlCerrar}
          rutaDelCalendario={`/apartamentos?${conCalendario.toString()}`}
        />
      )}
    </div>
  );
}
