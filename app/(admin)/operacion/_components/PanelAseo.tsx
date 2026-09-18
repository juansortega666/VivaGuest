import { ExternalLink, Hammer, Receipt } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { Separator } from '@/components/ui/separator';
import type { PanelDeAseo } from '@/lib/data/panel-aseo';
import { estadoDeAseo } from '@/lib/domain/cleanings';
import { formatFechaLargaBog, formatHoraBog, nombreDeDiaBog } from '@/lib/domain/dates';
import { formatCOP } from '@/lib/domain/money';

import { EsqueletoDePanel } from '../../_components/EsqueletoDePanel';
import { FilaDeDato } from '../../_components/FilaDeDato';
import { GrupoDePanel } from '../../_components/GrupoDePanel';
import { PanelLectura } from '../../_components/PanelLectura';
import { EstadoAseo } from './EstadoAseo';
import { TiraDeEvidencia } from './TiraDeEvidencia';

/**
 * EL PANEL DE ASEO (08-UI-SPEC §10, criterio 4 del ROADMAP).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES LO ÚNICO DE LA FASE QUE NO EXISTÍA EN NINGUNA FORMA, Y ES LA RESPUESTA A
 * *"¿cómo va el 302?"*, QUE HOY SE RESUELVE POR WHATSAPP.
 *
 * Criterio 4, literal: *"desde Operación, tocar un aseo muestra en qué va:
 * checklist, evidencia y los gastos o daños reportados, sin salir del día"*.
 *
 * ── EL CONTENIDO ESTÁ CERRADO POR EL DUEÑO (D8-4) ───────────────────────
 *
 * Apartamento, fecha, estado, quién lo hace, el checklist como `7/12`, las fotos
 * en miniatura, los gastos y daños reportados, y la tarifa con el pago y el
 * margen. **Fuera: el checklist tarea por tarea.** Lo que no está en la lista no
 * se muestra, y añadir un dato acá es modificar ese contrato.
 *
 * ── CUATRO GRUPOS, Y CABEN EN LOS 590 PÍXELES DEL CUERPO SIN PIE ────────
 *
 * §6.4 lo tiene contado: 104 de `EJECUCIÓN`, 89 de `EVIDENCIA`, 133 de
 * `REPORTES` con cuatro líneas y 104 de `DINERO`, más 99 de los tres
 * separadores, son **529px** contra los 590 disponibles a 700 de viewport, o sea
 * **61 de holgura**.
 *
 * El resto del panel son 396px fijos, así que `REPORTES` vale `17 + 29n` y cada
 * reporte extra cuesta 29px. **EL CUERPO DESBORDA A PARTIR DEL SÉPTIMO REPORTE,
 * NO DEL SEXTO**: con seis cabe por tres píxeles, que es holgura cero en la
 * práctica pero es cabida de verdad y el desplazamiento no aparece. Con siete
 * desborda por 26.
 *
 * **Y HAY UN SEGUNDO NÚMERO QUE §6.4 NO CUENTA, PORQUE SU TABLA ES DE GRUPOS.**
 * La línea de "los daños no se descuentan del pago" cuesta 17px de texto más 16
 * de separación, o sea **33px**, y solo aparece cuando hay al menos un daño.
 * Cuando aparece, el umbral baja:
 *
 *     sin línea de daños:  n = 7 desborda (616 sobre 590)
 *     con línea de daños:  n = 5 desborda, por UN píxel (591 sobre 590)
 *
 * Cinco reportes con al menos un daño entre ellos es raro, pero mucho menos raro
 * que siete de cualquier cosa, así que el desplazamiento del cuerpo se va a ver
 * antes de lo que la tabla de §6.4 sugiere. No se recorta nada por eso: la línea
 * es obligación del contrato de la Fase 7 y el desplazamiento está ahí
 * precisamente para el caso largo.
 *
 * Siete gastos y daños en un solo aseo es patológico. El desplazamiento vertical
 * del cuerpo está ahí para ese caso y no incumple D8-7, que dice que "sin
 * scroll" es el objetivo que ordena el recorte del contenido y no una
 * restricción técnica dura. **Los dos números van escritos acá para que nadie
 * los descubra en producción.**
 *
 * ── ESTE PANEL NO TIENE PIE ─────────────────────────────────────────────
 *
 * Sin pie, el cuerpo pasa de 506px a 590. Y no lo necesita: todo lo que se puede
 * HACER sobre un aseo vive en el menú de la fila, que no se toca (§5.3 punto 5).
 * El único enlace que sale de la sección es el nombre del apartamento de la
 * cabecera, y es deliberado: el admin lo eligió, no le pasó por tocar una fila.
 *
 * ── NO HAY RAMA DE SIN PERMISO, Y ESTÁ PROHIBIDA POR NOMBRE (§10.4) ─────
 *
 * El layout de `(admin)` ya exige admin contra el servidor de autenticación, no
 * contra un claim del token, y la definer lo vuelve a comprobar por dentro. Si
 * esa función deniega, **es un defecto, no un estado**: se va por el `error.tsx`
 * de la ruta. Escribir acá un condicional de permiso denegado sería una TERCERA
 * copia de la misma regla y un sitio más donde equivocarse.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE, Y VA POR NOMBRE ────────────────────────
 *
 *   1. **No cuenta el checklist.** El progreso llega ya calculado desde
 *      `lib/data/panel-aseo.ts`, con `progresoTotal(armarChecklist(...))`, que es
 *      la misma función que usa la pantalla del aseador. La cabecera de
 *      `lib/domain/checklist.ts` declara una duplicación y advierte por escrito
 *      contra una tercera; contarlo acá sería la cuarta. Es T-08-22.
 *   2. **No deriva el estado.** `estadoDeAseo()` es el espejo de
 *      `cl_unmanaged_is_inert` y `cl_managed_has_state`, y lo pinta el mismo
 *      componente que la fila de la tabla de atrás. Dos derivaciones del mismo
 *      dato en la misma pantalla es cómo una dice `Pendiente` y la otra
 *      `Sin confirmar` sobre el mismo aseo.
 *   3. **No formatea a mano.** Dinero, fecha larga y hora salen de los
 *      formateadores de dominio, que ya tienen sus pruebas.
 *   4. **No muta nada.** Confirmar, reasignar, cerrar y cancelar siguen viviendo
 *      en el menú. Ningún botón destructivo en toda la fase (§15.3).
 * ════════════════════════════════════════════════════════════════════════════
 */
export function PanelAseo({
  cabecera,
  panel,
  rutaAlCerrar,
  rutaDelApartamento,
}: {
  /**
   * Lo que la cabecera necesita ANTES de que la promesa resuelva, y que la
   * página ya tiene en la mano porque resolvió la lectura para decidir si el
   * panel se renderiza. Así el nombre y el estado se pintan de verdad desde el
   * primer frame y el esqueleto es solo del cuerpo (§11.1).
   */
  cabecera: PanelDeAseo['cabecera'];
  /**
   * Todo el panel, **como promesa sin resolver**. Llega así para que la barrera
   * de suspensión de abajo tenga algo que esperar.
   */
  panel: Promise<PanelDeAseo | null>;
  /**
   * La dirección del anfitrión **ya compuesta**, sin el parámetro del panel y
   * con `alertas` intacto. Se compone en el servidor; ver `PanelLectura`.
   */
  rutaAlCerrar: string;
  /** `/apartamentos?apartamento={id}`, compuesta por la página. */
  rutaDelApartamento: string;
}) {
  return (
    <PanelLectura
      titulo={
        /*
          ── EL ÚNICO ENLACE QUE SALE DE LA SECCIÓN, Y ES DELIBERADO (§10.2) ──

          El admin lo eligió; no le pasó por tocar una fila. Esa es exactamente la
          diferencia que §5.3 vino a arreglar: hoy tocar la fila navega al
          formulario de edición del apartamento sin que nadie lo haya pedido.

          El nombre accesible del diálogo NO se rompe por esto: se computa del
          contenido del título, y el contenido sigue siendo el nombre. El icono
          va oculto al lector porque acompaña al texto.

          SIN la desactivación del salto de scroll, a diferencia de los enlaces
          de apertura: esto es una navegación de verdad a OTRA ruta, y una ruta
          nueva empieza arriba de todas formas. Mismo trato que el botón `Editar`
          del panel de apartamento.
        */
        <Link
          href={rutaDelApartamento}
          className="transicion rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {cabecera.apartamento}
          <ExternalLink
            className="ml-xs inline size-3.5 align-text-bottom"
            strokeWidth={2}
            aria-hidden="true"
          />
        </Link>
      }
      rutaAlCerrar={rutaAlCerrar}
      apoyo={
        <span className="inline-flex items-center gap-xs">
          {/*
            `jueves 18 de septiembre`, de los dos formateadores que ya existen.
            Uno solo con día y fecha los junta con `", "` en es-CO, que no es el
            copy de §10.1. Mismo criterio que `PanelApartamento`.
          */}
          {`${nombreDeDiaBog(cabecera.fecha)} ${formatFechaLargaBog(cabecera.fecha)}`} ·
          <EstadoAseo
            aseo={{
              is_managed: cabecera.gestionPropia,
              state: cabecera.estado,
              confirmado_at: cabecera.confirmadoAt,
            }}
          />
        </span>
      }
    >
      <Suspense
        fallback={
          /*
            LA BARRERA ES DEL PANEL, NO DEL SEGMENTO (INSTRUCCIÓN 4 del VEREDICTO
            de 08-02). El fallback del segmento no se pinta nunca —cero
            apariciones en doce corridas, porque la respuesta del servidor vuelve
            en ~70 ms— así que no habría servido de esqueleto aunque se hubiera
            quedado, y de hecho el archivo de carga de esta ruta está borrado.

            **Sin clave acá ni en nada que envuelva a la tabla del día**
            (INSTRUCCIÓN 3): una clave derivada de los parámetros fuerza el
            remonte del subárbol. La clave por identificador va sobre el panel
            entero y la pone la página.

            Las formas salen de §6.4: `EJECUCIÓN` con tres filas, `EVIDENCIA` con
            una (la tira), `REPORTES` con dos en el caso típico, y `DINERO` con
            tres. En una unidad de gestión externa el grupo de dinero no existe.
          */
          <EsqueletoDePanel grupos={cabecera.gestionPropia ? [3, 1, 2, 3] : [3, 1, 2]} />
        }
      >
        <CuerpoDelPanel panel={panel} />
      </Suspense>
    </PanelLectura>
  );
}

/** El cuerpo, que es lo único que espera al viaje de la lectura. */
async function CuerpoDelPanel({ panel }: { panel: Promise<PanelDeAseo | null> }) {
  const datos = await panel;

  // La página ya comprobó que hay fila antes de renderizar este panel, así que
  // esta rama es inalcanzable. Va igual porque el tipo lo exige, y va vacía
  // porque un estado vacío acá sería un estado que no existe.
  if (datos === null) return null;

  const { cabecera, progreso, fotos, totalDeFotos, gastos, danos } = datos;
  const { clave } = estadoDeAseo({
    is_managed: cabecera.gestionPropia,
    state: cabecera.estado,
    confirmado_at: cabecera.confirmadoAt,
  });

  const hayReportes = gastos.length > 0 || danos.length > 0;

  return (
    <>
      <GrupoDePanel encabezado="EJECUCIÓN" conSeparador>
        {/*
          VACÍO EN UNA GESTIONADA ES `Sin asignar` EN EL COLOR DE AVISO, NO UN
          GLIFO. La regla la fijó `FilaAseo.tsx` y no es estilo: un aseo sin nadie
          detrás es trabajo que nadie tiene asignado, y un em dash lo contaría
          como un dato que falta.

          En una unidad de gestión externa no hay aseador porque
          `cl_unmanaged_is_inert` lo prohíbe: la ausencia es `no aplica`, no
          `sin definir`. Decir `sin definir` mandaría al admin a asignar a alguien
          que la base va a rechazar.
        */}
        <FilaDeDato etiqueta="A cargo" {...filaDeACargo(cabecera)} />

        <FilaDeDato etiqueta="Checklist" {...filaDeChecklist(progreso)} />

        <FilaDeDato etiqueta="Horas" {...filaDeHoras(cabecera)} />
      </GrupoDePanel>

      <GrupoDePanel encabezado="EVIDENCIA" conSeparador>
        {/*
          La tira NO es un par rótulo-dato, así que no pasa por `FilaDeDato`: es
          una lista de casillas que ocupa la fila entera. El término va oculto
          para que la lista de definición del grupo siga siendo válida y el lector
          anuncie el par en vez de un bloque suelto, que es el mismo criterio que
          `PanelApartamento` aplica a su grupo de próximo aseo.
        */}
        <div>
          <dt className="sr-only">Evidencia</dt>
          <dd>
            <TiraDeEvidencia
              fotos={fotos}
              totalDeFotos={totalDeFotos}
              terminado={clave === 'terminado'}
            />
          </dd>
        </div>
      </GrupoDePanel>

      {/*
        ── UN SOLO GRUPO PARA GASTOS Y DAÑOS, Y ESTÁ CONTADO (§10.2) ─────────

        En grupos separados cuestan 25px de encabezado cada uno MÁS su separador
        de 33: **91px de cromo para, casi siempre, dos líneas de contenido.** En
        uno solo cuestan 25. Y la distinción no se pierde: va en el prefijo Y en
        el icono, que son dos canales, no uno.
      */}
      <GrupoDePanel encabezado="REPORTES">
        {hayReportes ? (
          <>
            {gastos.map((gasto) => (
              <LineaDeReporte
                key={gasto.gastoId}
                tipo="Gasto"
                concepto={gasto.concepto}
                monto={gasto.monto}
              />
            ))}

            {danos.map((dano) => (
              <LineaDeReporte key={dano.danoId} tipo="Daño" concepto={dano.descripcion} />
            ))}
          </>
        ) : (
          /*
            Un grupo vacío dentro de un panel con contenido se dice con UNA LÍNEA
            y no con el componente de estado vacío, que §11.2 reserva para el
            panel entero. El término va oculto por la misma razón que arriba.
          */
          <div>
            <dt className="sr-only">Reportes</dt>
            <dd className="text-micro text-muted-foreground">No reportó gastos ni daños.</dd>
          </div>
        )}
      </GrupoDePanel>

      {/*
        LA LÍNEA QUE EL CONTRATO DE LA FASE 7 OBLIGA A CONSERVAR (07-UI-SPEC
        §6.4). Es D7-2 hecho visible, y va SOLO cuando hay al menos un daño: sin
        daños no hay nada que aclarar y la línea sería ruido permanente.

        Y acá es donde más falta hace, porque el pago al aseador está justo
        debajo: sin ella, un admin que ve un daño reportado y un pago completo en
        la misma pantalla se pregunta si el sistema se olvidó de descontar.

        Va como párrafo hermano y no dentro del grupo: una lista de definición con
        un párrafo suelto dentro deja de ser válida, y esta línea no es un par
        rótulo-dato. Mismo criterio que la línea de gestión externa de
        `PanelApartamento`.

        Y va ANTES del separador, no después, porque es el pie DEL GRUPO DE
        REPORTES: al otro lado del filo se leería como el encabezado del dinero.
      */}
      {danos.length > 0 && (
        <p className="text-micro text-muted-foreground">Los daños no se descuentan del pago.</p>
      )}

      {/*
        ── EL GRUPO DE DINERO NO EXISTE EN UNA UNIDAD DE GESTIÓN EXTERNA ────

        La lectura devuelve la fila igual, con las tres cifras en cero, y es LA
        PANTALLA la que decide no pintarlo leyendo la marca. Pintar tres ceros
        diría que el aseo no dejó dinero, cuando lo que pasa es que ese aseo no
        es nuestro.

        El separador es hermano del grupo y no hijo suyo, y va acá y no en la prop
        del grupo de arriba porque entre los dos hay una línea que pertenece al de
        arriba. En una unidad externa no hay filo que pintar: `REPORTES` es el
        último grupo y el último nunca lo lleva.
      */}
      {cabecera.gestionPropia && (
        <>
          <Separator />

          <GrupoDePanel encabezado="DINERO">
            <FilaDeDato etiqueta="Tarifa al huésped" valor={formatCOP(cabecera.cobrado)} cifra />
            <FilaDeDato etiqueta="Pago al aseador" valor={formatCOP(cabecera.pagado)} cifra />
            {/*
              EL MARGEN LLEGA CALCULADO POR LA DEFINER, no se resta acá: es la
              misma resta que la base ya hizo, y hacerla otra vez en el componente
              sería un segundo sitio que mantener sincronizado.

              Negativo va en el color de AVISO y nunca en el destructivo, que es
              la regla del contrato de la Fase 7: el destructivo se reserva para
              lo que borra o revoca, y un margen en rojo de borrar diría que pasó
              algo grave cuando lo que pasa es que hay que revisar una tarifa. El
              signo menos lo pone el formateador, para que la señal no dependa
              solo del color (§13.5).
            */}
            <FilaDeDato
              etiqueta="Margen"
              valor={
                cabecera.margen < 0 ? (
                  <span className="text-status-warn">{formatCOP(cabecera.margen)}</span>
                ) : (
                  formatCOP(cabecera.margen)
                )
              }
              cifra
            />
          </GrupoDePanel>
        </>
      )}
    </>
  );
}

/**
 * `A cargo`, con sus dos ausencias bien repartidas.
 *
 * `sin definir` diría que alguien tiene que ir a llenarlo. En una unidad de
 * gestión externa no hay nada que llenar: la base lo prohíbe.
 */
function filaDeACargo(cabecera: PanelDeAseo['cabecera']) {
  if (!cabecera.gestionPropia) return { valor: null, ausencia: 'no aplica' } as const;

  if (cabecera.aseador === null) {
    return { valor: <span className="text-status-warn">Sin asignar</span> } as const;
  }

  return { valor: cabecera.aseador, completo: cabecera.aseador } as const;
}

/**
 * El progreso del checklist, en el formato `7/12` que escribió el dueño en D8-4
 * y que **se respeta literal**.
 *
 * ── LA RAMA DE AUSENCIA MIRA EL TOTAL, NO LAS HECHAS, Y PARECE UN ERROR ──
 *
 * Y no lo es. Las tareas SE MATERIALIZAN AL CONFIRMAR el aseo, no al crearlo
 * (`confirm_cleaning`, migración 04), así que un aseo sin confirmar devuelve cero
 * de cero. Un **cero de doce** es otra cosa completamente distinta: un aseo
 * confirmado, con su checklist puesto, que nadie ha empezado. Ese sí se pinta,
 * con su cero.
 *
 * ── Y EL NOMBRE ACCESIBLE NO ES LA BARRA (§13.2) ────────────────────────
 *
 * `7/12` se lee mal: los lectores de pantalla dicen cosas distintas ante la barra
 * oblicua y ninguna es "siete de doce". El texto va aparte, y el glifo se oculta.
 */
function filaDeChecklist(progreso: PanelDeAseo['progreso']) {
  if (progreso.total === 0) return { valor: null, ausencia: 'sin definir', cifra: true } as const;

  return {
    valor: (
      <>
        <span aria-hidden="true">{`${progreso.hechas}/${progreso.total}`}</span>
        <span className="sr-only">
          {`Checklist, ${progreso.hechas} de ${progreso.total} tareas`}
        </span>
      </>
    ),
    ancla: true,
    cifra: true,
  } as const;
}

/**
 * `Horas`, con los tres casos de §15.2 y ni una palabra distinta.
 *
 * Pendiente: no empezó, así que no hay hora que dar y el glifo dice
 * `sin definir`. En curso: la de inicio y `sin cerrar`, que es información y no
 * una ausencia. Terminado: las dos.
 */
function filaDeHoras(cabecera: PanelDeAseo['cabecera']) {
  const inicio = formatHoraBog(cabecera.iniciadoAt);
  if (inicio === null) return { valor: null, ausencia: 'sin definir', cifra: true } as const;

  const fin = formatHoraBog(cabecera.terminadoAt);

  return {
    valor: fin === null ? `Empezó ${inicio} · sin cerrar` : `Empezó ${inicio} · Terminó ${fin}`,
    cifra: true,
  } as const;
}

/**
 * Una línea del grupo `REPORTES`: tipo y concepto a la izquierda, monto a la
 * derecha.
 *
 * **Un daño no tiene monto, y eso es `no aplica`, no `sin definir`**: no es que
 * falte, es que no existe. `damages` no tiene columna de monto y no debe
 * tenerla: D7-2 dice que los daños no se descuentan del pago.
 *
 * El icono acompaña al texto del tipo, así que se oculta al lector: anunciarlo
 * sería decir "gasto" dos veces. La distinción gasto/daño viaja por DOS canales,
 * el prefijo y el icono, así que no depende del color (§13.5).
 */
function LineaDeReporte({
  tipo,
  concepto,
  monto,
}: {
  tipo: 'Gasto' | 'Daño';
  concepto: string;
  monto?: number;
}) {
  const esGasto = tipo === 'Gasto';
  const Icono = esGasto ? Receipt : Hammer;

  return (
    <div className="flex items-baseline justify-between gap-md">
      <dt className="flex min-w-0 items-baseline gap-xs text-body text-foreground">
        <Icono
          className={`size-3.5 shrink-0 translate-y-px ${esGasto ? 'text-muted-foreground' : 'text-status-warn'}`}
          strokeWidth={2}
          aria-hidden="true"
        />
        <span className="truncate" title={concepto}>
          {tipo} · {concepto}
        </span>
      </dt>

      {monto === undefined ? (
        <dd className="shrink-0 text-body text-muted-foreground">
          <span aria-hidden="true">—</span>
          <span className="sr-only">no aplica</span>
        </dd>
      ) : (
        <dd className="shrink-0 text-body text-foreground tabular-nums">{formatCOP(monto)}</dd>
      )}
    </div>
  );
}

