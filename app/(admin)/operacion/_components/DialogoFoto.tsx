'use client';

import { ImageOff } from 'lucide-react';
import { useState, type ReactElement } from 'react';

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
import type { FotoDelPanel } from '@/lib/data/panel-aseo';
import { formatHoraBog } from '@/lib/domain/dates';

// La etiqueta vive en su propio módulo SIN directiva y no acá: la llama también
// `TiraDeEvidencia`, que es de servidor, y exportarla desde un módulo de cliente
// hace que esa llamada reviente en tiempo de render. La razón entera, con el
// error literal y con por qué nadie lo vio hasta el plan 08-13, está allá.
import { deQueEsLaFoto } from './etiqueta-de-foto';

/**
 * UNA FOTO DE LA EVIDENCIA, EN GRANDE (08-UI-SPEC §10.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SALE DE `DialogoRecibo`, QUE RESUELVE EXACTAMENTE EL MISMO PROBLEMA.
 *
 * Bucket privado, firma corta, y una ausencia que hay que explicar en vez de
 * dejar una imagen rota. Lo único que cambia es la cabecera: allá son concepto,
 * fecha, apartamento y monto; acá son el cuarto (o el concepto del gasto, o la
 * descripción del daño) y la hora.
 *
 * ── LA URL LLEGA FIRMADA, Y NO ES UN DETALLE DE IMPLEMENTACIÓN ────────────
 *
 * `lib/data/panel-aseo.ts` firma EN EL SERVIDOR, después de la guarda de admin,
 * y por eso este componente no conoce ni el bucket ni la ruta: no podría firmar
 * aunque quisiera, no tiene con qué. El mensaje de error del almacenamiento
 * tampoco llega hasta acá, porque arrastra la ruta y el bucket y el helper de
 * firma lo corta en origen (T-08-32).
 *
 * ── SIN AMPLIACIÓN, SIN DESCARGA Y SIN FLECHAS ENTRE FOTOS ───────────────
 *
 * Misma regla que el recibo, y §10.3 la repite literal. Un visor con controles
 * de escala y navegación es una pantalla entera de producto para un gesto de dos
 * segundos, y además convertiría la URL firmada en algo que se guarda.
 *
 * §17.5 declara la mejora como DEUDA, no como alcance: la casilla de conteo
 * podría abrir este mismo diálogo con anterior y siguiente, y son unas veinte
 * líneas. No se hace ahora porque D8-4 cortó el checklist tarea por tarea y
 * recorrer doce fotos de una en una es eso con otro nombre.
 *
 * ── EL DISPARADOR LLEGA COMO PROP, Y ESO SÍ SE APARTA DEL RECIBO ─────────
 *
 * `DialogoRecibo` construye su propio botón `Ver recibo` porque el copy de ese
 * botón es del contrato y repetirlo en sus dos sitios de uso es como acaban
 * diciendo cosas distintas. Acá el disparador **es la miniatura de 64px**, y su
 * geometría entera (tamaño, recorte, borde, separación) es el contrato de §10.3,
 * o sea el contrato de LA TIRA. Construirlo acá partiría esa geometría en dos
 * archivos.
 *
 * Lo que sí se conserva del precedente es lo que importaba: el disparador y su
 * diálogo se montan JUNTOS, así que el sitio de uso no puede olvidarse de
 * asociarlos, que es el defecto que deja dos fotos abriéndose a la vez. Y la
 * primitiva devuelve el foco al disparador al cerrar sin que nadie se acuerde
 * (§12.4).
 *
 * ── UN DIÁLOGO DENTRO DE UN PANEL YA ESTÁ EN PRODUCCIÓN ─────────────────
 *
 * `SheetDesglosePago` monta `DialogoRecibo` dentro de su `Sheet` y funciona. La
 * advertencia de `07-UI-SPEC` §5.3 iba sobre un diálogo dentro de un panel
 * dentro de una página con cuatro bloques con estado propio, que no es este caso.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * El bloque de ausencia cuando la firma vence con el diálogo abierto.
 *
 * La vida de la firma es corta a propósito (300 segundos), así que este caso
 * ocurre de verdad si el admin deja el panel abierto y vuelve a la foto. El copy
 * es el que `07-UI-SPEC` §12.1 ya fijó para el recibo y que §15.2 repite: dice
 * QUÉ pasó y QUÉ hacer, sin disculpas y sin signos de admiración.
 *
 * Alargar la vida de la firma para que no pase sería pagar seguridad por
 * comodidad.
 */
function SinFoto() {
  return (
    <div className="flex flex-col items-center gap-lg rounded-md border border-border py-3xl text-center">
      {/* 32px, y va acompañado del texto de abajo, así que se oculta al lector. */}
      <ImageOff className="size-8 text-muted-foreground" strokeWidth={2} aria-hidden="true" />

      <div className="flex flex-col gap-sm">
        <p className="text-body font-semibold text-foreground">No se pudo mostrar la foto.</p>
        <p className="max-w-vacio text-micro text-muted-foreground">Vuelve a abrirla.</p>
      </div>
    </div>
  );
}

export function DialogoFoto({
  foto,
  url,
  disparador,
}: {
  foto: FotoDelPanel;
  /** La URL ya firmada en el servidor. Ver la cabecera. */
  url: string;
  /** La miniatura de §10.3, construida por la tira. Ver la cabecera. */
  disparador: ReactElement;
}) {
  /**
   * Si la imagen falló al cargar.
   *
   * Se reinicia al ABRIR y no al cerrar, copiado del recibo con su razón: quien
   * vuelve a abrir la foto espera que se intente de nuevo, y esa es justo la
   * acción que el copy le pide. Con el reinicio al cerrar, una salida por
   * `Escape` sin pasar por el botón dejaría el estado pegado y el segundo intento
   * nunca se haría.
   */
  const [fallo, setFallo] = useState(false);

  /**
   * La hora de la foto: la que declaró el teléfono si vino, y si no la de
   * entrada al sistema. No se inventa ninguna: `formatHoraBog` devuelve nulo
   * ante una marca ilegible y entonces la línea de apoyo no se pinta.
   */
  const hora = formatHoraBog(foto.tomadaAt ?? foto.creadaAt);

  return (
    <Dialog
      onOpenChange={(abierto) => {
        if (abierto) setFallo(false);
      }}
    >
      <DialogTrigger render={disparador} />

      <DialogContent className="sm:max-w-dialogo">
        <DialogHeader>
          {/*
            El cuarto, el concepto del gasto o la descripción del daño. Es la
            única seña que permite casar la foto con la línea de la que vino sin
            volver al panel.
          */}
          <DialogTitle>{foto.etiqueta ?? 'Foto del aseo'}</DialogTitle>

          {hora === null ? null : (
            <DialogDescription className="text-micro text-muted-foreground">
              <span className="tabular-nums">{hora}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {fallo ? (
          <SinFoto />
        ) : (
          /*
            Etiqueta nativa y no el componente de imagen de Next, misma razón que
            el recibo: la URL firmada es de un dominio externo con parámetros de
            consulta y vida de cinco minutos. Optimizarla obligaría a declarar el
            host como remoto y dejaría una copia de la evidencia en la caché del
            optimizador, que es exactamente lo que un bucket privado existe para
            que no pase.

            Contención y no cobertura: una foto de evidencia recortada pierde
            justo el borde donde está lo que se vino a comprobar. Mismo criterio
            que el recibo, donde lo que se pierde al recortar es el total.

            El texto alternativo es DESCRIPTIVO y nunca vacío (§13.4): acá la
            imagen va sola, no la envuelve ningún control que ya la nombre.
          */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Foto de ${deQueEsLaFoto(foto)}`}
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
