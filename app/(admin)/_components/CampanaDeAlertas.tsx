'use client';

import { Bell } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { AlertasDeLaCampana } from '@/lib/data/campana';

import { PanelAlertas } from './PanelAlertas';

/**
 * LA CAMPANA DE ALERTAS DE LA BARRA SUPERIOR (D-05-9, decisión del dueño del
 * 2026-09-28).
 *
 * El panel de alertas vivía en un carril lateral fijo de `/operacion`, compitiendo
 * por 360px con la bandeja `Sin confirmar`. Ahora vive acá, en el shell, y por lo
 * tanto está disponible en las CUATRO secciones del admin y no solo en la de
 * operación.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL CONTADOR DICE EL TOTAL SIN ATENDER, NUNCA LO RENDERIZADO NI LO FILTRADO.
 *
 * Es el criterio 4 del ROADMAP de la Fase 4 y la única garantía MEDIBLE de que una
 * superficie con scroll interno no es un escondite. Y al mudarse a un popover la
 * garantía importa MÁS, no menos: la superficie es más pequeña, así que la tentación
 * de paginar es mayor. Hay un caso E2E que siembra treinta alertas y afirma que dice
 * treinta con siete en pantalla.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── EL CONTENIDO SE MONTA AL ABRIR, NO ANTES ──────────────────────────────
 *
 * Es el default de la primitiva (Base UI no monta el `Popup` cerrado, salvo que se
 * le pida lo contrario) y se deja así a propósito. Con treinta filas montadas en
 * reposo, se pagaría el árbol entero en CADA carga de CADA página del admin por algo
 * que casi nunca se abre. Es la misma razón por la que `MenuAseo` monta solo el
 * diálogo abierto y no los cinco.
 *
 * **Y esto es una decisión de COSTE, no una propiedad defendida.** Está medido: el
 * señuelo de montar siempre NO pone nada en rojo, y eso queda anotado en vez de
 * inventarle una aserción. Si alguien la necesita algún día, lo que habría que medir
 * es el tamaño del DOM en reposo, no el comportamiento.
 *
 * ── EL PRESUPUESTO DE ALTURA ES CERRADO Y LA LISTA SCROLLEA POR DENTRO ────
 *
 * Mismo mecanismo de `min-h-0` y `flex-1` que el panel ya usaba en el carril: lo que
 * cambia es quién le cierra la altura. **Lo que NO se hace es paginar**, y la razón
 * es la que ya está escrita en `PanelAlertas`: un "ver más" cuesta que alguien no lo
 * pulse.
 *
 * La resta de `--alto-barra-pruebas` NO es opcional y no es celo: `app/layout.tsx`
 * pinta la barra de ambiente de pruebas de 48px en todo entorno que no sea
 * producción, **incluido el de la suite E2E**. Sin restarla, el popover desborda 48px
 * exactos justo donde se mide.
 */
export function CampanaDeAlertas({ alertas }: { alertas: AlertasDeLaCampana }) {
  const total = alertas.sinAtender.length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-slot="campana-alertas"
            // El nombre accesible LLEVA EL CONTEO, porque el badge es un número
            // suelto al lado de un icono y eso no se lee en voz alta como nada. Y
            // dice `sin atender` y no `nuevas`: `read_at` significa ATENDIDA, que es
            // una acción explícita del admin, no "vista".
            aria-label={
              total === 0 ? 'Alertas, ninguna sin atender' : `Alertas, ${total} sin atender`
            }
            className="transicion relative flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-canvas hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        }
      >
        <Bell className="size-4" strokeWidth={2} aria-hidden="true" />

        {/*
          El contador se pinta SOLO si es mayor que cero: un `0` permanente en la
          barra entrena al ojo a saltárselo, y el día que diga `3` no lo va a ver. Es
          el mismo argumento que ya está escrito para `Atrasados · 0 aseos`.

          `tabular-nums` por la razón que ya está escrita dos veces en este árbol: sin
          él el número baila de ancho al pasar de 9 a 10 y arrastra lo que tiene al
          lado, que acá es el menú de usuario.

          `aria-live="polite"` NO va acá aunque el panel sí lo lleve: el nombre
          accesible del botón ya dice el conteo, y anunciar el número dos veces por
          el mismo cambio es ruido. El panel conserva el suyo.
        */}
        {total > 0 && (
          <Badge
            data-slot="contador-campana"
            className="absolute -top-px -right-px bg-surface-warn px-xs text-micro font-semibold tabular-nums text-status-warn"
          >
            {total}
          </Badge>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        // `p-0` porque el panel trae su propio padding por zonas: la cabecera fuera
        // del scrollport y las filas dentro. Un padding del popover metería el borde
        // del scroll por dentro y la última fila se cortaría a media altura.
        className="flex w-dialogo flex-col p-0 max-h-[calc(100svh-var(--spacing-barra)-var(--spacing-xl)-var(--alto-barra-pruebas,0px))]"
      >
        <PanelAlertas
          sinAtender={alertas.sinAtender}
          atendidas={alertas.atendidas}
          ahoraMs={alertas.leidoEnMs}
        />
      </PopoverContent>
    </Popover>
  );
}
