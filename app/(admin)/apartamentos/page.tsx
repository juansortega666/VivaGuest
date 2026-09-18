import type { SupabaseClient } from '@supabase/supabase-js';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { Database } from '@/lib/database.types';
import { listarApartamentos, listarClusters } from '@/lib/data/apartamentos';
import { identificadorValido } from '@/lib/data/finanzas-detalle';
import {
  leerCheckoutsDelMes,
  leerFeedDeApartamento,
  leerProximoAseo,
} from '@/lib/data/panel-apartamento';
import { hoyBog } from '@/lib/domain/dates';
import { createClient } from '@/lib/supabase/server';

import { PanelApartamento } from './_components/PanelApartamento';
import { PanelCalendario, type DatosDelCalendario } from './_components/PanelCalendario';
import { TablaApartamentos } from './_components/TablaApartamentos';

/**
 * Los valores que el parametro de vista admite. Es una union CERRADA: cualquier
 * otro valor se trata como ausencia y se pinta la ficha.
 *
 * NO SE REDIRIGE Y NO SE LIMPIA EL PARAMETRO, que es la regla 4 de §11.4
 * aplicada al segundo parametro: una direccion escrita a mano tiene que enseñar
 * la pantalla, no un error que nadie sabria explicar, y reescribirla romperia un
 * enlace que alguien pego en un chat.
 */
const VISTAS = ['calendario'] as const;
type Vista = (typeof VISTAS)[number];

function vistaValida(crudo: unknown): Vista | null {
  return typeof crudo === 'string' && (VISTAS as readonly string[]).includes(crudo)
    ? (crudo as Vista)
    : null;
}

/**
 * Las DOS lecturas de la vista de calendario, en paralelo y en un solo viaje de
 * espera (§8.2).
 *
 * Van juntas y no encadenadas porque no dependen una de otra: encadenarlas
 * sumaria los dos viajes en el tiempo que el esqueleto esta a la vista sin
 * ganar nada. Y la promesa entera baja SIN RESOLVER al panel, que es quien
 * tiene la barrera de suspension.
 */
async function leerElCalendario(
  supabase: SupabaseClient<Database>,
  apartamentoId: string,
  mes: string,
): Promise<DatosDelCalendario> {
  const [checkouts, feed] = await Promise.all([
    leerCheckoutsDelMes(supabase, apartamentoId, mes),
    leerFeedDeApartamento(supabase, apartamentoId),
  ]);

  return { checkouts, feed };
}

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
 * `&vista=calendario` la cambia a la vista de checkouts de §8. El patron es el
 * de `app/(admin)/finanzas/pagos/page.tsx`, copiado con sus comentarios: leer el
 * parametro, comprobar su forma, resolverlo contra lo que esta pagina YA LEYO, y
 * solo entonces pedir lo que falte.
 *
 * ── UN SOLO PANEL CON DOS CUERPOS, NUNCA DOS PANELES ───────────────────────
 *
 * Los dos parametros gobiernan la MISMA superficie: el primero dice QUE
 * apartamento y el segundo QUE CUERPO. §1.2 descarta por nombre el panel
 * apilado (dos velos, dos trampas de foco anidadas y una tecla de escape que
 * nadie sabe que cierra), asi que esta pagina renderiza uno de los dos cuerpos
 * en el MISMO hueco y **la clave no cambia al cambiar de vista**: es el
 * identificador del apartamento en los dos casos.
 *
 * Y cada cuerpo consume `PanelLectura` POR DENTRO: esta pagina no lo nombra.
 *
 * ── CADA VISTA PAGA SOLO LO SUYO ───────────────────────────────────────────
 *
 *     sin panel                  4 consultas
 *     panel en la ficha          5   (+ el proximo aseo)
 *     panel en el calendario     6   (+ los checkouts del mes y el feed)
 *
 * Las dos ramas son excluyentes: con la vista de calendario pedida, el proximo
 * aseo NO se lee, porque ese cuerpo no lo pinta.
 *
 * ── LA PANTALLA DE CONEXION DEL CALENDARIO NO SE TOCA ──────────────────────
 *
 * `app/(admin)/apartamentos/[id]/calendario/` se queda EXACTAMENTE como estaba.
 * El ROADMAP decia que esa pantalla pasaba a panel; medida, es el formulario de
 * conexion de APTO-12, con siete estados de validacion en vivo contra la red, y
 * D8-4 lista para el panel tres cosas que no estan ahi. §0.1, conflicto A.
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

  // EL SEGUNDO PARAMETRO, con la misma disciplina que el primero: se comprueba
  // la forma y un valor desconocido se trata como ausencia. `?vista=galeria`
  // pinta la ficha, sin redireccion y sin limpiar la direccion.
  const vista = vistaValida(parametros.vista);

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

  // La inversa de la anterior: el mismo apartamento SIN la vista, que es la
  // ficha. La usa el chevron de volver del panel de calendario (§8.2), y se
  // compone aqui por la misma razon que las otras dos: la INSTRUCCION 5 del
  // VEREDICTO prohibe la consulta literal, porque borra los parametros vivos del
  // anfitrion AL NAVEGAR.
  const deLaFicha = new URLSearchParams(vivos);
  if (abierto !== null) deLaFicha.set('apartamento', abierto.id);

  // El dia de negocio se lee UNA VEZ y en el servidor, y baja como prop. Con el
  // reloj del navegador el panel se hidrataria con otro "hoy" que el que se
  // renderizo, y ademas el proceso corre en UTC: pasadas las 19:00 de Bogota un
  // `new Date()` a secas ya dice mañana.
  const hoy = hoyBog();
  const mes = hoy.slice(0, 7);

  // LAS LECTURAS DEL PANEL, CADA UNA SOLO CUANDO SU VISTA ESTA PEDIDA, y las dos
  // SIN ESPERAR a proposito: la promesa la resuelve la barrera de suspension de
  // dentro del panel, que es la que pinta el esqueleto mientras tanto. Con la
  // direccion sin parametro, ninguna de las dos se dispara.
  const proximoAseo =
    abierto === null || vista === 'calendario' ? null : leerProximoAseo(supabase, abierto.id);

  const calendario =
    abierto === null || vista !== 'calendario'
      ? null
      : leerElCalendario(supabase, abierto.id, mes);

  /*
    EL HUECO DEL PANEL ES UNO SOLO, Y LA CLAVE ES LA MISMA EN LOS DOS CUERPOS.

    `key={abierto.id}` para que abrir un SEGUNDO apartamento no reutilice el
    arbol del primero: sin ella no vuelve a hacer su entrada, no recoloca el foco
    y se veria el nombre nuevo dentro del panel viejo.

    **NO sobre la barrera de suspension y NO sobre nada que envuelva a la tabla**
    (INSTRUCCION 3). Ahi forzaria el remonte del subarbol y se llevaria por
    delante las tres piezas del filtro de cliente, que hoy sobreviven medidas.

    Y **no se deriva de la vista**: cambiar de cuerpo no es abrir otro panel.
  */
  let panel: ReactNode = null;

  if (abierto !== null && calendario !== null) {
    panel = (
      <PanelCalendario
        key={abierto.id}
        fila={abierto}
        hoy={hoy}
        mes={mes}
        datos={calendario}
        rutaAlCerrar={rutaAlCerrar}
        rutaDeLaFicha={`/apartamentos?${deLaFicha.toString()}`}
      />
    );
  } else if (abierto !== null && proximoAseo !== null) {
    panel = (
      <PanelApartamento
        key={abierto.id}
        fila={abierto}
        proximoAseo={proximoAseo}
        rutaAlCerrar={rutaAlCerrar}
        rutaDelCalendario={`/apartamentos?${conCalendario.toString()}`}
      />
    );
  }

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

      {panel}
    </div>
  );
}
