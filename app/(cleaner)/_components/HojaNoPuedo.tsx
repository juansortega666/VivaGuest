'use client';

import { useActionState, useState } from 'react';

import { devolverAseo } from '@/app/(cleaner)/_actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { ETIQUETAS_NO_PUEDO, MOTIVOS_NO_PUEDO, exigeNota } from '@/lib/domain/motivos';

/**
 * Reportar que no se puede hacer el aseo. PWA-05.
 *
 * ── CERO ROJO, Y NO ES UN DETALLE DE COLOR ──────────────────────────────────
 *
 * Devolver un aseo NO es destructivo: el aseo vuelve a la bandeja del admin y se
 * reasigna. Es lo contrario de destruir trabajo, es evitar que se pierda. Por
 * eso la accion va en `outline` y no en `destructive`, y por eso NO hay
 * `AlertDialog`: la hoja con motivo obligatorio YA es la confirmacion, y meter
 * un dialogo encima seria un tercer paso para alguien que ya dijo dos veces que
 * no puede.
 */
export function HojaNoPuedo({
  aseoId,
  onListo,
}: {
  aseoId: string;
  onListo: () => void;
}) {
  const [motivo, setMotivo] = useState<string>('');
  const [estado, accion, enVuelo] = useActionState<ResultadoAccion | null, FormData>(
    async (prev, formData) => {
      const r = await devolverAseo(prev, formData);
      if (r.ok) onListo();
      return r;
    },
    null,
  );

  const notaObligatoria = motivo !== '' && exigeNota(motivo as never);

  return (
    <form action={accion} className="flex flex-col gap-lg">
      <input type="hidden" name="aseo" value={aseoId} />

      <div className="flex flex-col gap-xs">
        <h2 className="text-heading-movil text-foreground">¿Qué pasó?</h2>
        <p className="text-body-movil text-muted-foreground">
          El aseo vuelve a tu administrador para que lo reasigne.
        </p>
      </div>

      <RadioGroup
        name="motivo"
        value={motivo}
        onValueChange={setMotivo}
        className="flex flex-col gap-xs"
      >
        {MOTIVOS_NO_PUEDO.map((m) => (
          // 44px de area de toque por opcion, no el circulo de 20.
          <Label
            key={m}
            htmlFor={`no-puedo-${m}`}
            className="transicion flex min-h-toque cursor-pointer items-center gap-md rounded-md px-md text-body-movil text-foreground"
          >
            <RadioGroupItem id={`no-puedo-${m}`} value={m} />
            {ETIQUETAS_NO_PUEDO[m]}
          </Label>
        ))}
      </RadioGroup>

      <div className="flex flex-col gap-xs">
        <Label htmlFor="nota-no-puedo" className="text-micro-movil text-muted-foreground">
          {notaObligatoria ? 'Cuéntale al administrador qué pasó' : 'Cuéntale al administrador qué pasó (opcional)'}
        </Label>
        <Textarea
          id="nota-no-puedo"
          name="nota"
          rows={3}
          // 16px exactos: por debajo, iOS Safari hace zoom al enfocar y
          // descoloca el layout. Es comportamiento del motor, no preferencia.
          className="text-body-movil"
        />
      </div>

      {estado && !estado.ok && (
        <p role="alert" className="text-micro-movil text-status-warn">
          {estado.error}
        </p>
      )}

      <Button
        type="submit"
        variant="outline"
        disabled={motivo === '' || enVuelo}
        className="min-h-toque-comodo w-full text-body-movil"
      >
        {enVuelo ? 'Enviando…' : 'Devolver el aseo'}
      </Button>
    </form>
  );
}
