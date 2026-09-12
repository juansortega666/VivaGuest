'use client';

import { Camera, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { registrarFotoDeCuarto } from '@/app/(cleaner)/aseos/[id]/_actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { GrupoDeCuarto } from '@/lib/domain/checklist';
import { comprimirFoto, type FotoComprimida } from '@/lib/fotos/comprimir';
import { subirAlBucket } from '@/lib/fotos/subir';

/**
 * UN PASO DEL ASISTENTE: LA FOTO DE UN CUARTO (CHECK-03, CHECK-04, §8.3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA CAMARA ES LA DEL TELEFONO, Y NO SE EMBEBE NINGUNA PROPIA.
 *
 * El `input` de archivo con el atributo de captura trasera abre la camara nativa
 * del telefono. Una
 * camara propia dentro de la aplicacion tendria que reimplementar enfoque,
 * exposicion, estabilizacion y el gesto de disparo, y perderia lo mas
 * importante: **la persona ya sabe usar la suya**. Una aseadora de pie frente a
 * un bano no tiene por que aprender una camara nueva para entregar una foto.
 *
 * ── EL ORDEN DE LA CADENA, Y EL ORDEN IMPORTA ──────────────────────────────
 *
 *   1. la camara nativa devuelve el archivo
 *   2. se reduce el peso EN EL TELEFONO  <-- antes del paso 3, a proposito
 *   3. se pide la ruta y el permiso de subida al servidor
 *   4. se sube a esa ruta, y solo a esa
 *   5. se registra la fila y, si el cuarto estaba saltado, se le quita la marca
 *
 * **El paso 2 va ANTES del 3.** Al reves, un archivo que se resista a bajar de
 * peso deja una URL firmada emitida y una ruta reservada que nadie va a llenar:
 * basura en el bucket y un permiso vivo sin destinatario. Cuesta nada ponerlo en
 * este orden y no hay ninguna razon para el contrario.
 *
 * **La ruta la decide el servidor.** El cliente manda el aseo y el tipo; no
 * propone nombre de archivo. En un bucket privado el nombre ES una
 * autorizacion: quien lo elige puede escribir encima de la evidencia de otro
 * aseo. Ya cerrado en el plan 06-04; aqui solo se consume.
 *
 * ── LO QUE PASA MIENTRAS SUBE, Y POR QUE ───────────────────────────────────
 *
 * **La foto se queda en pantalla.** Nunca una pantalla en blanco con un
 * girador: la aseadora tiene que SEGUIR VIENDO su foto mientras espera, o no
 * sabe si se perdio, y el desenlace de esa duda es volver a fotografiar el mismo
 * bano.
 *
 * Y el trabajo de reducir el peso **es invisible**: no hay ningun indicador de
 * esa etapa (§8.3). Es trabajo del sistema y no informacion util para quien esta
 * de pie frente a una puerta. Lo unico que se muestra es la foto y el avance de
 * la subida.
 *
 * ── SI FALLA, LA FOTO NO SE PIERDE ─────────────────────────────────────────
 *
 * El aviso va DEBAJO de la foto, que sigue ahi, con `Reintentar`. Volver a
 * fotografiar un bano que ya se fotografio, por un corte de senal, es la clase
 * de perdida que hace que alguien deje de usar la herramienta.
 *
 * **Es el unico rojo de este plan**, y esta autorizado porque es un fallo del
 * SISTEMA (§4.2). Saltar un cuarto no lo es, y por eso aquella hoja va en ambar.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Fase = 'sin_foto' | 'preparando' | 'subiendo' | 'subida' | 'fallo';

const COPY = {
  instruccion: 'Toma una foto de cómo quedó.',
  tomar: 'Tomar foto',
  repetir: 'Repetir',
  subiendo: 'Subiendo…',
  falloTitulo: 'No se pudo subir la foto.',
  falloCuerpo: 'Revisa la señal y vuelve a intentar.',
  reintentar: 'Reintentar',
} as const;

export interface FotoLista {
  /** La tarea a la que quedo colgada la foto. */
  itemId: string;
  ruta: string;
}

export function PasoDeFoto({
  aseoId,
  cuarto,
  onSubida,
  onSaltar,
  etiquetaSiguiente,
  onSiguiente,
}: {
  aseoId: string;
  cuarto: GrupoDeCuarto;
  onSubida: (foto: FotoLista) => void;
  onSaltar: () => void;
  /** `Siguiente` en los pasos intermedios, `Continuar` en el ultimo. */
  etiquetaSiguiente: string;
  onSiguiente: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [fase, setFase] = useState<Fase>('sin_foto');
  const [vista, setVista] = useState<string | null>(null);
  const [comprimida, setComprimida] = useState<FotoComprimida | null>(null);

  /**
   * LA TAREA A LA QUE SE LE CUELGA LA FOTO.
   *
   * El esquema guarda `requiere_foto` por TAREA, pero D-05 recoge la evidencia
   * por CUARTO: una foto del bano, no una por cada cosa hecha en el bano. Se
   * elige la primera tarea del cuarto que exige foto, que es la que hace que
   * `aseo_sin_evidencia_completa()` deje de marcar el aseo.
   */
  const tarea = cuarto.tareas.find((t) => t.requiere_foto) ?? cuarto.tareas[0] ?? null;

  // La URL de objeto se libera al cambiar de foto o al desmontar: sin esto, el
  // navegador retiene el blob de cada foto del aseo hasta recargar la pagina.
  useEffect(() => {
    return () => {
      if (vista !== null) URL.revokeObjectURL(vista);
    };
  }, [vista]);

  /**
   * Va ANTES de `subirYRegistrar` en el archivo, aunque lo llame.
   *
   * El orden de lectura espeja el orden de la cadena: primero se reduce el peso
   * en el telefono, DESPUES se pide la ruta. Leerlo al reves invita a
   * reordenarlo al reves, que es el defecto que deja rutas reservadas sin
   * llenar. Es una declaracion de funcion, asi que se puede llamar a la
   * constante de abajo: cuando esto se ejecuta, ya existe.
   */
  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setFase('preparando');

    let foto: FotoComprimida;
    try {
      // ── 2. EN EL TELEFONO, ANTES DE PEDIR NINGUNA RUTA ───────────────────
      foto = await comprimirFoto(archivo);
    } catch {
      setFase('fallo');
      return;
    }

    setComprimida(foto);
    setVista((anterior) => {
      if (anterior !== null) URL.revokeObjectURL(anterior);
      return URL.createObjectURL(foto.blob);
    });

    await subirYRegistrar(foto);
  }

  const subirYRegistrar = useCallback(
    async (foto: FotoComprimida) => {
      if (tarea === null) return;
      setFase('subiendo');

      // ── 3 y 4. El permiso con la ruta del servidor, y la subida a ESA ruta.
      // Los dos pasos viven en `lib/fotos/subir.ts` porque la pantalla del
      // reporte hace exactamente lo mismo, y dos copias de este cableado son dos
      // sitios donde alguien puede mandar la ruta desde el cliente.
      const subida = await subirAlBucket(aseoId, 'checklist', foto);
      if (!subida.ok) {
        setFase('fallo');
        return;
      }

      // ── 5. La fila, y el borrado de la marca de saltado si la habia ───────
      const registro = new FormData();
      registro.set('aseo', aseoId);
      registro.set('item', tarea.id);
      registro.set('cuarto', cuarto.propertyRoomId);
      registro.set('ruta', subida.ruta);
      registro.set('bytes', String(foto.bytes));
      registro.set('ancho', String(foto.width));
      registro.set('alto', String(foto.height));

      const r = await registrarFotoDeCuarto(null, registro);
      if (!r.ok) {
        setFase('fallo');
        return;
      }

      setFase('subida');
      onSubida({ itemId: tarea.id, ruta: subida.ruta });
    },
    [aseoId, cuarto.propertyRoomId, onSubida, tarea],
  );

  function repetir() {
    setFase('sin_foto');
    setComprimida(null);
    setVista((anterior) => {
      if (anterior !== null) URL.revokeObjectURL(anterior);
      return null;
    });
    // Se limpia el valor o elegir el MISMO archivo no dispararia `change`.
    if (inputRef.current) inputRef.current.value = '';
    inputRef.current?.click();
  }

  const trabajando = fase === 'preparando' || fase === 'subiendo';

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-xs">
        <h2 className="text-display-movil text-foreground">{cuarto.etiqueta}</h2>
        <p className="text-body-movil text-muted-foreground">{COPY.instruccion}</p>
      </div>

      {/*
        El `input` real esta oculto a la vista pero NO al arbol de
        accesibilidad: el `label` de abajo es su disparador, igual que en la
        fila del checklist.
      */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={alElegirArchivo}
        className="sr-only"
      />

      {vista === null ? (
        <label
          htmlFor={inputId}
          className="transicion mx-auto flex min-h-toque-comodo w-full max-w-foto cursor-pointer items-center justify-center gap-md rounded-md border-2 border-dashed border-border bg-background py-2xl text-body-movil text-foreground"
        >
          <Camera size={20} strokeWidth={2} aria-hidden="true" />
          {COPY.tomar}
        </label>
      ) : (
        <div className="mx-auto flex w-full max-w-foto flex-col gap-sm">
          <div className="relative">
            {/*
              `img` y no el componente de imagen del framework: la fuente es una
              URL de objeto de un blob local, que el optimizador no puede tocar.
              `width` y `height` explicitos porque sin ellos hay salto de layout,
              y el movimiento de layout esta prohibido en este arbol (§12.3).
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vista}
              alt={`Foto de ${cuarto.etiqueta}`}
              width={comprimida?.width ?? 320}
              height={comprimida?.height ?? 240}
              className="w-full rounded-md object-cover"
            />

            {/*
              LA BARRA VA ENCIMA DE LA FOTO, no en su lugar. Es la diferencia
              entre esperar viendo tu trabajo y esperar mirando un rectangulo
              gris preguntandote si se perdio.

              Indeterminada a proposito: el SDK de Storage sube con `fetch` y no
              expone bytes enviados. Rehacerlo con XHR contra el endpoint firmado
              obligaria a recomponer a mano la URL que el SDK construye, y el dia
              que cambie fallaria en silencio. Una barra que dice "esto sigue
              vivo" cumple lo que la aseadora necesita saber.
            */}
            {trabajando && (
              <div className="absolute inset-x-0 bottom-0 p-sm">
                <Progress value={null} aria-label="Subiendo la foto" className="flex" />
              </div>
            )}
          </div>

          {fase === 'fallo' && (
            <Alert variant="destructive">
              <TriangleAlert size={20} strokeWidth={2} aria-hidden="true" />
              <AlertTitle className="text-body-movil">{COPY.falloTitulo}</AlertTitle>
              <AlertDescription className="text-micro-movil">
                {COPY.falloCuerpo}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-sm">
            {fase === 'fallo' && comprimida !== null && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void subirYRegistrar(comprimida)}
                className="min-h-toque w-full text-body-movil"
              >
                {COPY.reintentar}
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              onClick={repetir}
              className="min-h-toque w-full text-body-movil"
            >
              {COPY.repetir}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-sm">
        <Button
          type="button"
          onClick={onSiguiente}
          disabled={fase !== 'subida'}
          className="min-h-toque-comodo w-full text-body-movil"
        >
          {trabajando ? COPY.subiendo : etiquetaSiguiente}
        </Button>

        {/*
          LA SALIDA CUANDO NO HAY FOTO ES EXPLICITA Y DEJA RASTRO (§8.4). No es
          un atajo: abre la hoja de motivo obligatorio. `ghost` y 44px, por
          debajo de la primaria, porque es la salida y no el camino.
        */}
        <Button
          type="button"
          variant="ghost"
          onClick={onSaltar}
          className="min-h-toque w-full text-body-movil"
        >
          Saltar este cuarto
        </Button>
      </div>
    </div>
  );
}
