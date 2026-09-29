import { Hammer, Receipt } from 'lucide-react';

import { Separator } from '@/components/ui/separator';
import type { PanelDeAseo } from '@/lib/data/panel-aseo';
import { estadoDeAseo } from '@/lib/domain/cleanings';
import { formatHoraBog } from '@/lib/domain/dates';
import { formatCOP } from '@/lib/domain/money';

import { FilaDeDato } from '../../_components/FilaDeDato';
import { GrupoDePanel } from '../../_components/GrupoDePanel';
import { TiraDeEvidencia } from './TiraDeEvidencia';

/**
 * EL CUERPO DEL DETALLE DE UN ASEO (08-UI-SPEC §10, criterio 4 del ROADMAP).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO ES UNA **EXTRACCIÓN**, NO UNA REESCRITURA, Y EL DIFF HAY QUE
 * LEERLO ASÍ.
 *
 * Venía de `app/(admin)/operacion/_components/PanelAseo.tsx`, que era el panel
 * deslizante de la Fase 8 y que el plan 10-05 partió en dos: el ARMAZÓN pasó de
 * `Sheet` a un nodo inline de la columna derecha (`DetalleDelAseo.tsx`) y el
 * CUERPO se vino acá entero.
 *
 * ── QUÉ **NO** CAMBIÓ AL MUDARSE, Y VA POR NOMBRE ───────────────────────
 *
 *   1. **Los cuatro grupos**, en el mismo orden: `EJECUCIÓN`, `EVIDENCIA`,
 *      `REPORTES` y `DINERO`, con las formas de §6.4.
 *   2. **El grupo de dinero SIGUE SIN EXISTIR en una unidad de gestión
 *      externa.** La lectura devuelve la fila igual con las tres cifras en cero
 *      y es la pantalla la que decide no pintarlo leyendo la marca: tres ceros
 *      dirían que el aseo no dejó dinero, cuando lo que pasa es que ese aseo no
 *      es nuestro.
 *   3. **La rama del checklist total en cero mira el TOTAL y no las hechas**, y
 *      se distingue de un `0/12` a propósito. Ver la cabecera de
 *      `filaDeChecklist`.
 *   4. **La línea de D7-2** (`Los daños no se descuentan del pago.`) sigue
 *      apareciendo solo con al menos un daño, y sigue yendo ANTES del
 *      separador, porque es el pie DEL GRUPO DE REPORTES.
 *   5. **Las cuatro prohibiciones de la cabecera vieja siguen vigentes**: no se
 *      cuenta el checklist (T-08-22), no se deriva el estado, no se formatea a
 *      mano y no se muta nada.
 *
 * ── LO ÚNICO QUE CAMBIÓ, Y NO ES DE CONTENIDO ───────────────────────────
 *
 * `CuerpoDelPanel` se llamaba así y era local; ahora se llama `CuerpoDeAseo` y
 * se exporta, porque su consumidor vive en otro archivo. Ni una fila, ni una
 * cifra, ni un literal de copia cambió con la mudanza.
 *
 * ── LA ARITMÉTICA DE ALTURA DE §6.4 YA NO GOBIERNA ESTE CUERPO ──────────
 *
 * Los 590px de cuerpo disponible y los dos umbrales de desbordamiento (siete
 * reportes sin línea de daños, cinco con ella) eran propiedades del `Sheet` a
 * 700 de viewport. Inline, la columna derecha mide 840px de ancho y su alto es
 * lo que sobre de la pantalla, así que esos dos números **dejaron de aplicar**.
 * Se dicen acá y no se borran en silencio: quien busque por qué el panel cabía
 * en 590 tiene que encontrar que esa restricción era del armazón viejo.
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function CuerpoDeAseo({ panel }: { panel: Promise<PanelDeAseo | null> }) {
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

