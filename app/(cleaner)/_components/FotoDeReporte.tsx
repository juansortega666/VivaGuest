'use client';

import { Camera } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { comprimirFoto } from '@/lib/fotos/comprimir';
import { subirAlBucket } from '@/lib/fotos/subir';

/**
 * LA FOTO DE UN DAÑO O DE UN RECIBO (§9).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MISMA CADENA QUE LA DEL CUARTO, Y LOS DOS PASOS DEL MEDIO SON EL MISMO CODIGO.
 *
 * `lib/fotos/subir.ts` los comparte a proposito: es el tramo donde el cliente NO
 * propone la ruta, y dos copias serian dos sitios donde alguien puede
 * "simplificar" mandandola desde el navegador.
 *
 * Lo que si es propio de aqui es de QUE cuelga la foto: de un daño o de un
 * gasto, nunca de una tarea. La union de `VinculoDeFoto` impide que quede
 * colgada de dos a la vez.
 *
 * ── ESTO NO BLOQUEA TERMINAR, Y ES DELIBERADO ──────────────────────────────
 *
 * El contrato dice que la foto del daño es obligatoria, y lo es en el sentido
 * que importa: se pide siempre, y mientras no llegue el reporte queda marcado en
 * ambar. Lo que NO hace es atrapar a la aseadora: un daño sin foto es un daño
 * peor documentado, y un aseo que no se puede cerrar es una llamada telefonica.
 * Es el mismo criterio con el que D-06 saco el bloqueo de `finish_cleaning`.
 * ════════════════════════════════════════════════════════════════════════════
 */

const COPY = {
  tituloDano: 'Toma una foto del daño.',
  tituloGasto: 'Toma una foto del recibo.',
  tomar: 'Tomar foto',
  repetir: 'Repetir',
  subiendo: 'Subiendo…',
  falloTitulo: 'No se pudo subir la foto.',
  falloCuerpo: 'Revisa la señal y vuelve a intentar.',
  omitir: 'Seguir sin la foto',
} as const;

export function FotoDeReporte({
  aseoId,
  tipo,
  onSubida,
  onOmitir,
}: {
  aseoId: string;
  /**
   * De que cuelga la foto, y basta con el TIPO.
   *
   * El identificador concreto no entra aqui: lo pone el llamador al registrar.
   * Asi este componente no puede equivocarse de destino, porque no lo conoce.
   */
  tipo: 'dano' | 'gasto';
  /** Registra la fila. Devuelve `false` si el registro fallo. */
  onSubida: (datos: {
    ruta: string;
    bytes: number;
    width: number;
    height: number;
  }) => Promise<boolean>;
  onOmitir: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [vista, setVista] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState(false);

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setTrabajando(true);
    setFallo(false);

    try {
      // Se reduce el peso EN EL TELEFONO antes de pedir ninguna ruta: al reves,
      // un archivo que se resista deja una URL firmada sin usar.
      const foto = await comprimirFoto(archivo);

      setVista((anterior) => {
        if (anterior !== null) URL.revokeObjectURL(anterior);
        return URL.createObjectURL(foto.blob);
      });

      const subida = await subirAlBucket(aseoId, tipo, foto);
      if (!subida.ok) {
        setFallo(true);
        return;
      }

      const registrada = await onSubida({
        ruta: subida.ruta,
        bytes: foto.bytes,
        width: foto.width,
        height: foto.height,
      });
      if (!registrada) setFallo(true);
    } catch {
      setFallo(true);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <section className="flex flex-col gap-md rounded-md border border-border p-lg">
      <h2 className="text-heading-movil text-foreground">
        {tipo === 'dano' ? COPY.tituloDano : COPY.tituloGasto}
      </h2>

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
          className="transicion flex min-h-toque-comodo w-full cursor-pointer items-center justify-center gap-md rounded-md border-2 border-dashed border-border py-xl text-body-movil text-foreground"
        >
          <Camera size={20} strokeWidth={2} aria-hidden="true" />
          {COPY.tomar}
        </label>
      ) : (
        <div className="relative">
          {/* La foto se queda visible mientras sube. Ver `PasoDeFoto.tsx`. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={vista}
            alt={tipo === 'dano' ? 'Foto del daño' : 'Foto del recibo'}
            width={320}
            height={240}
            className="w-full rounded-md object-cover"
          />
          {trabajando && (
            <div className="absolute inset-x-0 bottom-0 p-sm">
              <Progress value={null} aria-label="Subiendo la foto" className="flex" />
            </div>
          )}
        </div>
      )}

      {fallo && (
        <Alert variant="destructive">
          <AlertTitle className="text-body-movil">{COPY.falloTitulo}</AlertTitle>
          <AlertDescription className="text-micro-movil">{COPY.falloCuerpo}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-sm">
        {vista !== null && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = '';
              inputRef.current?.click();
            }}
            className="min-h-toque w-full text-body-movil"
          >
            {trabajando ? COPY.subiendo : COPY.repetir}
          </Button>
        )}

        {/*
          La salida existe y se llama por su nombre. No es un atajo escondido:
          es la diferencia entre "obligatoria" y "atrapa a la persona".
        */}
        <Button
          type="button"
          variant="ghost"
          onClick={onOmitir}
          className="min-h-toque w-full text-body-movil"
        >
          {COPY.omitir}
        </Button>
      </div>
    </section>
  );
}
