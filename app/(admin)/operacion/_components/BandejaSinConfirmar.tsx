'use client';

import { Check, Zap } from 'lucide-react';
import { useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FilaDeOperacion } from '@/lib/data/operacion';
import { formatFechaCortaBog } from '@/lib/domain/dates';

import { EstadoVacio } from '../../_components/EstadoVacio';

import { SheetConfirmar } from './SheetConfirmar';

/**
 * La bandeja `Sin confirmar` (ASEO-01, DASH-02, 04-UI-SPEC.md §9).
 *
 * Es el bloque superior del carril lateral y es PERSISTENTE: no se colapsa, no se
 * esconde detrás de una pestaña y no se filtra. Es donde se cumple el criterio 1
 * del ROADMAP —que ningún aseo se pierda— y por eso es lo primero que se ve.
 *
 * ── LA LISTA NO SE PAGINA NI SE CORTA CON "VER MÁS" ────────────────────────
 * Si hay quince, están las quince, con scroll interno. Recortar la bandeja es
 * exactamente la forma en que un aseo se pierde, que es contra lo que existe el
 * producto entero. El scroll cuesta una rueda de ratón; un "ver más" cuesta que
 * alguien no lo pulse.
 *
 * ── EL PRESUPUESTO DE ALTURA VIENE DEL PLAN 04-09 Y NO SE NEGOCIA ──────────
 * El `aside` tiene altura cerrada de `xl` para arriba porque D-02 exige que la
 * bandeja Y el panel de alertas se vean sin scroll de página, con quince sin
 * confirmar y treinta alertas. El reparto acordado es: esta card a `max-h-[40%]`
 * del carril, con la CABECERA Y EL CTA FUERA de su scrollport y solo la lista
 * dentro. §9 pedía la cabecera `sticky top-0` para que el contador nunca se fuera
 * con el scroll; dejarla fuera del scrollport consigue lo mismo por construcción
 * y sin pegado. Apilado (por debajo de `xl`) no hay recorte: la lista va entera.
 *
 * ── EL ORDEN YA VIENE RESUELTO, Y ACÁ NO SE TOCA ───────────────────────────
 * `bandejaSinConfirmar()` ordena por fecha ascendente y, dentro del mismo día,
 * urgentes primero y después por nombre. La urgencia ADELANTA DENTRO DEL DÍA, no
 * salta días: un urgente del viernes no va antes de uno normal de hoy. Reordenar
 * en el componente sería una segunda verdad que se desincroniza de la primera.
 *
 * ── LA TANDA Y POR QUÉ LLEVA `key` ────────────────────────────────────────
 * El CTA abre el `Sheet` en el primero; cada fila lo abre EN ESE ASEO, y la tanda
 * es lo que va de ahí hacia abajo. `sesion` se incrementa en cada apertura y va
 * como `key`, así que reabrir monta un `Sheet` nuevo con su progreso a cero: el
 * `3 de 15` cuenta confirmados de la tanda INICIAL, y cerrar en el 3 y volver a
 * abrir empieza una tanda nueva, no continúa la anterior (§10).
 */

export function BandejaSinConfirmar({
  filas,
  responsables,
  responsableSinAvisos,
}: {
  /** Ya filtradas y ordenadas por `bandejaSinConfirmar()` de `lib/data/operacion`. */
  filas: FilaDeOperacion[];
  /** `property_id` → nombre del responsable fijo del apartamento, o `null`. */
  responsables: Record<string, string | null>;
  /**
   * `property_id` → el responsable fijo se quedó sin canal (D-03, §11.3).
   * Atraviesa este componente sin que lo use: el consumidor es el `Sheet`.
   */
  responsableSinAvisos: Record<string, boolean>;
}) {
  const [tanda, setTanda] = useState<{ desde: number; sesion: number } | null>(null);
  const idTitulo = useId();

  const total = filas.length;

  function abrirEn(desde: number) {
    setTanda((previa) => ({ desde, sesion: (previa?.sesion ?? 0) + 1 }));
  }

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex min-h-0 flex-col rounded-md border border-border bg-background xl:max-h-[40%]"
    >
      {/* Cabecera de 40px, FUERA del scrollport: el contador no se va nunca. */}
      <div className="flex h-fila shrink-0 items-center justify-between gap-sm px-md">
        <h2 id={idTitulo} className="text-heading text-foreground">
          Sin confirmar
        </h2>

        {total > 0 && (
          // `tabular-nums` (§3): sin él, el contador baila de ancho cada vez que
          // se confirma uno y la cabecera entera se mueve.
          <Badge className="bg-surface-warn text-micro font-semibold tabular-nums text-status-warn">
            {total}
          </Badge>
        )}
      </div>

      {total === 0 ? (
        // Variante COMPACTA: esta card vive en un carril de 360px y el bloque de
        // 48px de la variante normal lo desbordaría (§15.1). Sin botón, porque no
        // hay nada que hacer. `Check` en `--status-ok` y no en gris: acá el vacío
        // es un buen resultado, no la ausencia neutra de datos.
        <EstadoVacio
          compacto
          icono={Check}
          claseIcono="text-status-ok"
          encabezado="Todo confirmado."
          cuerpo="Los aseos nuevos van a aparecer acá."
        />
      ) : (
        <>
          {/*
            EL ÚNICO BOTÓN PRIMARIO DE LA PANTALLA (§4.2). `Crear aseo` de la
            cabecera de página va en `outline`: crear un aseo a mano es una acción
            rara y deliberada, y confirmar los quince que acaban de caer es el
            trabajo de la pantalla. Dos rellenos compitiendo dejarían al ojo
            eligiendo entre ellos justo cuando hay quince cosas pendientes.
          */}
          <div className="shrink-0 px-md pb-md">
            <Button type="button" size="lg" className="w-full" onClick={() => abrirEn(0)}>
              Confirmar {total} {total === 1 ? 'aseo' : 'aseos'}
            </Button>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            {filas.map((fila, i) => (
              <li key={fila.id}>
                <button
                  type="button"
                  onClick={() => abrirEn(i)}
                  className="transicion flex h-fila w-full items-center gap-sm border-b border-border px-md text-left hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  {/*
                    `aria-label` y NO `aria-hidden`: es un icono sin texto
                    adyacente que lo explique (§5.2, §16.3). El copy es el del
                    vocabulario fijo, `entra huésped el mismo día`, nunca
                    "urgente" a secas.
                  */}
                  {fila.is_urgent && (
                    <Zap
                      className="size-3.5 shrink-0 text-status-warn"
                      strokeWidth={2}
                      aria-label="Entra huésped el mismo día"
                    />
                  )}

                  {/* Truncar sin `title` es esconder el dato. */}
                  <span className="truncate text-body" title={fila.property?.nombre ?? undefined}>
                    {fila.property?.nombre ?? 'Sin nombre'}
                  </span>

                  <span className="ml-auto shrink-0 text-micro tabular-nums text-muted-foreground">
                    {formatFechaCortaBog(fila.scheduled_date)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/*
            MEDIDO EN EL PLAN 04-07, con dos corridas reales de `sync_feed_apply()`:
            reprogramar un aseo desapunta la reserva en la misma sentencia, así que
            el siguiente sync crea uno NUEVO sin confirmar en la fecha del checkout
            original, y ese aparece acá. Es una consecuencia aceptada —un aseo de
            más lo revisa un humano, uno de menos deja a la aseadora en la calle—
            pero sin esta línea llega como una fila que el admin jura no haber
            pedido. Va fuera del scrollport para que no se la coma el scroll, y
            solo cuando hay algo en la lista.
          */}
          <p className="shrink-0 border-t border-border px-md py-sm text-micro text-muted-foreground">
            Reprogramar deja acá el aseo de la fecha original, sin confirmar. Si ya no
            aplica, cancélalo.
          </p>
        </>
      )}

      {tanda && (
        <SheetConfirmar
          key={tanda.sesion}
          filas={filas.slice(tanda.desde)}
          responsables={responsables}
          responsableSinAvisos={responsableSinAvisos}
          onCerrar={() => setTanda(null)}
        />
      )}
    </section>
  );
}
