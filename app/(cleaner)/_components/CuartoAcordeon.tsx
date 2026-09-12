'use client';

import { CircleCheck, SkipForward } from 'lucide-react';

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cuartoCompleto, progresoDeCuarto, type GrupoDeCuarto } from '@/lib/domain/checklist';
import { ETIQUETAS_SKIP } from '@/lib/domain/motivos';

import { FilaDeTarea } from './FilaDeTarea';

/**
 * UN CUARTO DEL ACORDEON (06-UI-SPEC §7.2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ACORDEON Y NO ASISTENTE POR PASOS. Es D-03, y tiene dos razones que
 * conviene que se lean juntas:
 *
 *   1. **La aseadora no limpia en orden fijo.** Puede arrancar por el bano
 *      porque es lo que esta libre, o dejar la cocina para el final porque el
 *      huesped todavia esta desayunando. Un asistente por pasos le impone un
 *      orden que la realidad no tiene, y el sintoma es que marca todo al final
 *      de memoria, que es peor que no marcar.
 *   2. **Ya hay un asistente por pasos despues**, el de la evidencia (§8). Dos
 *      seguidos cansan, y el segundo pierde la atencion que necesita.
 *
 * De ahi salen las tres reglas de abajo, que NO son de estilo:
 *
 *   · Se puede abrir mas de un cuarto a la vez.
 *   · Ningun cuarto se bloquea nunca: cualquier orden, en cualquier momento.
 *   · Un cuarto completo se recoge solo, pero NO desaparece: verlo en verde es
 *     la unica senal de que quedo hecho.
 *
 * ── LA ETIQUETA ES EL SNAPSHOT, NO EL NOMBRE ACTUAL ────────────────────────
 *
 * `grupo.etiqueta` viene de `room_label`, que `confirm_cleaning` congelo al
 * crear el checklist. Si el admin renombra el cuarto manana, el aseo de hoy
 * sigue diciendo lo que la aseadora vio. Resolverlo contra el catalogo, que es
 * lo "obvio" al tener el identificador a mano, cambiaria el pasado.
 *
 * ── EL NOMBRE ACCESIBLE LLEVA EL CONTADOR ──────────────────────────────────
 *
 * `aria-label` explicito, porque el texto visible dice `1/4` y un lector de
 * pantalla lo pronuncia como "uno barra cuatro" (§12.2). El rotulo dice
 * `Baño principal, 1 de 4 tareas`, y el motivo del salto entra ahi tambien: es
 * informacion, no decoracion.
 * ════════════════════════════════════════════════════════════════════════════
 */

export function CuartoAcordeon({
  grupo,
  soloLectura = false,
  onCambio,
}: {
  grupo: GrupoDeCuarto;
  soloLectura?: boolean;
  onCambio: (itemId: string, hecha: boolean) => void;
}) {
  const { hechas, total } = progresoDeCuarto(grupo);
  const completo = cuartoCompleto(grupo);
  const saltado = grupo.saltado;
  const motivo = saltado === null ? null : ETIQUETAS_SKIP[saltado.motivo];

  const rotulo = [
    grupo.etiqueta,
    `${hechas} de ${total} tareas`,
    ...(motivo === null ? [] : [`sin foto: ${motivo}`]),
  ].join(', ');

  return (
    <AccordionItem value={grupo.propertyRoomId} className="border-b border-border">
      <AccordionTrigger
        aria-label={rotulo}
        className={[
          'min-h-cabecera-cuarto items-center gap-md py-0 hover:no-underline',
          // El chevron de la primitiva va al final y a 16px. Aqui va PRIMERO,
          // como en el boceto de §7.1, y a los 20px estandar de este arbol
          // (§12.2). Se reposiciona con `order` y no reescribiendo la primitiva:
          // el resto de la aplicacion la usa con su forma de escritorio.
          '**:data-[slot=accordion-trigger-icon]:order-first',
          '**:data-[slot=accordion-trigger-icon]:ml-0',
          '**:data-[slot=accordion-trigger-icon]:size-5',
        ].join(' ')}
      >
        {/*
          La etiqueta y las senales. `flex-1` para que el contador se vaya al
          borde derecho sin depender del ancho del nombre del cuarto.
        */}
        <span className="flex flex-1 items-center gap-xs">
          {completo && (
            <CircleCheck
              size={20}
              strokeWidth={2}
              className="shrink-0 text-status-ok"
              aria-hidden="true"
            />
          )}

          {/*
            SALTADO NO ES ROJO (§4.2). La aseadora no hizo nada malo: dijo por
            que no habia foto, que es justo lo que el producto le pidio. El rojo
            esta reservado a fallos del sistema, y usarlo aqui ensena a ignorarlo.
          */}
          {motivo !== null && (
            <SkipForward
              size={20}
              strokeWidth={2}
              className="shrink-0 text-status-warn"
              aria-hidden="true"
            />
          )}

          <span className="min-w-0 truncate text-heading-movil text-foreground">
            {grupo.etiqueta}
          </span>
        </span>

        {/*
          `tabular-nums` porque el contador cambia con cada toque: sin el, los
          digitos de anchos distintos hacen bailar la columna en cada marca.
        */}
        <span className="shrink-0 text-micro-movil tabular-nums text-muted-foreground">
          {hechas}/{total}
        </span>
      </AccordionTrigger>

      <AccordionContent className="pt-0 pb-md">
        {motivo !== null && (
          <p className="pb-sm text-micro-movil text-status-warn">Sin foto: {motivo}</p>
        )}

        <div className="flex flex-col">
          {grupo.tareas.map((tarea) => (
            <FilaDeTarea
              key={tarea.id}
              itemId={tarea.id}
              etiqueta={tarea.task_label}
              hecha={tarea.done_at !== null}
              soloLectura={soloLectura}
              onCambio={onCambio}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
