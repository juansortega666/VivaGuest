'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';

import type { FilaDeOperacion } from '@/lib/data/operacion';
import { estadoDeAseo } from '@/lib/domain/cleanings';
import { formatFechaBog } from '@/lib/domain/dates';

import { TablaDia } from './TablaDia';

/**
 * Un bloque de dia: la cabecera colapsable de 48px mas su tabla (04-UI-SPEC.md
 * §8.1).
 *
 * ── CLIENT COMPONENT, Y SOLO POR EL COLAPSO ─────────────────────────────────
 * Dos estados de cliente: si el dia esta abierto y si se ven los cancelados. Nada
 * mas. Las filas llegan ya leidas por el RSC.
 *
 * ── EL ESTADO DE COLAPSO NO SE PERSISTE ─────────────────────────────────────
 * Cada carga abre `Hoy` y cierra los otros dos. No se construye `localStorage`:
 * el admin entra a esta pantalla a ver el dia de hoy, y recordar que ayer dejo
 * `Siguientes` abierto no le ahorra nada que valga el estado que hay que
 * mantener.
 *
 * ── LOS CANCELADOS NO SE ESCONDEN, SE PLIEGAN ───────────────────────────────
 * No se muestran por defecto porque un aseo cancelado no tiene ninguna accion
 * posible, y ocupar una fila de 40px con el, en una lista de 30, empuja fuera
 * algo accionable. Pero el conteo esta a la vista y estan a un clic. Los
 * TERMINADOS si se quedan visibles: son el avance del dia.
 */

/** Un dia con cero filas tambien pinta su cabecera: que no haya nada es informacion. */
export function BloqueDia({
  rotulo,
  fecha,
  filas,
  expandidoInicial = false,
  children,
}: {
  /** El rotulo relativo (`Hoy`, `Mañana`, `Siguientes (5 días)`). Opcional. */
  rotulo?: string;
  /** `'YYYY-MM-DD'` de negocio. Se formatea con `formatFechaBog()`. */
  fecha?: string;
  /** Las filas del dia. En el bloque agregado, las de todos sus dias, solo para contar. */
  filas: FilaDeOperacion[];
  expandidoInicial?: boolean;
  /**
   * Contenido propio en vez de la tabla. Lo usa `Siguientes`, que no es un dia:
   * agrupa cinco, y cada uno trae su cabecera y su tabla. Cuando hay `children`
   * NO se pinta el toggle de cancelados, porque cada dia de dentro tiene el suyo
   * y dos toggles sobre las mismas filas se contradicen a la primera.
   */
  children?: ReactNode;
}) {
  const idCabecera = useId();
  const idContenido = useId();

  const [expandido, setExpandido] = useState(expandidoInicial);
  const [verCancelados, setVerCancelados] = useState(false);

  const { visibles, cancelados, sinConfirmar } = useMemo(() => particionar(filas), [filas]);

  const agregado = children !== undefined;
  const total = visibles.length;

  return (
    <section aria-labelledby={idCabecera} className="rounded-md border border-border bg-background">
      {/*
        `relative` para que el `::after` del boton cubra la cabecera entera: toda
        ella es el control de colapso (§8.1). El toggle de cancelados es un
        hermano con `relative z-10`, y NO un boton anidado dentro del otro, que
        seria HTML invalido y ademas inalcanzable por teclado en varios lectores.
        Por eso tampoco hace falta ningun `stopPropagation`: no hay evento que
        propagar hacia arriba.
      */}
      <div className="relative flex h-dia-cabecera items-center gap-md rounded-t-md border-b border-border bg-canvas px-md">
        <button
          type="button"
          id={idCabecera}
          aria-expanded={expandido}
          aria-controls={idContenido}
          onClick={() => setExpandido((v) => !v)}
          className="transicion flex items-center gap-sm rounded-sm text-heading text-foreground after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expandido ? (
            <ChevronDown className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          )}

          {/*
            EL ROTULO RELATIVO VA PRIMERO porque es lo que se escanea; la fecha
            absoluta detras porque es lo que se verifica.
          */}
          {etiquetaDeCabecera(rotulo, fecha)}
        </button>

        <span className="ml-auto text-micro tabular-nums text-muted-foreground">
          {total} {total === 1 ? 'aseo' : 'aseos'}
          {/* `3 sin confirmar` solo si es mayor que cero: un `0 sin confirmar` es
              una linea de texto que dice que no hay nada que decir. */}
          {sinConfirmar > 0 && ` · ${sinConfirmar} sin confirmar`}
        </span>

        {!agregado && cancelados.length > 0 && (
          <button
            type="button"
            aria-pressed={verCancelados}
            onClick={() => setVerCancelados((v) => !v)}
            className="transicion relative z-10 shrink-0 rounded-sm text-micro text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {verCancelados ? 'Ocultar cancelados' : `Ver cancelados (${cancelados.length})`}
          </button>
        )}
      </div>

      {/*
        `hidden` y no desmontar: el contenido colapsado sigue en el DOM, asi que el
        buscador del navegador lo encuentra y `aria-controls` apunta a algo que
        existe siempre, que es lo que el atributo promete.
      */}
      <div id={idContenido} hidden={!expandido}>
        {agregado ? children : <TablaDia filas={verCancelados ? [...visibles, ...cancelados] : visibles} />}
      </div>
    </section>
  );
}

/**
 * Reparte las filas del dia en lo que se ve, lo cancelado y lo que falta por
 * confirmar.
 *
 * Los tres salen de `estadoDeAseo()`, la unica derivacion del repo: contar aqui
 * con un `state === 'cancelada'` propio seria el mismo `if` duplicado que esa
 * funcion existe para evitar.
 *
 * `N aseos` cuenta lo VISIBLE, no el total bruto: los cancelados llevan su propio
 * conteo al lado, y sumarlos en los dos sitios haria que 14 y 2 no cuadraran con
 * las 14 filas que el admin tiene delante.
 */
function particionar(filas: FilaDeOperacion[]) {
  const visibles: FilaDeOperacion[] = [];
  const cancelados: FilaDeOperacion[] = [];
  let sinConfirmar = 0;

  for (const fila of filas) {
    const { clave } = estadoDeAseo(fila);

    if (clave === 'cancelado') {
      cancelados.push(fila);
      continue;
    }

    if (clave === 'sin_confirmar') sinConfirmar += 1;
    visibles.push(fila);
  }

  return { visibles, cancelados, sinConfirmar };
}

/** `Hoy · jue, 3 de septiembre`, o solo la fecha cuando el dia no tiene rotulo propio. */
function etiquetaDeCabecera(rotulo: string | undefined, fecha: string | undefined): string {
  if (!fecha) return rotulo ?? '';

  const absoluta = formatFechaBog(fecha);
  if (rotulo) return `${rotulo} · ${absoluta}`;

  // `Intl` emite el dia de la semana en minuscula en es-CO, y esta cadena arranca
  // una cabecera. Se capitaliza aqui y no en `formatFechaBog()`, que la sirve
  // tambien a mitad de frase.
  return absoluta.charAt(0).toUpperCase() + absoluta.slice(1);
}
