'use client';

import { ImageOff, Receipt } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatFechaBog } from '@/lib/domain/dates';
import { formatCOP } from '@/lib/domain/money';

/**
 * El recibo de un gasto (07-UI-SPEC §9.4 y §12.1).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE VIVE EN ESTE PLAN AUNQUE EL RESUMEN NO LO USE.
 *
 * Lo consumen la ficha de aseadora y el desglose de un pago, que se construyen
 * EN PARALELO en la wave siguiente. Si cada uno lo escribiera, habria dos
 * dialogos de recibo con dos copys distintos para la misma foto, y el admin
 * aprenderia dos veces el mismo objeto. Es la misma razon por la que el circulo
 * de iniciales se extrajo aqui.
 *
 * Por eso la interfaz de props tiene que servir a los dos desde el primer dia:
 * concepto, fecha, apartamento, monto y la URL ya firmada.
 *
 * ── LA URL LLEGA FIRMADA, Y ESO NO ES UN DETALLE DE IMPLEMENTACION ────────
 *
 * El bucket es privado y la ruta del archivo es, por si sola, una autorizacion.
 * `lib/data/recibos.ts` firma EN EL SERVIDOR, despues del guard de admin. Este
 * componente no conoce ni el bucket ni la ruta, y no podria firmar aunque
 * quisiera: no tiene con que.
 *
 * ── SIN AMPLIACION, SIN GALERIA Y SIN DESCARGA ───────────────────────────
 *
 * Es un recibo de doscientos kilobytes que se mira una vez para comprobar que el
 * monto coincide. Un visor con zoom y navegacion entre fotos es una pantalla
 * entera de producto para un gesto de dos segundos, y ademas convertiria la URL
 * firmada en algo que se guarda.
 *
 * ── LOS DOS ESTADOS DE AUSENCIA SON INFORMACION, NO FALLOS ───────────────
 *
 *   1. **El recibo ya no existe.** La foto se purgo por antiguedad. El gasto y
 *      su monto siguen registrados y eso se dice con todas sus letras: una
 *      ausencia explicada es informacion, una ausencia silenciosa es un defecto
 *      percibido. NO se pinta un enlace muerto ni una imagen rota.
 *   2. **La firma vencio con el dialogo abierto.** La vida de la firma es corta
 *      a proposito, asi que este caso ocurre de verdad si el admin deja el
 *      dialogo abierto. El manejador de error de la imagen sustituye la foto por
 *      el segundo copy, que pide volver a abrir el recibo. Alargar la vida de la
 *      firma para que no pase seria pagar seguridad por comodidad.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Lo que el dialogo necesita saber del gasto. Sirve a sus dos consumidores. */
export type GastoDelRecibo = {
  concepto: string;
  /** Dia de negocio `'YYYY-MM-DD'`. */
  fecha: string;
  apartamento: string;
  /** Pesos enteros. */
  monto: number;
  /**
   * La URL ya firmada, o `null` cuando la foto ya no existe.
   *
   * Es `null` y no cadena vacia a proposito: la diferencia entre "no hay" y
   * "hay, y es la cadena vacia" se pierde en una comprobacion de veracidad, y
   * aqui decide cual de los dos estados de ausencia se pinta.
   */
  urlFirmada: string | null;
};

/**
 * El bloque de ausencia, con el copy exacto del contrato.
 *
 * Uno solo para los dos casos, con el texto por parametro: dos bloques con el
 * mismo icono y la misma geometria se desincronizan en el primer retoque, que es
 * la misma razon por la que el contrato prohibe un segundo estado vacio.
 */
function SinRecibo({ encabezado, cuerpo }: { encabezado: string; cuerpo: string }) {
  return (
    <div className="flex flex-col items-center gap-lg rounded-md border border-border py-3xl text-center">
      <ImageOff className="size-8 text-muted-foreground" strokeWidth={2} aria-hidden="true" />

      <div className="flex flex-col gap-sm">
        <p className="text-body font-semibold text-foreground">{encabezado}</p>
        <p className="max-w-vacio text-micro text-muted-foreground">{cuerpo}</p>
      </div>
    </div>
  );
}

export function DialogoRecibo({ gasto }: { gasto: GastoDelRecibo }) {
  /**
   * Si la imagen fallo al cargar. Es el caso 2 de la cabecera.
   *
   * Se reinicia al ABRIR y no al cerrar: quien vuelve a abrir el recibo espera
   * que se intente de nuevo, y esa es justo la accion que el copy le pide. Con
   * el reinicio al cerrar, un cierre por `Escape` sin pasar por el boton dejaria
   * el estado pegado y el segundo intento nunca se haria.
   */
  const [fallo, setFallo] = useState(false);

  return (
    <Dialog
      onOpenChange={(abierto) => {
        if (abierto) setFallo(false);
      }}
    >
      {/*
        El disparador es parte del componente y no del sitio de uso. El copy
        `Ver recibo` esta en el contrato, y repetirlo en la ficha y en el
        desglose es como acaban diciendo cosas distintas. Ademas asi el sitio de
        uso no puede olvidarse de asociar el disparador con SU dialogo, que es el
        defecto que deja dos recibos abriendose a la vez.

        `ghost` y no relleno: §4.5 fija un solo relleno primario por pantalla, y
        en la ficha ese lugar ya no esta libre. Aqui no aplica el piso de toque:
        es (admin), escritorio y tablet apaisada.
      */}
      <DialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm">
            <Receipt className="size-4" strokeWidth={2} aria-hidden="true" />
            Ver recibo
          </Button>
        }
      />

      <DialogContent className="sm:max-w-dialogo">
        <DialogHeader>
          <DialogTitle>{gasto.concepto}</DialogTitle>
          {/*
            Las tres senas del gasto en una linea: con la fecha y el apartamento
            delante, el admin puede casar el papel con la fila de la que vino sin
            volver a la tabla.
          */}
          <DialogDescription className="text-micro text-muted-foreground">
            {formatFechaBog(gasto.fecha)} · {gasto.apartamento} ·{' '}
            <span className="tabular-nums">{formatCOP(gasto.monto)}</span>
          </DialogDescription>
        </DialogHeader>

        {gasto.urlFirmada === null ? (
          <SinRecibo
            encabezado="Este recibo ya no está disponible."
            cuerpo="El gasto y su monto siguen registrados."
          />
        ) : fallo ? (
          <SinRecibo
            encabezado="No se pudo mostrar el recibo."
            cuerpo="Vuelve a abrir el recibo."
          />
        ) : (
          /*
            Etiqueta nativa y no el componente de imagen de Next: la URL firmada
            es de un dominio externo con parametros de consulta y vida de cinco
            minutos. Optimizarla obligaria a declarar el host como remoto y
            pondria una copia del recibo en la cache del optimizador, que es
            exactamente lo que un bucket privado existe para que no pase.

            `object-contain` y no `cover`: un recibo recortado pierde el total,
            que es lo unico que se viene a mirar.
          */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gasto.urlFirmada}
            alt={`Recibo de ${gasto.concepto}`}
            onError={() => setFallo(true)}
            className="max-h-recibo-alto w-full rounded-md border border-border object-contain"
          />
        )}

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" autoFocus>
                Cerrar
              </Button>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
