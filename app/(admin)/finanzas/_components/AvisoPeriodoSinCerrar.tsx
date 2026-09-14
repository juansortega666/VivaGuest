'use client';

import { Loader2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { etiquetaDePeriodoDePago } from '@/lib/domain/mes';

import { cerrarPeriodo } from '../pagos/_actions';

/**
 * `Cerrar el periodo ahora` (07-UI-SPEC §9.5, adición declarada al contrato).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTO NO ESTÁ EN LA DEFINICIÓN, Y SE AÑADE CON UNA RAZÓN CONCRETA.
 *
 * El cierre lo dispara un job agendado a las 23:30 de Bogotá del último día
 * hábil. **Si ese job falla ese día, NADIE COBRA**, no hay pago que mostrar, y
 * el admin no tiene ninguna forma de recuperarse desde la interfaz: tendría que
 * esperar un mes o pedirle a alguien que entre a la base. La puerta de reintento
 * ya existía en el diseño técnico; esto es su superficie.
 *
 * Se declara así de explícito para que el dueño lo pueda quitar de un plumazo.
 *
 * ── NO ES UN BOTÓN PERMANENTE, Y ESA ES LA MITAD DEL DISEÑO ──────────────
 *
 * Aparece **solo** cuando el periodo esperado ya venció y no tiene cierre. En el
 * caso normal esta pieza **no existe en el DOM**: quien la renderiza comprueba
 * antes que `periodo_pendiente_de_cierre()` devolvió una fila.
 *
 * Un botón de «cerrar el mes» siempre visible invita a cerrarlo antes de tiempo,
 * y un periodo cerrado no se vuelve a tocar (D7-3): el error quedaría congelado
 * para siempre y le cambiaría el pago a alguien. La base también lo impide —el
 * rango tiene que ser un periodo real y su día de cierre tiene que haber pasado
 * estrictamente— pero una interfaz que ofrece lo que la base va a rechazar es
 * una interfaz que enseña a ignorar sus propios avisos.
 *
 * ── EL FALLO VA EN EL SITIO DEL PROPIO AVISO, NO EN UN MENSAJE FLOTANTE ──
 *
 * Es la excepción declarada del enrutamiento de errores (§12.3), y la razón es
 * que el mensaje flotante se va solo a los cinco segundos: aquí la acción a
 * tomar (volver a intentar) vive exactamente donde estaba el botón, así que el
 * error tiene que quedarse ahí hasta que alguien haga algo. Un aviso que
 * desaparece dejaría una pantalla idéntica a la de antes de intentarlo.
 *
 * El éxito sí va en mensaje flotante: lo que hay que mirar después es la lista,
 * que acaba de ganar un periodo.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * El pie del diálogo, aparte porque `useFormStatus` lee el `<form>` ANCESTRO.
 *
 * `Cancelar` en contorno y solo el de confirmar relleno: nunca dos rellenos
 * adyacentes. Y el de confirmar NO es destructivo: cerrar un periodo no borra ni
 * revoca nada, es irreversible desde la interfaz, que es otra cosa (§15.3).
 */
function PieDeCerrar() {
  const { pending } = useFormStatus();

  return (
    <AlertDialogFooter>
      <AlertDialogCancel autoFocus disabled={pending}>
        Cancelar
      </AlertDialogCancel>

      <AlertDialogAction type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Cerrando…
          </>
        ) : (
          'Cerrar el periodo'
        )}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

export function AvisoPeriodoSinCerrar({
  desde,
  hasta,
}: {
  /** Días de negocio `'YYYY-MM-DD'`. Viajan a la base tal cual. */
  desde: string;
  hasta: string;
}) {
  // Las DOS fechas reales del periodo, sin el `Del ` inicial, porque aquí la
  // etiqueta va DENTRO de una frase: `El periodo del 1 al 30 de enero de 2026 no
  // se cerró.` (§11.3 y §15.2). Se deriva de `etiquetaDePeriodoDePago` en vez de
  // componerla a mano: ese módulo es el único que sabe cuál de las tres formas
  // toca, y una segunda ruta de formato es como las dos acaban divergiendo justo
  // en el periodo que cruza el año.
  const fechasPeriodo = etiquetaDePeriodoDePago(desde, hasta).replace(/^Del\s+/u, '');

  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  const [estado, accion, enVuelo] = useActionState<ResultadoAccion | null, FormData>(
    cerrarPeriodo,
    null,
  );

  const procesado = useRef<ResultadoAccion | null>(null);

  useEffect(() => {
    if (!estado || estado === procesado.current) return;
    procesado.current = estado;

    if (estado.ok) {
      toast.success(estado.mensaje);
      setAbierto(false);
      // El periodo ya existe: la lista gana un bloque y este aviso desaparece del
      // DOM en el siguiente render del servidor. `router.refresh()`, y la action
      // no pide revalidación de ruta; la razón medida está en `../pagos/_actions.ts`.
      router.refresh();
      return;
    }

    // El fallo NO va a mensaje flotante: se queda abajo, en el sitio del aviso.
    // Lo único que se hace aquí es cerrar el diálogo para que se vea.
    setAbierto(false);
  }, [estado, router]);

  // La razón concreta del fallo, ya traducida, o `null` si no ha fallado nada.
  // Se deriva como valor y no como booleano suelto para que el tipo del
  // resultado sobreviva hasta el render: con un `fallo: boolean` el compilador
  // pierde el estrechamiento y el mensaje habría que sacarlo con una aserción.
  const razonDelFallo = estado !== null && !estado.ok ? estado.error : null;
  const fallo = razonDelFallo !== null;

  return (
    <Alert
      variant={fallo ? 'destructive' : 'default'}
      // La superficie de aviso del sistema mientras no ha fallado nada. Con el
      // fallo manda la variante destructiva de la primitiva y no se pisa el fondo.
      className={fallo ? undefined : 'border-status-warn/30 bg-surface-warn'}
    >
      <TriangleAlert
        className={fallo ? 'size-4' : 'size-4 text-status-warn'}
        strokeWidth={2}
        aria-hidden="true"
      />

      <AlertTitle className="text-body font-semibold">
        {fallo ? 'No se pudo cerrar el periodo.' : `El periodo del ${fechasPeriodo} no se cerró.`}
      </AlertTitle>

      <AlertDescription className="text-micro">
        {razonDelFallo === null ? (
          'El cálculo automático no corrió ese día. Puedes cerrarlo ahora.'
        ) : (
          <>
            <span>
              Vuelve a intentar. Si sigue fallando, el cálculo automático puede reintentarlo
              mañana.
            </span>{' '}
            {/*
              AÑADIDO al copy fijo del contrato: la razón concreta, que el texto
              fijo no puede dar. Ya viene traducida por `mapDbError()`, así que
              nunca es un texto crudo de Postgres. Sin ella, un «no tienes
              permiso» se leería como un fallo pasajero y el admin reintentaría
              toda la tarde contra una puerta cerrada.
            */}
            <span className="opacity-80">{razonDelFallo}</span>
          </>
        )}
      </AlertDescription>

      <AlertAction>
        <AlertDialog
          open={abierto}
          onOpenChange={(siguiente) => {
            setAbierto(siguiente);
            if (!siguiente) procesado.current = null;
          }}
        >
          <AlertDialogTrigger
            render={<Button type="button" variant="outline" size="sm" disabled={enVuelo} />}
          >
            {enVuelo ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Cerrando…
              </>
            ) : (
              'Cerrar el periodo'
            )}
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cerrar el periodo del {fechasPeriodo}?</AlertDialogTitle>
              <AlertDialogDescription>
                Se calcula el pago de cada aseadora del periodo y queda congelado. Después no
                se recalcula, aunque corrijas una tarifa.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <form action={accion}>
              <input type="hidden" name="desde" value={desde} />
              <input type="hidden" name="hasta" value={hasta} />
              <PieDeCerrar />
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </AlertAction>
    </Alert>
  );
}
