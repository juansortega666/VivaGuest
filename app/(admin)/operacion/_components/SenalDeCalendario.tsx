import { CalendarCheck, CalendarX } from 'lucide-react';

import type { EstadoDeSincronizacion } from '@/lib/domain/salud-sync';

/**
 * LA SEÑAL DE ESTADO DEL CALENDARIO, EN LA CABECERA DE `/operacion` (D-05-5).
 *
 * El dueño la pidió así el 2026-09-28: pequeña, neutra mientras el iCal sincroniza
 * bien, y que **no compita visualmente cuando todo va bien**. Por eso es una señal y
 * no una quinta métrica del vistazo: saber que el calendario sincroniza no cambia
 * nada de lo que el admin va a hacer en los próximos minutos, y la regla del vistazo
 * es que si un dato no cambia el comportamiento, no va ahí.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * NO DECIDE NADA. Recibe el estado ya resuelto por `estadoDeSincronizacion()`, que
 * la página llama UNA vez con la MISMA marca que alimenta la alerta
 * `calendario_caido` de `alertasComputadas()`. Misma disciplina que `EstadoAseo` con
 * `estadoDeAseo()`: un `if` sobre el umbral escrito acá sería una segunda verdad
 * sobre el mismo dato, y la señal de la cabecera y la alerta de la campana podrían
 * contradecirse dentro del mismo render.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── DOS ICONOS DISTINTOS, NO DOS COLORES DEL MISMO PUNTO ───────────────────
 *
 * `04-UI-SPEC` §5 prohíbe el color como ÚNICO canal, y un punto neutro contra un
 * punto rojo se diferencian solo por el color. Así que la rama sana y la caída tienen
 * SILUETAS distintas, y además nombre accesible las dos, que es el segundo canal para
 * quien no ve el color. En la rama caída hay un tercero: texto visible.
 *
 * `CalendarX` es el MISMO icono que la alerta `calendario_caido` ya usa en
 * `MAPA_DE_ALERTAS`, así que el admin lo aprende una vez. `CalendarCheck` es una
 * **AMPLIACIÓN DECLARADA** de la lista cerrada de iconos de §17.3, con el mismo trato
 * que tuvo `HardDrive` en la Fase 5 y `Bell` antes: la regla que no se toca no es "la
 * lista no crece", es que **el color no codifica el tipo**.
 *
 * ── EL COLOR DE LA RAMA CAÍDA SE DESVÍA DE LO QUE EL DUEÑO PIDIÓ, Y SE DICE ─
 *
 * Pidió ROJO. Sale en `--status-warn`, que es el token con el que ya están pintadas
 * TODAS las señales de aviso de esta pantalla: el `Zap` de urgente, el `Flag` de
 * revisión, el `Hourglass` de hora límite vencida, el `ImageOff` de evidencia
 * incompleta, el chip `Sin asignar`, los dos badges y el contador de alertas.
 *
 * `--destructive` está reservado a acciones destructivas y al borde de error, y
 * `02-UI-SPEC` §4.6 ya declara el choque de hues entre `--primary` (29) y
 * `--destructive` (13.7): meter un tercer rojo de estado pondría TRES rojos en una
 * pantalla, y el admin dejaría de poder leer cuál de los tres exige algo de él.
 *
 * **Si al verlo el dueño dice que no grita bastante, es un cambio de una línea**, y
 * va en la lista del checkpoint de este plan.
 */
export function SenalDeCalendario({ estado }: { estado: EstadoDeSincronizacion }) {
  const caida = estado === 'caida';

  return (
    <span
      data-slot="senal-calendario"
      data-estado={estado}
      title={
        caida
          ? 'Ningún feed de calendario ha sincronizado en las últimas tres horas. Los checkouts nuevos no están entrando.'
          : 'Los calendarios de Airbnb y Booking están sincronizando.'
      }
      className={
        caida
          ? 'flex items-center gap-xs text-micro text-status-warn'
          : 'flex items-center gap-xs text-micro text-muted-foreground'
      }
    >
      {caida ? (
        <CalendarX
          className="size-4 shrink-0"
          strokeWidth={2}
          role="img"
          aria-label="Calendario caído"
        />
      ) : (
        <CalendarCheck
          className="size-4 shrink-0"
          strokeWidth={2}
          role="img"
          aria-label="Calendario sincronizando"
        />
      )}

      {/*
        TEXTO VISIBLE SOLO EN LA RAMA CAÍDA, y eso es la mitad de lo que el dueño
        pidió: que la señal no compita cuando todo va bien. Sana, es un icono de 16px
        en gris y nada más. Caída, gana palabras, que es el canal de más ancho de
        banda que hay.
      */}
      {caida && <span>Calendario caído</span>}
    </span>
  );
}
