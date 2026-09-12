'use client';

import { useId, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { aEnteroCOP, formatMilesCOP } from '@/lib/domain/money';

/**
 * CUANTO COSTO (REPORT-02, §9.2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES EL PRIMER CAMPO DE TEXTO DEL ARBOL DEL ASEADOR, Y ESO IMPORTA.
 *
 * Hasta esta fase, `app/(cleaner)/` no tenia ni un solo campo que se enfocara.
 * Aqui se cobra, por primera vez, la decision que la Fase 5 tomo por
 * anticipado: la escala tipografica movil, con el texto corriente a **16 px
 * exactos**.
 *
 * **iOS Safari HACE ZOOM AUTOMATICO al enfocar un campo cuyo tamano de letra es
 * menor a 16 px.** Es comportamiento del motor de WebKit, no una preferencia:
 * la pagina se amplia, el layout se descoloca y la persona tiene que pellizcar
 * para volver. Con la escala de escritorio (14 px) eso pasaria **cada vez** que
 * la aseadora toque este campo, y solo se ve en un iPhone real con el campo
 * enfocado. `scripts/ci/check-escala-movil.sh` existe para que esto no se
 * destense.
 *
 * ── EL TECLADO, Y POR QUE NO ES EL COMPLETO ────────────────────────────────
 *
 * El teclado completo obliga a cambiar de plano para encontrar los digitos, con
 * guantes y de pie. El atributo de modo de entrada pide el numerico directo.
 *
 * **Se usa `numeric` y no `decimal`, y conviene saber por que**: el contrato de
 * UI escribio `decimal`, pero en pesos colombianos **no hay subunidad**, y este
 * campo rechaza literalmente el punto y la coma (igual que `CampoMoneda.tsx` del
 * arbol del admin, por las mismas tres razones medidas alli). `decimal` pintaria
 * una tecla de separador que no hace nada: un control muerto en un teclado que
 * se usa con guantes. El dia que entre una moneda con centavos, este es el sitio
 * donde cambia, y el comentario dice cual es la condicion.
 *
 * ── EL VALOR QUE SALE ES UN ENTERO EN LA UNIDAD MINIMA ─────────────────────
 *
 * Regla 1 del camino a v2 de `PROJECT.md`: el entero sirve para COP, CLP y PYG,
 * que no tienen subunidad, y **no sirve** para MXN, BRL, ARS ni PEN. El producto
 * se va a vender en LATAM.
 *
 * En pantalla la aseadora ve pesos normales con separador de miles. **La unidad
 * minima es cosa del sistema**, y no se le menciona.
 *
 * ── LA MASCARA Y SU INVERSO SON UN PAR ─────────────────────────────────────
 *
 * Al salir del campo se agrupa (`12000` -> `12.000`). Esa cadena NO puede llegar
 * al esquema: `Number('12.000')` es **12**, o sea el gasto dividido por mil, y
 * seria un entero perfectamente valido que ningun `CHECK` atraparia. Por eso lo
 * que se envia sale de `aEnteroCOP()` y no del DOM.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Lo que este campo rechaza al teclear, igual que el del admin. */
const TECLAS_PROHIBIDAS = new Set(['.', ',', '-', '+', 'e', 'E']);

const ROTULO = '¿Cuánto costó?';

export function CampoDeMonto({
  name = 'monto',
  onValor,
}: {
  name?: string;
  /** El entero en unidad minima, o `null` si el campo esta vacio. */
  onValor?: (valor: number | null) => void;
}) {
  const campoId = useId();
  const [texto, setTexto] = useState('');
  const [enfocado, setEnfocado] = useState(false);

  const entero = aEnteroCOP(texto);

  return (
    <div className="flex flex-col gap-xs">
      <Label htmlFor={campoId} className="text-micro-movil text-muted-foreground">
        {ROTULO}
      </Label>

      {/*
        El campo que se ve NO es el que se envia. El visible lleva la mascara; el
        oculto lleva el entero, que es lo que la action valida. Asi la mascara no
        puede corromper la cifra ni aunque alguien la cambie.
      */}
      <input type="hidden" name={name} value={entero === null ? '' : String(entero)} />

      <Input
        id={campoId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        // 16 px exactos. Ver la cabecera: por debajo, el motor hace zoom.
        className="min-h-toque text-body-movil tabular-nums"
        value={enfocado ? texto : formatMilesCOP(texto)}
        onKeyDown={(e) => {
          // Rechazo literal al teclear: dejar que el caracter aparezca y
          // desaparezca solo es peor que no dejarlo entrar.
          if (TECLAS_PROHIBIDAS.has(e.key)) e.preventDefault();
        }}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        onChange={(e) => {
          // Saneado de lo que no vino del teclado: pegado, arrastre y teclados
          // predictivos. Sin esto, pegar `$ 12.000,50` deja basura que habria
          // que adivinar al convertir.
          const soloDigitos = e.currentTarget.value.replace(/\D/g, '');
          setTexto(soloDigitos);
          onValor?.(aEnteroCOP(soloDigitos));
        }}
      />
    </div>
  );
}
