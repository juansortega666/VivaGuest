'use client';

import { useEffect, useRef, type ComponentProps, type Ref } from 'react';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { aEnteroCOP, formatMilesCOP } from '@/lib/domain/money';
import { cn } from '@/lib/utils';

/**
 * Entrada de pesos colombianos ENTEROS (UI-SPEC §8.4).
 *
 * ── POR QUE EL INPUT NO ES NUMERICO, QUE ES LO QUE TODO EL MUNDO ESCRIBE ────
 * El tipo de input numérico de HTML está PROHIBIDO en este campo. El nombre
 * literal de ese tipo no se escribe en este archivo ni en un comentario, porque
 * la verificación del plan hace `grep` de ese token y una mención en prosa
 * pondría el build en rojo describiendo justamente lo que no se hizo; en este
 * repo eso ya ha mordido cuatro veces.
 *
 * Tres razones concretas, y ninguna es de gusto:
 *   1. Arrastra los spinners del navegador, que en una tarifa de seis cifras son
 *      un control inútil ocupando ancho.
 *   2. La RUEDA DEL MOUSE cambia el valor cuando el campo tiene foco. El admin
 *      hace scroll por un formulario largo con el cursor encima del campo y la
 *      tarifa cambia sin que toque nada. Es un cambio silencioso de dinero.
 *   3. El manejo de `,` y `.` depende del locale del navegador, no del de la
 *      página: el mismo tecleo produce valores distintos en dos máquinas.
 *
 * `type="text"` con `inputMode="numeric"` da el teclado numérico en móvil sin
 * ninguna de las tres.
 *
 * ── LA MASCARA Y SU INVERSO SON UN PAR, Y SEPARARLOS CORROMPE LA TARIFA ─────
 * Al `blur` el valor se agrupa en miles: `120000` se muestra `120.000`. Ese
 * string NO puede llegar al esquema, porque `z.coerce.number()` es `Number()` por
 * debajo y `Number('120.000')` es **120**. Por eso este componente se registra
 * SIEMPRE con `opcionesRegistroMoneda`, cuyo `setValueAs` es `aEnteroCOP`: la
 * conversión ocurre al leer del DOM, así que el estado del formulario nunca ve
 * la máscara. Uno sin el otro guarda la tarifa dividida por mil, y el valor
 * resultante es un entero válido que pasa los tres CHECK de `properties`.
 *
 * Mientras el campo tiene foco se muestra sin agrupar. No es una simplificación:
 * reformatear en cada tecla obliga a recolocar el cursor a mano y produce el
 * clásico salto de caret al escribir en medio de la cifra.
 */

/**
 * Las opciones con las que este campo se pasa a `register()`.
 *
 * Va aquí y no en cada llamada del formulario para que no exista la posibilidad
 * de registrar el campo sin `setValueAs`. Ver el bloque de arriba.
 */
export const opcionesRegistroMoneda = { setValueAs: aEnteroCOP } as const;

/** Teclas que el campo rechaza literalmente, según §8.4. */
const TECLAS_PROHIBIDAS = new Set(['.', ',', '-', '+', 'e', 'E']);

type Props = Omit<ComponentProps<'input'>, 'type' | 'inputMode'> & {
  /** El `ref` que entrega `register()` de react-hook-form. */
  ref?: Ref<HTMLInputElement>;
};

export function CampoMoneda({ className, ref, onChange, onFocus, onBlur, ...props }: Props) {
  const propio = useRef<HTMLInputElement | null>(null);

  // El valor inicial llega como dígitos planos (`'120000'`), porque es lo que el
  // estado del formulario guarda y lo que `aEnteroCOP` sabe deshacer. Se agrupa
  // en el DOM al montar, sin avisarle a react-hook-form: `setValueAs` es el
  // inverso exacto de esta máscara, así que el estado sigue viendo el entero
  // aunque el DOM muestre los puntos.
  useEffect(() => {
    const nodo = propio.current;
    if (!nodo) return;
    if (document.activeElement === nodo) return;
    nodo.value = formatMilesCOP(nodo.value);
  }, []);

  function asignarRef(nodo: HTMLInputElement | null) {
    propio.current = nodo;
    if (typeof ref === 'function') ref(nodo);
    else if (ref) ref.current = nodo;
  }

  return (
    <InputGroup className={cn('w-col-dinero', className)}>
      {/*
        El `$` va FUERA del input y no dentro del `value`: metido en el valor, el
        admin tendría que borrarlo cada vez que corrige la cifra, y `aEnteroCOP`
        tendría que limpiarlo en cada lectura.
      */}
      <InputGroupAddon align="inline-start">
        {/* `aria-hidden` porque la etiqueta del campo ya dice de qué dinero se
            trata; anunciarlo sería leer "dólar" en una app en pesos. */}
        <span aria-hidden="true">$</span>
      </InputGroupAddon>

      <InputGroupInput
        {...props}
        ref={asignarRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="tabular-nums"
        onKeyDown={(e) => {
          // Rechazo LITERAL al teclear, que es lo que pide §8.4. El saneado del
          // `onChange` de abajo ya cubriría el caso, pero dejar que el carácter
          // aparezca y desaparezca solo es peor que no dejarlo entrar.
          if (TECLAS_PROHIBIDAS.has(e.key)) e.preventDefault();
          props.onKeyDown?.(e);
        }}
        onFocus={(e) => {
          // Se desagrupa al entrar: editar en medio de `1.500.000` con los puntos
          // puestos es donde aparece el salto de caret.
          const entero = aEnteroCOP(e.currentTarget.value);
          e.currentTarget.value = entero == null ? '' : String(entero);
          onFocus?.(e);
        }}
        onChange={(e) => {
          // Saneado de lo que no vino del teclado: pegado, arrastre y IME. Sin
          // esto, un pegado de `$ 120.000,50` deja el campo con caracteres que
          // `aEnteroCOP` tendría que adivinar.
          const soloDigitos = e.currentTarget.value.replace(/\D/g, '');
          if (e.currentTarget.value !== soloDigitos) e.currentTarget.value = soloDigitos;
          onChange?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.value = formatMilesCOP(e.currentTarget.value);
          // El `onBlur` de react-hook-form se llama DESPUES de reescribir el
          // valor: con `mode: 'onBlur'` es el momento en que valida, y tiene que
          // leer lo mismo que hay en pantalla.
          onBlur?.(e);
        }}
      />
    </InputGroup>
  );
}
