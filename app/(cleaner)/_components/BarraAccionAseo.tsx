'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { comenzarAseo } from '@/app/(cleaner)/_actions';
import { terminarAseo } from '@/app/(cleaner)/aseos/[id]/_actions';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { useEstadoDelAseo } from './ChecklistPorCuarto';

/**
 * LA BARRA FIJA DE ACCION (D-04, 06-UI-SPEC §7.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE VA FIJA ABAJO Y NO AL FINAL DEL CONTENIDO.
 *
 * Es D-04, y la razon es postural: la aseadora oprime esto **de pie, con una
 * mano, con la otra ocupada**. Un boton al final de una lista de doce tareas la
 * obliga a hacer scroll hasta abajo para terminar, y a hacerlo otra vez cada
 * vez que sube a revisar algo. Fijo abajo esta siempre a un pulgar.
 *
 * El contenido de la pagina RESERVA este alto como relleno inferior. Sin eso, la
 * ultima tarea del checklist queda debajo de la barra y literalmente nadie la ve.
 *
 * ── EL BOTON NUNCA SE APAGA, Y ESO ES EL CONTRATO ──────────────────────────
 *
 * Ni con el checklist a medias. Si faltan tareas, al tocarlo sale la pregunta de
 * §8.1 con cuantas faltan y dos salidas claras. La regla, literal del contrato:
 * **un boton muerto no explica nada; una pregunta si.** Un control apagado deja
 * a la aseadora mirando la pantalla sin saber si le falta algo, si la app esta
 * rota o si no tiene senal, y el desenlace de las tres es la misma llamada
 * telefonica que este producto existe para eliminar.
 *
 * Es el mismo criterio de D-06, que saco el rechazo por checklist incompleto de
 * `finish_cleaning`: **no se bloquea, se marca.**
 *
 * Los toques repetidos mientras el servidor responde se ignoran en el manejador
 * y el rotulo pasa a decir que esta trabajando. Se resuelve asi, y no apagando
 * el control, precisamente por lo de arriba.
 *
 * ── EL AREA SEGURA DEL TELEFONO NO ES UN DETALLE COSMETICO ─────────────────
 *
 * `safe-area-inset-bottom` va como relleno inferior ADICIONAL. En un iPhone con
 * barra de gestos, un boton pegado al borde inferior comparte pixeles con el
 * gesto de cambiar de app: el toque no termina el aseo, saca de la aplicacion.
 *
 * Y para que ese valor no sea siempre cero hace falta `viewport-fit=cover`, que
 * se declara en el layout de este arbol. Sin eso, esta clase compila, no falla y
 * no hace nada: el defecto solo se ve en un telefono con muesca.
 *
 * ── LA COSTURA CON EL ASISTENTE DE EVIDENCIA ───────────────────────────────
 *
 * En el plan 06-08, `confirmar()` deja de llamar a la accion de terminar y pasa
 * a abrir el asistente de fotos, que es quien termina el aseo al final del
 * ultimo paso (§8). Lo que NO cambia en ese plan es nada de lo de arriba: ni la
 * pregunta de §8.1, ni que el boton siga sin apagarse.
 * ════════════════════════════════════════════════════════════════════════════
 */

const ROTULO_TERMINAR = 'Terminar aseo';
const ROTULO_COMENZAR = 'Comenzar aseo';
const ROTULO_EN_VUELO = 'Un momento…';

const CONFIRMA_PRIMARIA = 'Terminar de todos modos';
const CONFIRMA_SECUNDARIA = 'Volver al checklist';
const CONFIRMA_CUERPO =
  'Puedes terminar igual, pero el administrador va a ver cuáles quedaron pendientes.';

export function BarraAccionAseo({
  aseoId,
  modo,
}: {
  aseoId: string;
  /** `comenzar` con el aseo pendiente, `terminar` con el aseo en curso. */
  modo: 'comenzar' | 'terminar';
}) {
  const router = useRouter();
  const { progreso } = useEstadoDelAseo();
  const [preguntando, setPreguntando] = useState(false);
  const [enVuelo, empezar] = useTransition();

  const faltan = progreso.total - progreso.hechas;

  function ejecutar(accion: 'comenzar' | 'terminar') {
    // Los toques repetidos se descartan aqui. Ver la cabecera: el control no se
    // apaga, asi que la reentrada se corta en el manejador.
    if (enVuelo) return;

    empezar(async () => {
      const cuerpo = new FormData();
      cuerpo.set('aseo', aseoId);

      const r =
        accion === 'comenzar'
          ? await comenzarAseo(null, cuerpo)
          : await terminarAseo(null, cuerpo);

      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      setPreguntando(false);

      if (accion === 'terminar') {
        toast.success(r.mensaje);
        router.push('/mis-aseos');
        return;
      }

      // `revalidatePath` esta prohibido en este arbol: cuelga el navegador
      // (medido en el plan 04-14). El refresco lo pide el cliente.
      router.refresh();
    });
  }

  function alTocar() {
    if (modo === 'comenzar') {
      ejecutar('comenzar');
      return;
    }
    if (faltan > 0) {
      setPreguntando(true);
      return;
    }
    ejecutar('terminar');
  }

  const rotulo = enVuelo
    ? ROTULO_EN_VUELO
    : modo === 'comenzar'
      ? ROTULO_COMENZAR
      : ROTULO_TERMINAR;

  return (
    <>
      <div
        className={[
          // `fixed` al fondo y a ancho completo. Los 72px son los 56 del boton
          // mas 8 de aire arriba y abajo.
          'fixed inset-x-0 bottom-0 z-20 flex min-h-barra-aseo items-center',
          'border-t border-border bg-background px-lg pt-sm',
          // El relleno del area segura, SUMADO al propio. Va con `pt-sm` y no con
          // el atajo de los dos lados: sin `cn()` de por medio las dos clases se
          // emiten juntas y el resultado dependeria del orden del CSS.
          'pb-[calc(var(--spacing-sm)+env(safe-area-inset-bottom))]',
        ].join(' ')}
      >
        <div className="mx-auto w-full max-w-aseador">
          <Button
            type="button"
            onClick={alTocar}
            className="min-h-toque-comodo w-full text-body-movil"
          >
            {rotulo}
          </Button>
        </div>
      </div>

      {/*
        LA PREGUNTA DE §8.1. No bloquea: informa y deja las dos salidas abiertas.
        El numero es el de verdad, sale del mismo contexto que la cabecera del
        checklist, asi que no puede discrepar de lo que ella esta viendo.
      */}
      <Sheet open={preguntando} onOpenChange={(v) => (v ? null : setPreguntando(false))}>
        <SheetContent side="bottom" className="max-w-aseador">
          <SheetHeader className="gap-xs">
            <SheetTitle className="text-heading-movil text-foreground">
              Te faltan {faltan} {faltan === 1 ? 'tarea' : 'tareas'} por marcar.
            </SheetTitle>
            <p className="text-body-movil text-muted-foreground">{CONFIRMA_CUERPO}</p>
          </SheetHeader>

          <div className="flex flex-col gap-sm p-lg pt-0">
            <Button
              type="button"
              onClick={() => ejecutar('terminar')}
              className="min-h-toque-comodo w-full text-body-movil"
            >
              {enVuelo ? ROTULO_EN_VUELO : CONFIRMA_PRIMARIA}
            </Button>

            {/*
              `ghost` de 44px, y el orden importa: la salida que devuelve al
              trabajo va DEBAJO de la que termina, porque la aseadora que abrio
              esta hoja ya decidio terminar. La secundaria esta para quien se
              arrepiente, no para dirigir.
            */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPreguntando(false)}
              className="min-h-toque w-full text-body-movil"
            >
              {CONFIRMA_SECUNDARIA}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
