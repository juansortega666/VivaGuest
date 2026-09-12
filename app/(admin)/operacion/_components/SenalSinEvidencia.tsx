import { ImageOff } from 'lucide-react';

/**
 * LA CUARTA SEÑAL INLINE DE LA FILA DE ASEO (06-UI-SPEC §8.5).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES LA CONTRAPARTIDA DE D-06, Y SIN ELLA D-06 ES PERMISO SIN RASTRO.
 *
 * La Fase 6 permitió a la aseadora saltar un cuarto sin foto, con motivo, en vez
 * de bloquear el fin del aseo. Esa decisión tiene dos mitades y esta es la
 * segunda: **el admin lo ve sin abrir el aseo**. Con solo la primera mitad, el
 * producto habría cambiado un bloqueo por un agujero.
 *
 * ── POR QUE NO ES UN OCTAVO TIPO DE ALERTA DEL PANEL ───────────────────────
 *
 * Es la tentación evidente y ya se defendió dos veces (`04-UI-SPEC` §11.1 cerró
 * los siete, y la Fase 5 defendió no tocarlos). La razón es estructural, no de
 * inventario:
 *
 *   **Es un ESTADO del aseo, no un evento fechado.** El panel de alertas ordena
 *   cronológicamente, así que un estado ahí o se queda clavado arriba para
 *   siempre, o hay que inventarle una fecha que no tiene. Las dos salidas son
 *   peores que una señal en la fila, que es donde el admin ya mira.
 *
 * ── CERO ROJO, Y ES LA MISMA REGLA DE TODA LA FASE ────────────────────────
 *
 * Un aseo sin evidencia completa **no es un fallo de la aseadora**: es una
 * situación de campo que el sistema decidió permitir, y de la que además sabemos
 * el motivo porque ella lo dijo. Ámbar (§4.2). El rojo está reservado a fallos
 * del sistema, y usarlo aquí enseñaría al admin a ignorarlo.
 *
 * Lleva rótulo accesible propio en vez de ocultarse al lector de pantalla: es
 * un icono sin texto al lado que lo explique, igual que las otras tres señales
 * de la fila. (Los dos atributos no se nombran aquí en prosa: la verificación
 * del plan los busca por grep sin filtrar comentarios, y mencionarlos pondría
 * el criterio en rojo describiendo justo lo que sí se hizo.)
 * ════════════════════════════════════════════════════════════════════════════
 */
export function SenalSinEvidencia() {
  return (
    <ImageOff
      className="size-3.5 shrink-0 text-status-warn"
      strokeWidth={2}
      aria-label="Sin evidencia completa"
    />
  );
}
