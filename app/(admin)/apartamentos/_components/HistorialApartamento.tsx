import {
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  Hammer,
  History,
  Inbox,
  Play,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  BLOQUE_HISTORIAL,
  type EntradaDeHistorial,
  type Historial,
} from '@/lib/data/historial';
import { SIN_ASIGNAR } from '@/lib/data/operacion';
import { copyDeTipoDeAseo, estadoDeAseo, type IconoEstadoAseo } from '@/lib/domain/cleanings';
import { formatFechaBog } from '@/lib/domain/dates';
import { cn } from '@/lib/utils';

import { EstadoVacio } from '../../_components/EstadoVacio';

/**
 * EL HISTORIAL DEL APARTAMENTO (DASH-06, REPORT-04, 04-UI-SPEC.md §14).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * VIVE DENTRO DE LA FICHA Y NO EN UNA RUTA PROPIA (D-22).
 *
 * El historial es CONTEXTO de la ficha, no un destino: se mira mientras se
 * decide algo sobre el apartamento —si vale la pena seguir operandolo, si el
 * responsable esta cumpliendo, si esa unidad se rompe cada mes—. Una ruta
 * `/apartamentos/[id]/historial` obligaria a ir y volver para cruzar el dato con
 * las tarifas y con el responsable, que estan tres secciones mas arriba.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── SOLO LECTURA, SIN UNA SOLA ACCION (D-23) ───────────────────────────────
 *
 * Ni botones por fila, ni menu de tres puntos, ni "marcar como resuelto". Los RPC
 * de reporte llegan en la Fase 6; esta fase MUESTRA. Un boton de resolver aqui
 * seria un boton sin RPC detras, y un control que no hace nada es peor que no
 * tenerlo.
 *
 * ── UN DANO RESUELTO NO SE OCULTA NI SE ATENUA ─────────────────────────────
 *
 * Se marca con ` · Resuelto` al final de la linea 2 y ya. Filtrarlo convierte
 * "esta unidad se rompe cada mes" en "esta unidad no se rompe nunca", que es
 * justo el dato con el que se toma la decision. Atenuarlo introduce la jerarquia
 * visual que el criterio 4 de la fase prohibe. La capa de datos tampoco lo
 * filtra, y hay un senuelo corrido que lo demuestra (`lib/data/historial.ts`).
 *
 * ── XSS: `damages.descripcion` ES EL PRIMER TEXTO LIBRE DE FUERA (T-04-10) ──
 *
 * En la Fase 6 lo va a escribir un aseador desde la PWA. Aqui se renderiza como
 * TEXTO de React y como atributo `title`, que React escapa por defecto. CERO
 * `dangerouslySetInnerHTML` en este archivo, y esa es la regla, no una
 * coincidencia: hoy la tabla esta vacia y el vector no esta activo, asi que este
 * es el momento de fijarla.
 */

/**
 * Los seis iconos de estado de la lista cerrada de §17.3, mas `Hammer` para el
 * dano.
 *
 * Es el MISMO mapa que `EstadoAseo.tsx` de `/operacion`, y esta duplicado a
 * proposito en vez de importado: ese componente pinta ademas la etiqueta y las
 * clases de una celda de tabla de 40px, y aqui hace falta solo el icono dentro de
 * una fila de 64px con otro reparto. Lo que NO se duplica es la derivacion: el
 * nombre del icono, la etiqueta y el color salen de `estadoDeAseo()`, que es la
 * unica fuente. Este `Record` solo traduce nombre → componente de lucide, que es
 * lo que un modulo de dominio puro no puede hacer.
 */
const ICONOS_DE_ESTADO: Record<IconoEstadoAseo, LucideIcon> = {
  Inbox,
  Clock,
  Play,
  CircleCheck,
  CircleSlash,
  CircleDashed,
};

/**
 * Techo duro del parametro `?historial=` de la URL.
 *
 * La retencion del proyecto es de seis meses, asi que ningun apartamento real va
 * a pasar de unas pocas decenas de entradas. El techo no esta por producto: esta
 * porque el numero llega de la QUERY STRING, y sin el `?historial=999999` seria
 * una consulta arbitrariamente grande servida a cualquiera que sepa escribirla.
 */
const TECHO_HISTORIAL = 300;

/**
 * Cuantas entradas mostrar, a partir del `?historial=` crudo de la URL.
 *
 * Se redondea HACIA ARRIBA al bloque de 30 para que el parametro no pueda pedir
 * una lista de 47: el pie dice `Ver 30 mas` y el contrato es que la lista crece de
 * treinta en treinta. Cualquier cosa que no sea un entero mayor que el bloque
 * —vacio, texto, negativo, `NaN`, notacion cientifica— cae al bloque base sin
 * error: es un parametro de presentacion, no una entrada de formulario, y un 400
 * por un enlace mal copiado seria peor que mostrar la primera pagina.
 */
export function limiteDeHistorial(crudo: string | undefined): number {
  const n = Number.parseInt(crudo ?? '', 10);
  if (!Number.isFinite(n) || n <= BLOQUE_HISTORIAL) return BLOQUE_HISTORIAL;

  const redondeado = Math.ceil(n / BLOQUE_HISTORIAL) * BLOQUE_HISTORIAL;
  return Math.min(redondeado, TECHO_HISTORIAL);
}

export function HistorialApartamento({
  propertyId,
  historial,
  limite,
}: {
  propertyId: string;
  /** Ya leido y mezclado por `leerHistorial()`. Aqui no se reordena nada. */
  historial: Historial;
  /** Cuantas entradas se estan mostrando: lo que el enlace del pie incrementa. */
  limite: number;
}) {
  return (
    /*
      `border-t` + `pt-lg` + `text-heading` (16/600) es EXACTAMENTE el tratamiento
      de las cinco secciones del formulario (`Seccion` en FormularioApartamento).
      Repetirlo aqui y no importar aquel componente es deliberado: `Seccion` vive
      dentro de un arbol cliente con `react-hook-form`, y esta seccion es un RSC.
    */
    <section id="historial" className="flex flex-col gap-lg border-t border-border pt-lg">
      <h2 className="text-heading text-foreground">Historial</h2>

      {historial.entradas.length === 0 ? (
        /*
          Variante NORMAL, sin `compacto`: la ficha es carril ancho, no una card
          de 360px del carril lateral de `/operacion` (§15.1).
        */
        <EstadoVacio
          icono={History}
          encabezado="Este apartamento no tiene historial todavía."
          cuerpo="Los aseos y los daños reportados van a aparecer acá."
        />
      ) : (
        <>
          {/*
            `<ul>` y no una tabla: no hay columnas alineadas que comparar entre
            filas, hay una linea de tiempo. Y un lector de pantalla anuncia
            "lista de N elementos", que es informacion real sobre el tamano del
            historial.
          */}
          <ul className="flex flex-col rounded-lg border border-border">
            {historial.entradas.map((entrada) => (
              <FilaDeHistorial key={entrada.id} entrada={entrada} />
            ))}
          </ul>

          {historial.hayMas && (
            <div className="flex justify-center">
              {/*
                El "ver mas" va por URL y no por estado de cliente: asi la seccion
                entera sigue siendo un RSC, el enlace se puede compartir y volver
                atras deshace la expansion. `scroll={false}` evita que la
                navegacion mande el foco al principio de la ficha, que esta cinco
                secciones mas arriba.
              */}
              <Button
                variant="outline"
                render={
                  <Link
                    href={`/apartamentos/${propertyId}?historial=${limite + BLOQUE_HISTORIAL}#historial`}
                    scroll={false}
                  >
                    Ver {BLOQUE_HISTORIAL} más
                  </Link>
                }
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Una fila de 64px con el mismo reparto de dos lineas que la del panel de alertas
 * (§11.3): icono de 16px alineado a la PRIMERA linea, linea 1 con la fecha larga
 * en 14/600 mas el rotulo en 12/600, y linea 2 truncada a una sola linea.
 */
function FilaDeHistorial({ entrada }: { entrada: EntradaDeHistorial }) {
  const { Icono, claseIcono, rotulo } = cabeceraDe(entrada);

  return (
    <li className="flex h-fila-alerta items-start gap-md border-b border-border px-md py-md last:border-b-0">
      {/*
        La caja de linea de la primera fila mide 21px (14 · 1.5) y el icono 16px:
        (21 − 16) / 2 = 2,5 → 3px de desplazamiento hacia abajo. Sin el, el icono
        queda pegado al borde superior y no a la linea que rotula.
      */}
      <Icono
        className={cn('mt-[3px] size-4 shrink-0', claseIcono)}
        strokeWidth={2}
        aria-hidden="true"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-sm">
          <span className="shrink-0 text-body font-semibold text-foreground">
            {formatFechaBog(entrada.fecha)}
          </span>
          {/*
            12/600 y `--muted-foreground`: es el ROTULO de la fila, no su
            contenido, mismo tratamiento que la etiqueta de tipo de una alerta.
          */}
          <span className="truncate text-micro font-semibold text-muted-foreground">
            {rotulo}
          </span>
        </span>

        <LineaSecundaria entrada={entrada} />
      </div>
    </li>
  );
}

/**
 * Icono, color y rotulo de la linea 1, segun la clase de entrada.
 *
 * Para el aseo TODO sale de `estadoDeAseo()`, incluido el caso de gestion
 * externa: una unidad informativa llega con `state` nulo y la derivacion devuelve
 * `CircleDashed` + `Gestión externa`. Por eso la seccion NO se oculta en esas
 * unidades: el historial de fechas si es real, y son las mismas seis siluetas que
 * el admin ya conoce de `/operacion`.
 */
function cabeceraDe(entrada: EntradaDeHistorial): {
  Icono: LucideIcon;
  claseIcono: string;
  rotulo: string;
} {
  if (entrada.clase === 'aseo') {
    const { icono, etiqueta, clase } = estadoDeAseo(entrada.aseo);
    return { Icono: ICONOS_DE_ESTADO[icono], claseIcono: clase, rotulo: etiqueta };
  }

  // `Hammer` en `--status-warn`, el mismo par que la alerta de tipo DAÑO del
  // panel de `/operacion`: es el mismo hecho visto desde otra pantalla.
  return { Icono: Hammer, claseIcono: 'text-status-warn', rotulo: 'Daño reportado' };
}

/**
 * La linea 2. Una sola linea, truncada, con el texto completo en `title`.
 *
 * Truncar SIN `title` es esconder el dato, que es la misma regla que ya siguen la
 * celda A CARGO de la fila de aseo y la linea 2 de la alerta.
 */
function LineaSecundaria({ entrada }: { entrada: EntradaDeHistorial }) {
  if (entrada.clase === 'dano') {
    const resuelto = entrada.dano.resolved_at !== null;

    return (
      <span className="flex min-w-0 items-baseline text-body text-muted-foreground">
        {/*
          Texto de React: escapado por defecto. En la Fase 6 esto lo va a escribir
          un aseador desde la PWA (T-04-10).
        */}
        <span className="truncate" title={entrada.dano.descripcion}>
          {entrada.dano.descripcion}
        </span>
        {/*
          El sufijo NO se trunca (`shrink-0`): si se comiera con la descripcion,
          un dano resuelto se leeria como abierto, que es la lectura contraria.
        */}
        {resuelto && <span className="shrink-0">&nbsp;· Resuelto</span>}
      </span>
    );
  }

  const { aseo } = entrada;
  // En gestion externa no hay a quien nombrar: `cl_unmanaged_is_inert` deja
  // `aseador_id` nulo por construccion, y escribir `Sin asignar` ahi sugeriria
  // que falta asignarlo. En un aseo GESTIONADO sin aseador si falta, y `Sin
  // asignar` es el termino fijo del vocabulario (§18.4).
  const quien = aseo.is_managed ? (aseo.aseador?.full_name ?? SIN_ASIGNAR) : null;
  const tipo = aseo.is_managed ? copyDeTipoDeAseo(aseo.tipo) : null;

  const linea = [quien, tipo].filter((t): t is string => t !== null).join(' · ');

  return (
    <span className="truncate text-body text-muted-foreground" title={linea || undefined}>
      {linea}
    </span>
  );
}
