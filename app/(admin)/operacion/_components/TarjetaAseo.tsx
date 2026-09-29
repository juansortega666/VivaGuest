import { Flag, Hourglass, Zap } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { FilaDeOperacion } from '@/lib/data/operacion';
import { horaLimiteVencida } from '@/lib/domain/alertas';
import { copyDeReviewReason, estadoDeAseo } from '@/lib/domain/cleanings';
import { formatHoraLimite } from '@/lib/domain/dates';

import { EstadoAseo } from './EstadoAseo';
import { MenuAseo, type ContextoDeAcciones } from './MenuAseo';
import { SenalSinEvidencia } from './SenalSinEvidencia';

/**
 * LA TARJETA DE UN ASEO (plan 10-05). Sustituye a `FilaAseo`.
 *
 * Es LA MISMA FILA reorganizada en vertical dentro de 360px, no un componente
 * nuevo: la tabla de seis columnas del contrato de la Fase 4 no cabe en la columna
 * estrecha del rediseño (sus cinco columnas fijas ya sumaban 532px).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LO QUE HEREDA DE `FilaAseo`, SIN EXCEPCIÓN Y SIN REINTERPRETAR.
 *
 * Cada una de estas piezas es una decisión ya tomada, medida o pagada en la Fase
 * 4, la 5 y la 6. La tarjeta las trae íntegras:
 *
 *   · `EstadoAseo` tal cual, con su `data-estado`. No se dobla ni se reescribe:
 *     lo importan además `finanzas/_components/BloqueAhoraMismo.tsx` y
 *     `apartamentos/_components/PanelApartamento.tsx`.
 *   · LAS CUATRO SEÑALES INLINE con sus literales y sus nombres accesibles
 *     exactos (`Entra huésped el mismo día`, el copy del motivo de revisión,
 *     `Se venció la hora límite`, y la de evidencia incompleta).
 *   · EL BADGE DE TIPO, con `normal` SIN badge.
 *   · LA DIFERENCIA ENTRE `sin definir` Y `no aplica`, que no es estilo: el
 *     primero dice que el dato falta y alguien tiene que ponerlo; el segundo, que
 *     la base lo PROHÍBE por `cl_unmanaged_is_inert`.
 *   · `Sin asignar` EN COLOR DE AVISO, porque un aseo sin nadie detrás es lo único
 *     de ese dato sobre lo que hay que hacer algo.
 *   · EL ANCLA CON SU ÁREA ESTIRADA, su etiqueta accesible, su `scroll={false}` y
 *     su `href` compuesto de los parámetros vivos. **La tarjeta NO es un `<div>`
 *     clicable**: eso saca el enlace del recorrido de teclado.
 *   · LA CELDA DEL MENÚ POR ENCIMA, con su `relative z-10`: sin eso el clic en el
 *     `⋯` cae en el `::after` del ancla y navega en vez de abrir el menú.
 *   · LA RAMA INERTE CON SUS TRES REGLAS: no reacciona al mouse, no tiene área de
 *     clic completa, y no se pinta gris entera (eso la haría leer como
 *     deshabilitada por fallo).
 *   · `id="aseo-{id}"` CON SU COMPENSACIÓN DE LA BARRA, que es el destino de las
 *     alertas de la campana.
 *   · EL `aria-current` DE LA TARJETA ABIERTA.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LO QUE ESTE PLAN AÑADE, Y SON TRES COSAS ─────────────────────────────
 *
 * **1. EL SIN CONFIRMAR ES UN ESTADO DE LA TARJETA Y SE VE DE UN VISTAZO.**
 *
 * `BandejaSinConfirmar` dejó de existir como sección: su información pasó a ser un
 * estado de cada tarjeta, dentro de la misma lista del día. El canal es el que el
 * dominio ya da —icono `Inbox`, etiqueta `Sin confirmar` y `text-status-warn`, los
 * tres de `PRESENTACION` en `lib/domain/cleanings.ts`— reforzado por un **borde
 * izquierdo de la tarjeta en el mismo color de estado**.
 *
 * **Ese borde es la única excepción a la regla de no decoración, y no es una
 * excepción: es COLOR DE ESTADO**, que es exactamente lo que el dueño reservó
 * cuando dijo que el color está reservado en exclusiva a estado y alerta. Va
 * escrito con estas palabras porque es la clase de decisión que un auditor de
 * diseño va a marcar, y la respuesta tiene que estar acá y no en una conversación.
 *
 * **2. LA TARJETA SIN CONFIRMAR NO FLOTA ARRIBA.** Esto invierte a medias el
 * contrato que `TablaDia.tsx` tenía escrito, así que se dice en vez de cambiarlo en
 * silencio. Decía: los sin confirmar NO flotan arriba porque su superficie es la
 * bandeja del carril, y duplicarlos arriba del día los listaría dos veces en la
 * misma pantalla. **Esa razón murió con la bandeja.** La que la sustituye es otra y
 * es más fuerte: reordenar por estado hace que la MISMA tarjeta cambie de sitio
 * cuando alguien la confirma, debajo del cursor, en una lista que se refresca sola
 * por tiempo real. El orden dentro del día sigue siendo hora límite y después
 * nombre.
 *
 * **3. NINGUNA TARJETA ATRASADA SE TINTA, ni cambia de peso, ni de alto.** La
 * prohibición de 05-UI-SPEC §12.5 NO CADUCA al pasar de `TableRow` a tarjeta. Lo
 * que distinguía un atrasado era el bloque `Atrasados`; ahora lo distingue **el
 * selector de día**, que es un canal de mucho más ancho de banda que un tinte: no
 * es que la tarjeta se vea distinta, es que estás mirando otro día.
 */

/**
 * El em dash de un dato que no está, con su explicación para lector de pantalla.
 *
 * ── LA DIFERENCIA ENTRE "sin definir" Y "no aplica" NO ES ESTILO (§7.4) ─────
 * En una tarjeta gestionada sin confirmar, HUÉSPEDES está vacío porque el dato
 * todavía no existe y alguien tiene que ir a ponerlo: "sin definir". En una tarjeta
 * inerte, HORA LÍMITE y HUÉSPEDES están vacíos porque la base los PROHÍBE por
 * `cl_unmanaged_is_inert`: "no aplica". Decir "sin definir" ahí sugeriría que
 * alguien debería ir a llenarlo, y no hay nada que llenar.
 */
function SinDato({ motivo }: { motivo: 'sin definir' | 'no aplica' }) {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{motivo}</span>
    </span>
  );
}

/**
 * Tipo de aseo: badge INLINE, nunca columna propia (§5.1).
 *
 * `normal` no lleva badge: es el default, y un badge que diga `Normal` en 27 de 30
 * tarjetas es puro ruido. Los otros dos van sin icono, porque llevan texto y el
 * texto ya cumple la regla de nunca color solo.
 *
 * `text-micro font-semibold` pisa el `text-xs font-medium` que trae el `Badge`
 * generado: el contrato de tipografía declara exactamente dos pesos, 400 y 600, y
 * prohíbe el 500.
 */
function BadgeDeTipo({ tipo }: { tipo: FilaDeOperacion['tipo'] }) {
  if (tipo === 'normal') return null;

  if (tipo === 'repaso') {
    return (
      <Badge variant="secondary" className="text-micro font-semibold">
        Repaso
      </Badge>
    );
  }

  return (
    <Badge className="bg-surface-warn text-micro font-semibold text-status-warn">Emergencia</Badge>
  );
}

/**
 * Las CUATRO señales inline (04-UI-SPEC §5.2, ampliado por 05-UI-SPEC §12.5 y por
 * 06-UI-SPEC §8.5). No son estados y por eso no viven junto a `EstadoAseo`: un aseo
 * urgente, o con la hora límite vencida, sigue estando pendiente o en curso.
 *
 * Van con `aria-label` y NO con `aria-hidden`: son iconos sin texto adyacente que
 * los explique, al revés que el de `EstadoAseo`.
 *
 * ── LOS DOS PREDICADOS NO SE ESCRIBEN ACÁ, Y ESO ES LO QUE IMPORTA ────────
 *
 * `horaLimiteVencida()` es la MISMA función que decide si la campana alerta. Un
 * `state === 'pendiente' || …` local sería una segunda verdad sobre el mismo dato,
 * y el día que se desincronizara la tarjeta diría que va tarde y la campana no.
 *
 * Y la de evidencia incompleta viene ya resuelta en la fila, calculada por la MISMA
 * función de SQL que la pantalla del aseador espeja.
 */
function SenalesInline({ fila, ahoraMs }: { fila: FilaDeOperacion; ahoraMs: number }) {
  return (
    <>
      {fila.is_urgent && (
        <Zap
          className="size-3.5 shrink-0 text-status-warn"
          strokeWidth={2}
          aria-label="Entra huésped el mismo día"
        />
      )}

      {fila.needs_review && (
        // El copy sale del mapa de slugs, NUNCA el slug crudo (T-04-12). `title`
        // para el mouse y `aria-label` para el lector: el mismo texto en los dos
        // canales.
        //
        // El `title` va en un `<span>` que envuelve y no en el icono: los
        // componentes de lucide tipan sus props como `Omit<LucideProps, 'ref'>` y
        // `title` no está ahí, así que `tsc` lo rechaza.
        <span title={copyDeReviewReason(fila.review_reason)} className="flex shrink-0">
          <Flag
            className="size-3.5 text-status-warn"
            strokeWidth={2}
            aria-label={copyDeReviewReason(fila.review_reason)}
          />
        </span>
      )}

      {horaLimiteVencida(fila, ahoraMs) && (
        <Hourglass
          className="size-3.5 shrink-0 text-status-warn"
          strokeWidth={2}
          aria-label="Se venció la hora límite"
        />
      )}

      {fila.sin_evidencia_completa && <SenalSinEvidencia />}
    </>
  );
}

/**
 * El nombre del apartamento, que es el ancla de la tarjeta.
 *
 * ── LOS DOS DESTINOS, Y POR QUÉ SON DOS (08-UI-SPEC §5.3) ────────────────
 *
 *   · Tarjeta GESTIONADA: `?aseo={id}` sobre esta misma pantalla, con el área
 *     estirada sobre la tarjeta entera. Un aseo gestionado tiene checklist,
 *     evidencia, reportes y dinero que enseñar.
 *   · Tarjeta INERTE (gestión externa): `/apartamentos?apartamento={id}`, la ficha
 *     de lectura, y **sin área estirada**. Por `cl_unmanaged_is_inert` no tiene
 *     tarifa, ni pago, ni margen, ni aseador, ni checklist, ni evidencia, así que
 *     su detalle sería un detalle de ausencias.
 *
 * El `href` se compone de los PARÁMETROS VIVOS y nunca literal: está medido en
 * `08-02-MEDICION.md` §4.3 que una consulta literal borra los parámetros del
 * anfitrión al ABRIR, antes de que el cierre tenga nada que conservar. Desde el
 * plan 10-05 lo que viaja ahí es sobre todo el `?dia`.
 */
function EnlaceAlApartamento({
  fila,
  estirada,
  parametrosVivos,
}: {
  fila: FilaDeOperacion;
  estirada: boolean;
  parametrosVivos: string;
}) {
  const nombre = fila.property?.nombre;

  // El embed solo puede venir nulo si la RLS no dejó resolverlo. Para el admin no
  // pasa. Se pinta el hueco en vez de un link con texto vacío, que sería un control
  // sin nombre accesible.
  if (!nombre) return <SinDato motivo="sin definir" />;

  const clases = `transicion rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
    estirada ? 'after:absolute after:inset-0' : ''
  }`;

  if (!estirada) {
    return (
      <Link href={`/apartamentos?apartamento=${fila.property_id}`} className={clases}>
        {nombre}
      </Link>
    );
  }

  return (
    <Link
      href={
        parametrosVivos === ''
          ? `/operacion?aseo=${fila.id}`
          : `/operacion?${parametrosVivos}&aseo=${fila.id}`
      }
      scroll={false}
      aria-label={`Ver el aseo de ${nombre}`}
      className={clases}
    >
      {nombre}
    </Link>
  );
}

export function TarjetaAseo({
  fila,
  acciones,
}: {
  fila: FilaDeOperacion;
  /** Lo que el menú necesita y la fila no trae. Ver `MenuAseo.tsx`. */
  acciones: ContextoDeAcciones;
}) {
  const { clave } = estadoDeAseo(fila);
  const inerte = clave === 'externa';
  const sinConfirmar = clave === 'sin_confirmar';

  return (
    <li
      data-slot="tarjeta-aseo"
      // EL DESTINO DE LAS ALERTAS DE LA CAMPANA. `FilaAlerta` navega a
      // `/operacion?dia={dia}#aseo-{id}`, así que el ancla tiene que existir en el
      // documento o el enlace no lleva a ninguna parte.
      //
      // `scroll-mt-barra` compensa la barra superior fija de 56px: sin él, el
      // navegador deja la tarjeta justo DEBAJO del cromo y el admin aterriza sin ver
      // lo que fue a buscar.
      id={`aseo-${fila.id}`}
      // LA TARJETA QUE TIENE EL DETALLE ABIERTO LO DICE MIENTRAS LO TIENE (§13.1).
      aria-current={fila.id === acciones.aseoAbiertoId ? true : undefined}
      className={claseDeTarjeta({ inerte, sinConfirmar })}
    >
      {/* Línea 1: el estado a la izquierda, la hora límite a la derecha. */}
      <div className="flex items-center justify-between gap-sm">
        <EstadoAseo aseo={fila} />

        <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
          {inerte ? <SinDato motivo="no aplica" /> : formatHoraLimite(fila.hora_limite)}
        </span>
      </div>

      {/*
        Línea 2: el nombre, su badge de tipo y sus señales inline.

        El nombre va en 14/600 TAMBIÉN en la tarjeta inerte (§3, §7.4). Bajarlo a
        400 o a `--muted-foreground` la haría leer como deshabilitada, que es
        exactamente la lectura que hay que evitar. Lo que la inerte no lleva es badge
        de tipo ni señales inline: no tiene tipo de aseo ni flags, por
        `cl_unmanaged_is_inert`.

        `min-w-0` en el nombre para que un nombre largo TRUNQUE dentro de la tarjeta
        en vez de ensanchar la columna.
      */}
      <div className="flex items-center gap-xs">
        <span className="min-w-0 truncate text-body font-semibold">
          <EnlaceAlApartamento
            fila={fila}
            estirada={!inerte}
            parametrosVivos={acciones.parametrosVivos}
          />
        </span>

        {!inerte && (
          <>
            <BadgeDeTipo tipo={fila.tipo} />
            <SenalesInline fila={fila} ahoraMs={acciones.ahoraMs} />
          </>
        )}
      </div>

      {/* Línea 3: a cargo, huéspedes y el menú. */}
      <div className="flex items-center gap-sm">
        <span className="min-w-0 flex-1 text-micro text-muted-foreground">
          <ACargo fila={fila} inerte={inerte} />
        </span>

        <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
          {inerte || fila.num_huespedes === null ? (
            <SinDato motivo={inerte ? 'no aplica' : 'sin definir'} />
          ) : (
            `${fila.num_huespedes} ${fila.num_huespedes === 1 ? 'huésped' : 'huéspedes'}`
          )}
        </span>

        {/*
          El menú EXISTE en las dos variantes para no romper la línea, y en la inerte
          está VACÍO: `MenuAseo` no se renderiza en absoluto, ni deshabilitado ni
          atenuado. Un item atenuado que no dice por qué es peor que su ausencia.

          Y ocultar acciones no es autorizar (T-04-17): la garantía real es el CHECK
          `cl_unmanaged_is_inert`, que hace fallar con 23514 cualquier escritura sobre
          estas filas, más el filtro `is_managed` dentro de las seis RPC. La UI
          refleja el CHECK, no lo reimplementa (D-21).

          `relative z-10`: sin eso el clic en el `⋯` cae en el `::after` del ancla y
          navega al detalle en vez de abrir el menú.
        */}
        <span className="relative z-10 flex size-8 shrink-0 items-center justify-center">
          {!inerte && <MenuAseo fila={fila} acciones={acciones} />}
        </span>
      </div>
    </li>
  );
}

/**
 * Las clases de la tarjeta, con sus tres ramas y sus tres razones.
 *
 * ── LO QUE **NO** HAY ACÁ, Y ES LO QUE MÁS IMPORTA ───────────────────────
 *
 * NO hay rama para el aseo ATRASADO. Ni tinte, ni peso, ni alto distinto: la
 * prohibición de 05-UI-SPEC §12.5 no caduca al cambiar de `TableRow` a tarjeta, y
 * el canal que distingue un atrasado pasa a ser el selector de día.
 *
 * ── LA RAMA INERTE, CON DOS DE SUS TRES REGLAS ───────────────────────────
 *
 *   1. NO reacciona al mouse: sin `hover:bg-canvas`. Es la señal más honesta que
 *      existe, porque nada ahí responde. Una tarjeta deshabilitada por fallo SÍ
 *      reaccionaría y además diría por qué.
 *   2. NO hay área de clic completa: el `::after` no se aplica (ver `estirada` en
 *      `EnlaceAlApartamento`), así que solo el texto del nombre es clicable.
 *
 * La tercera —no pintarla gris entera— vive en el JSX, en el peso del nombre.
 *
 * ── Y LA RAMA DEL SIN CONFIRMAR, QUE ES LA ÚNICA CON COLOR ───────────────
 *
 * `border-l-2` en `--status-warn`. Es COLOR DE ESTADO y no decoración: es el mismo
 * token que `PRESENTACION.sin_confirmar` ya le da a su icono y a su etiqueta, así
 * que el borde REFUERZA lo que la línea 1 de la tarjeta ya dice, que es la regla de
 * "nunca color como único canal" cumplida por el lado correcto.
 */
function claseDeTarjeta({
  inerte,
  sinConfirmar,
}: {
  inerte: boolean;
  sinConfirmar: boolean;
}): string {
  const base =
    'relative flex scroll-mt-barra flex-col gap-xs rounded-md border border-border bg-background p-md';

  // El borde izquierdo de estado sustituye al borde neutro de ese lado, no se suma:
  // dos bordes de 1px y 2px pegados se leen como un error de render.
  const borde = sinConfirmar ? 'border-l-2 border-l-status-warn' : '';

  if (inerte) return `${base} ${borde}`;

  return `transicion ${base} ${borde} hover:bg-canvas has-[a:focus-visible]:bg-canvas`;
}

/**
 * A CARGO: el aseador asignado, o el contacto externo si la tarjeta es inerte.
 *
 * Vacío en una tarjeta gestionada NO es un em dash: es `Sin asignar` en
 * `--status-warn`, porque un aseo sin nadie detrás es lo único de este dato sobre lo
 * que hay que hacer algo.
 *
 * Truncar sin `title` es esconder el dato, y esconder es justo lo que esta pantalla
 * no hace.
 */
function ACargo({ fila, inerte }: { fila: FilaDeOperacion; inerte: boolean }) {
  const texto = inerte ? fila.property?.contacto_externo : fila.aseador?.full_name;

  if (!texto) {
    if (inerte) return <SinDato motivo="no aplica" />;

    return <span className="text-status-warn">Sin asignar</span>;
  }

  return (
    <span className="block truncate" title={texto}>
      {texto}
    </span>
  );
}
