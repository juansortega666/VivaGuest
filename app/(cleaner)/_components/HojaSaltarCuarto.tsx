'use client';

import { useActionState, useState } from 'react';

import { saltarCuarto } from '@/app/(cleaner)/aseos/[id]/_actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { ETIQUETAS_SKIP, MOTIVOS_SKIP, exigeNota, type MotivoSkip } from '@/lib/domain/motivos';

/**
 * SALTAR LA EVIDENCIA DE UN CUARTO, CON MOTIVO DE LISTA CERRADA (D-06, §8.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CERO ROJO EN TODO ESTE ARCHIVO, Y NO ES UNA ELECCION DE PALETA.
 *
 * La aseadora **no hizo nada malo**: el huesped dejo cosas adentro, el cuarto
 * estaba con llave, no habia luz. Reporto honestamente que no pudo, que es
 * exactamente lo que el producto le pidio que hiciera. Pintarle rojo la trata
 * como si hubiera fallado, y lo que eso ensena en tres semanas es a NO decirlo:
 * a fotografiar cualquier cosa con tal de que la pantalla no la regane. Ahi se
 * pierde el dato entero.
 *
 * El rojo de este arbol esta reservado a fallos del SISTEMA (§4.2). Una subida
 * caida si lo es, y por eso el paso de foto si lo usa.
 *
 * ── LO QUE SE DESCARTO, Y CONVIENE QUE SE LEA COMO DECISION ────────────────
 *
 * Se propuso exigir una explicacion libre de **minimo 30 palabras** para
 * cualquier salto. Se descarto, y la razon es de comportamiento humano, no
 * tecnica:
 *
 *   · un contador de palabras **se burla solo**: la gente escribe relleno hasta
 *     pasarlo, y el campo acaba lleno de texto que no dice nada
 *   · **castiga a quien tiene una razon legitima pero corta**, como "el cuarto
 *     estaba cerrado", que es una frase completa y verdadera
 *
 * Una lista cerrada, ademas, **se puede contar**: el admin ve cuantas veces pasa
 * cada cosa y decide si la lista de tareas esta mal hecha. Un texto libre no se
 * cuenta.
 *
 * El campo libre sigue existiendo, opcional, y solo se vuelve obligatorio con
 * `otro`, que es justo el caso en que la lista no dice nada util.
 *
 * ── DOS CAPAS, Y LA DE ABAJO ES LA QUE MANDA ───────────────────────────────
 *
 * `exigeNota()` aqui es cortesia de pantalla. El control de verdad es el `CHECK`
 * `crs_otro_exige_nota` de la migracion 18, que rechaza la fila aunque alguien
 * llame al RPC saltandose esta hoja.
 * ════════════════════════════════════════════════════════════════════════════
 */

const COPY = {
  titulo: '¿Por qué no pudiste tomar la foto?',
  cuerpo: 'Tu administrador va a ver el motivo junto al aseo.',
  notaOpcional: 'Cuéntale a tu administrador qué pasó (opcional)',
  notaObligatoria: 'Cuéntale a tu administrador qué pasó',
  accion: 'Saltar',
  enVuelo: 'Guardando…',
} as const;

export function HojaSaltarCuarto({
  aseoId,
  cuartoId,
  onListo,
}: {
  aseoId: string;
  cuartoId: string;
  /** Se llama con el motivo elegido para que el asistente lo pinte y avance. */
  onListo: (motivo: MotivoSkip) => void;
}) {
  const [motivo, setMotivo] = useState<string>('');

  const [estado, accion, enVuelo] = useActionState<ResultadoAccion | null, FormData>(
    async (prev, formData) => {
      const r = await saltarCuarto(prev, formData);
      if (r.ok) onListo(motivo as MotivoSkip);
      return r;
    },
    null,
  );

  const notaObligatoria = motivo !== '' && exigeNota(motivo as MotivoSkip);

  return (
    <form action={accion} className="flex flex-col gap-lg">
      <input type="hidden" name="aseo" value={aseoId} />
      <input type="hidden" name="cuarto" value={cuartoId} />

      <div className="flex flex-col gap-xs">
        <h2 className="text-heading-movil text-foreground">{COPY.titulo}</h2>
        <p className="text-body-movil text-muted-foreground">{COPY.cuerpo}</p>
      </div>

      <RadioGroup
        name="motivo"
        value={motivo}
        onValueChange={setMotivo}
        className="flex flex-col gap-xs"
      >
        {MOTIVOS_SKIP.map((m) => (
          // 44px de area de toque por opcion, no el circulo de 20: el rotulo
          // entero es el destino del toque, igual que en el checklist.
          <Label
            key={m}
            htmlFor={`skip-${m}`}
            className="transicion flex min-h-toque cursor-pointer items-center gap-md rounded-md px-md text-body-movil text-foreground"
          >
            <RadioGroupItem id={`skip-${m}`} value={m} />
            {ETIQUETAS_SKIP[m]}
          </Label>
        ))}
      </RadioGroup>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="nota-skip" className="text-micro-movil text-muted-foreground">
          {notaObligatoria ? COPY.notaObligatoria : COPY.notaOpcional}
        </Label>
        {/*
          16px exactos (`body-movil`): por debajo de eso iOS Safari hace zoom al
          enfocar y descoloca el layout. Es comportamiento del motor.
        */}
        <Textarea id="nota-skip" name="nota" rows={3} className="text-body-movil" />
      </div>

      {estado && !estado.ok && (
        <p role="alert" className="text-micro-movil text-status-warn">
          {estado.error}
        </p>
      )}

      {/*
        `outline` y no un relleno de alarma. Ver la cabecera: esto no es una
        accion peligrosa, es una respuesta honesta.
      */}
      <Button
        type="submit"
        variant="outline"
        disabled={motivo === '' || enVuelo}
        className="min-h-toque-comodo w-full text-body-movil"
      >
        {enVuelo ? COPY.enVuelo : COPY.accion}
      </Button>
    </form>
  );
}
