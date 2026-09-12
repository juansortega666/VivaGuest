'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { toast } from 'sonner';

import { comenzarAseo } from '@/app/(cleaner)/_actions';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { FilaDeAseoDelAseador } from '@/lib/data/aseos-del-aseador';
import type { ResultadoAccion } from '@/lib/domain/acciones';

import { HojaNoPuedo } from './HojaNoPuedo';

/**
 * Las dos opciones al tocar la tarjeta. D-02.
 *
 * ── POR QUE ESTO ES EL SEGUNDO PASO Y NO UN BOTON DENTRO DEL ASEO ───────────
 *
 * Tocar la tarjeta NO entra al aseo. La razon esta escrita en `06-CONTEXT.md` y
 * es de flujo real: **el aseador sabe que no puede ANTES de empezar, no a
 * mitad**. Enterrar "no puedo" dentro del checklist lo obliga a entrar, buscar y
 * salir, y ademas mezcla dos intenciones opuestas en la misma pantalla.
 *
 * ── Y SI EL ASEO YA ESTA EN CURSO ───────────────────────────────────────────
 *
 * La accion principal cambia a `Seguir con el aseo` y **la secundaria
 * desaparece**: ya empezo, y ofrecerle devolverlo seria ofrecerle deshacer
 * trabajo que ya hizo.
 */
export function HojaDeAseo({
  fila,
  abierta,
  onCerrar,
}: {
  fila: FilaDeAseoDelAseador | null;
  abierta: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [mostrandoNoPuedo, setMostrandoNoPuedo] = useState(false);

  const [, accionComenzar, enVuelo] = useActionState<ResultadoAccion | null, FormData>(
    async (prev, formData) => {
      const r = await comenzarAseo(prev, formData);
      if (r.ok && fila) router.push(`/aseos/${fila.id}`);
      else if (!r.ok) toast.error(r.error);
      return r;
    },
    null,
  );

  if (fila === null) return null;

  const enCurso = fila.state === 'en_curso';
  const hhmm = fila.hora_limite.slice(0, 5);

  function cerrar() {
    setMostrandoNoPuedo(false);
    onCerrar();
  }

  return (
    <Sheet open={abierta} onOpenChange={(v) => (v ? null : cerrar())}>
      {/* Sin boton de cerrar: deslizar y tocar fuera ya son dos salidas. */}
      <SheetContent side="bottom" className="max-w-aseador">
        <SheetHeader className="gap-xs">
          <SheetTitle className="text-heading-movil text-foreground">
            {fila.property?.nombre ?? 'Apartamento'}
          </SheetTitle>
          <p className="text-body-movil tabular-nums text-muted-foreground">
            Antes de las {hhmm}
          </p>
        </SheetHeader>

        {mostrandoNoPuedo ? (
          <div className="p-lg pt-0">
            <HojaNoPuedo
              aseoId={fila.id}
              onListo={() => {
                toast.success('Listo. El administrador ya lo sabe.');
                cerrar();
                router.refresh();
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-md p-lg pt-0">
            {/* UNICO relleno primario de la hoja. Nunca dos a la vez. */}
            <form action={accionComenzar}>
              <input type="hidden" name="aseo" value={fila.id} />
              <Button
                type="submit"
                disabled={enVuelo}
                className="min-h-toque-comodo w-full text-body-movil"
              >
                {enCurso ? 'Seguir con el aseo' : 'Comenzar aseo'}
              </Button>
            </form>

            {/* Ya empezo: ofrecer devolverlo seria ofrecer deshacer trabajo. */}
            {!enCurso && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMostrandoNoPuedo(true)}
                className="min-h-toque w-full text-body-movil text-muted-foreground"
              >
                Reportar que no puedo
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
