import { Flag, Hourglass, Zap } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import type { FilaDeOperacion } from '@/lib/data/operacion';
import { horaLimiteVencida } from '@/lib/domain/alertas';
import { copyDeReviewReason, estadoDeAseo } from '@/lib/domain/cleanings';
import { formatHoraLimite } from '@/lib/domain/dates';

import { EstadoAseo } from './EstadoAseo';
import { MenuAseo, type ContextoDeAcciones } from './MenuAseo';
import { SenalSinEvidencia } from './SenalSinEvidencia';

/**
 * La fila de aseo (04-UI-SPEC.md §7). Es la unidad visual que mas se repite en la
 * pantalla, y sale del patron ya establecido en `TablaApartamentos.tsx`.
 *
 * Seis celdas, con los anchos del contrato de §7.1:
 *
 *   ESTADO 132px · APARTAMENTO flexible (min 200px) · HORA LIMITE 88px a la
 *   derecha · A CARGO 176px · HUESPEDES 88px a la derecha · menu 48px
 *
 * Las cinco fijas suman 532px, asi que a 1280px —el minimo soportado, con el
 * carril ancho en 840px— APARTAMENTO recibe 308px contra su minimo de 200.
 *
 * El encabezado se llama `A CARGO` y no `ASEADOR` a proposito: es la unica
 * columna que tiene que servir a la vez al aseador de una fila gestionada y al
 * contacto externo de una inerte. Dos encabezados distintos exigirian dos tablas.
 *
 * ── COMPORTAMIENTO, DICHO EXPLICITAMENTE PARA QUE NO SE REINVENTE (§7.2) ────
 * Alto 40px, `border-bottom`, hover a `--canvas`, SIN zebra: zebra mas iconos de
 * color es ruido. La fila NO es un `<div>` clicable: el `<a>` vive en la celda
 * APARTAMENTO y estira su area con `::after { inset: 0 }`; la celda del menu va
 * por encima con `relative z-10`, porque sin eso el clic en el `⋯` cae en el link
 * y navega al detalle en vez de abrir el menu. El foco de fila se pinta con
 * `has-[a:focus-visible]:bg-canvas`, no con un `role="button"` falso.
 *
 * ── EL MENU DE ACCIONES (plan 04-11) ───────────────────────────────────────
 * La sexta celda monta `MenuAseo` en la variante gestionada y queda VACIA en la
 * inerte. El `relative z-10` de la celda es lo que impide que el clic en el `⋯`
 * caiga en el `::after` del ancla y navegue al detalle en vez de abrir el menu.
 */

/**
 * El em dash de una celda que no trae dato, con su explicacion para lector de
 * pantalla.
 *
 * ── LA DIFERENCIA ENTRE "sin definir" Y "no aplica" NO ES ESTILO (§7.4) ─────
 * En una fila gestionada sin confirmar, HUESPEDES esta vacio porque el dato
 * todavia no existe y alguien tiene que ir a ponerlo: "sin definir", igual que en
 * la Fase 2. En una fila inerte, HORA LIMITE y HUESPEDES estan vacios porque la
 * base los PROHIBE por `cl_unmanaged_is_inert`: "no aplica". Decir "sin definir"
 * ahi sugeriria que alguien deberia ir a llenarlo, y no hay nada que llenar.
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
 * filas es puro ruido. Los otros dos van sin icono, porque llevan texto y el texto
 * ya cumple la regla de nunca color solo.
 *
 * `text-micro font-semibold` pisa el `text-xs font-medium` que trae el `Badge`
 * generado: el contrato de tipografia declara exactamente dos pesos, 400 y 600, y
 * prohibe el 500.
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
 * Las CUATRO senales inline (04-UI-SPEC §5.2, ampliado por 05-UI-SPEC §12.5 y
 * por 06-UI-SPEC §8.5). No
 * son estados y por eso no viven en la columna ESTADO: un aseo urgente, o con la
 * hora limite vencida, sigue estando pendiente o en curso.
 *
 * Van con `aria-label` y NO con `aria-hidden`: son iconos sin texto adyacente que
 * los explique, al reves que el de la celda ESTADO.
 *
 * ── LA TERCERA, `Hourglass`, Y POR QUE SE MUESTRA EN CUALQUIER BLOQUE ──────
 * `Hourglass` no es un icono nuevo: ya esta en la lista cerrada de la Fase 4 y
 * significa exactamente esto mismo en el panel de alertas, asi que el admin lo
 * aprende una vez.
 *
 * Aparece en CUALQUIER bloque, no solo en `Atrasados`. Un aseo de HOY con la hora
 * limite vencida a las 11:30 es igual de tarde, y hasta ahora la fila no lo
 * decia: el dato estaba solo en el panel. Y dentro de `Atrasados` es redundante
 * por construccion —todo lo que hay ahi esta vencido— y AUN ASI se muestra, a
 * proposito: una fila que cambia de vocabulario segun el bloque en que vive es
 * una fila que hay que aprender dos veces.
 *
 * El predicado NO se escribe aqui: sale de `horaLimiteVencida()`, la misma
 * funcion que decide si el panel alerta. Un `state === 'pendiente' || ...` local
 * seria una segunda verdad sobre el mismo dato, y el dia que se desincronizara
 * la fila diria que va tarde y el panel no.
 *
 * ── LA CUARTA, `ImageOff`, Y POR QUE NO ES UNA ALERTA DEL PANEL ────────────
 *
 * Misma disciplina que la tercera: el predicado tampoco se escribe aqui. Viene
 * ya resuelto en la fila, calculado por la MISMA funcion de SQL que la pantalla
 * del aseador espeja. Y no entra al panel de alertas porque es un ESTADO del
 * aseo, no un evento fechado: el panel ordena cronologicamente y un estado ahi o
 * se clava arriba o necesita una fecha inventada. La razon larga esta en la
 * cabecera del componente de esa senal.
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
        // `title` no esta ahi, asi que `tsc` lo rechaza. Medido contra
        // `lucide-react` 1.39.0 en el build de este plan.
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

/** El ancla al detalle del apartamento. `estirada` aplica el `::after` de §7.2. */
function EnlaceAlApartamento({
  fila,
  estirada,
}: {
  fila: FilaDeOperacion;
  estirada: boolean;
}) {
  const nombre = fila.property?.nombre;

  // El embed solo puede venir nulo si la RLS no dejo resolverlo. Para el admin no
  // pasa. Se pinta el hueco en vez de un link con texto vacio, que seria un
  // control sin nombre accesible.
  if (!nombre) return <SinDato motivo="sin definir" />;

  return (
    <Link
      href={`/apartamentos/${fila.property_id}`}
      className={`transicion rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        estirada ? 'after:absolute after:inset-0' : ''
      }`}
    >
      {nombre}
    </Link>
  );
}

export function FilaAseo({
  fila,
  acciones,
}: {
  fila: FilaDeOperacion;
  /** Lo que el menu necesita y la fila no trae. Ver `MenuAseo.tsx`. */
  acciones: ContextoDeAcciones;
}) {
  const { clave } = estadoDeAseo(fila);
  const inerte = clave === 'externa';

  return (
    <TableRow
      // EL DESTINO DE LAS ALERTAS DEL PANEL (D-08, plan 04-13). `FilaAlerta`
      // construye su `href` como `/operacion#aseo-{id}`, asi que el ancla tiene
      // que existir en el documento o el enlace no lleva a ninguna parte.
      //
      // `scroll-mt-barra` compensa la barra superior fija de 56px: sin el, el
      // navegador deja la fila justo DEBAJO del cromo y el admin aterriza sin ver
      // lo que fue a buscar.
      //
      // Lo que esto NO hace todavia: expandir el bloque del dia si estaba
      // colapsado. Ver `deferred-items.md`.
      id={`aseo-${fila.id}`}
      // `relative` para que el `::after` del ancla tenga esta fila como bloque
      // contenedor y cubra toda su anchura.
      //
      // ── LAS DOS DE LAS TRES REGLAS DE LA FILA INERTE QUE VIVEN AQUI ───────
      // 1. NO reacciona al mouse: sin `hover:bg-canvas`. Es la senal mas honesta
      //    que existe, porque nada aqui responde. Una fila deshabilitada por fallo
      //    SI reaccionaria y ademas diria por que.
      // 2. NO hay area de clic de fila completa: el `::after` no se aplica (ver
      //    `estirada`), asi que solo el texto del nombre es clicable. Abrir el
      //    apartamento es navegacion de lectura, no una accion sobre el aseo;
      //    extender el area a toda la fila la volveria a sentir como un control.
      //
      // Lo que NO se hace: pintarla gris entera, que la haria leer como
      // deshabilitada por fallo, ni sacarla a otra vista, que romperia el
      // panorama del dia que el admin necesita (§7.4, D-20).
      //
      // Y LO QUE D-08 TAMPOCO HACE: NINGUNA FILA ATRASADA SE TINTA, ni cambia de
      // peso, ni de alto (05-UI-SPEC §12.5). La fila atrasada se distingue porque
      // esta en el bloque `Atrasados`, que es el canal de mayor ancho de banda que
      // existe en esta pantalla. Tintar la fila reabriria una prohibicion de la
      // Fase 4 para repetir algo que el bloque ya dice.
      className={
        inerte
          ? 'relative h-fila scroll-mt-barra border-b border-border bg-background'
          : 'transicion relative h-fila scroll-mt-barra border-b border-border bg-background hover:bg-canvas has-[a:focus-visible]:bg-canvas'
      }
    >
      <TableCell className="w-col-estado-aseo px-md">
        <EstadoAseo aseo={fila} />
      </TableCell>

      {/*
        El nombre va en 14/600 TAMBIEN en la fila inerte (§3, §7.4). Bajarlo a 400
        o a `--muted-foreground` la haria leer como deshabilitada, que es
        exactamente la lectura que hay que evitar. Lo que la inerte no lleva es
        badge de tipo ni senales inline: no tiene tipo de aseo ni flags, por
        `cl_unmanaged_is_inert`.
      */}
      <TableCell className="min-w-col-nombre px-md text-body font-semibold">
        <span className="flex items-center gap-xs">
          <EnlaceAlApartamento fila={fila} estirada={!inerte} />

          {!inerte && (
            <>
              <BadgeDeTipo tipo={fila.tipo} />
              <SenalesInline fila={fila} ahoraMs={acciones.ahoraMs} />
            </>
          )}
        </span>
      </TableCell>

      <TableCell className="w-col-hora px-md text-right text-body tabular-nums">
        {inerte ? <SinDato motivo="no aplica" /> : formatHoraLimite(fila.hora_limite)}
      </TableCell>

      {/*
        A CARGO. En la fila inerte es `properties.contacto_externo`, que es
        literalmente el "a cargo de quien" que pide DASH-07: truncado, con el texto
        completo en `title`, porque truncar sin `title` es esconder el dato.
      */}
      <TableCell className="w-col-acargo max-w-col-acargo px-md text-body">
        <CeldaACargo fila={fila} inerte={inerte} />
      </TableCell>

      <TableCell className="w-col-huespedes px-md text-right text-body tabular-nums">
        {inerte || fila.num_huespedes === null ? (
          <SinDato motivo={inerte ? 'no aplica' : 'sin definir'} />
        ) : (
          fila.num_huespedes
        )}
      </TableCell>

      {/*
        La celda del menu EXISTE en las dos variantes, para no romper la rejilla, y
        en la inerte esta VACIA: `MenuAseo` no se renderiza en absoluto, ni
        deshabilitado ni atenuado. Un item atenuado que no dice por que es peor que
        su ausencia.

        Y ocultar acciones no es autorizar (T-04-17): la garantia real es el CHECK
        `cl_unmanaged_is_inert`, que hace fallar con 23514 cualquier escritura sobre
        estas filas, mas el filtro `is_managed` dentro de las seis RPC. La UI
        refleja el CHECK, no lo reimplementa (D-21).
      */}
      <TableCell className="relative z-10 w-col-menu px-md">
        {!inerte && <MenuAseo fila={fila} acciones={acciones} />}
      </TableCell>
    </TableRow>
  );
}

/**
 * A CARGO: el aseador asignado, o el contacto externo si la fila es inerte.
 *
 * Vacio en una fila gestionada NO es un em dash: es `Sin asignar` en
 * `--status-warn`, porque un aseo de hoy sin nadie detras es lo unico de esta
 * columna sobre lo que hay que hacer algo.
 */
function CeldaACargo({ fila, inerte }: { fila: FilaDeOperacion; inerte: boolean }) {
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
