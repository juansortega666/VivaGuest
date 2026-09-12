import { BellOff } from 'lucide-react';

/**
 * LA ADVERTENCIA DE D-03 EN EL SITIO DONDE SE TOMA LA DECISION (05-UI-SPEC §11.3).
 *
 * Dos superficies la montan —el `Sheet` de confirmacion encadenada y
 * `DialogoReasignar`— y las dos pintan EXACTAMENTE la misma linea. Existe como
 * componente y no como dos parrafos copiados por una razon operativa, no
 * estetica: el copy es identico en los dos sitios y dos copias divergen en el
 * primer retoque de redaccion, dejando al admin con dos versiones de la misma
 * advertencia segun por donde haya entrado.
 *
 * ── POR QUE ESTO NO ES UN OCTAVO TIPO DE ALERTA (§11.5) ────────────────────
 * El panel del carril lateral ordena cronologicamente por el instante del hecho,
 * y "este aseador se quedo sin canal" no tiene instante: es un estado que dura
 * semanas. En el panel se quedaria clavado arriba para siempre o habria que
 * inventarle una fecha. El sitio correcto de un estado persistente es donde se
 * toma la decision que depende de el, y esa decision es "a quien le doy este
 * aseo".
 *
 * ── LO QUE ESTA LINEA NO HACE, Y CADA UNO ES DELIBERADO (§11.3) ────────────
 * 1. NO deshabilita el boton de la superficie que la monta. El caso "sin
 *    responsable" si lo deshabilita porque sin responsable la RPC falla; aqui la
 *    RPC funciona y el aseo queda asignado y correcto. Lo unico que no sale es el
 *    aviso, y bloquear la confirmacion castigaria al admin por un telefono ajeno
 *    (T-05-52).
 * 2. NO abre un dialogo de confirmacion. El `Sheet` esta calibrado para quince
 *    seguidas: quince dialogos encadenados dentro de un `Sheet` encadenado son
 *    una pila de tres y hacen inusable la tanda.
 * 3. NO cambia el copy de ningun boton.
 *
 * ── CERO ROJO, Y LA RAZON ESTA ESCRITA (§4.2) ──────────────────────────────
 * El unico color de este archivo es `--status-warn`. El token de rojo del sistema
 * NO se escribe aqui, ni siquiera en esta prosa: hay un criterio de aceptacion
 * que lo cuenta con un grep sin filtro de comentarios. El aseador no hizo nada
 * malo —lo tiene su telefono—, y ese rojo esta reservado a lo que destruye datos.
 */
export function AvisoAseadorSinPush({ nombre }: { nombre: string }) {
  return (
    <p className="flex items-start gap-xs text-body text-status-warn">
      {/* 14px, el tamano de §11.3. Oculto al lector de pantalla: el texto de al
          lado ya dice todo lo que el icono significa. */}
      <BellOff className="mt-px size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span>
        {nombre} no tiene los avisos activos. Confirmar lo asigna igual, pero no le va a sonar
        el teléfono.
      </span>
    </p>
  );
}
