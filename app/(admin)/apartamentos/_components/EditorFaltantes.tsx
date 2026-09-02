'use client';

import { Plus, X } from 'lucide-react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FieldDescription, FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { FormularioInput } from '@/lib/domain/cuartos.schema';

/**
 * Sección 5 del formulario, mitad de los faltantes (APTO-07, UI-SPEC §8.1).
 *
 * ── SOLO LOS FALTANTES PROPIOS DEL APARTAMENTO ──────────────────────────────
 * `missing_item_catalog` guarda dos cosas en la misma tabla, distinguidas por
 * `property_id`: los GLOBALES (`property_id is null`), que son la biblioteca
 * común a todos los apartamentos, y los PROPIOS de un apartamento. Esta pantalla
 * edita solo los segundos. Los globales tienen su propio índice parcial
 * (`mic_global_uniq`) y su propia superficie de administración; tocarlos desde
 * el formulario de UN apartamento cambiaría la lista de los otros 38 sin que
 * nadie lo pidiera.
 *
 * Lo que el aseador ve al reportar es la UNION de los globales activos y los del
 * apartamento, y de ahí sale el helper de 12px: sin él, el admin no tiene forma
 * de saber que esta lista se suma a otra y acabaría re-escribiendo `Toallas` en
 * los 39 apartamentos.
 *
 * `field.id` como clave y no el índice, por la misma razón medida que en
 * `EditorCuartos`: ver su cabecera.
 */

/** El id del input de la fila `indice`. Ver la nota de `idDeFilaCuarto`. */
export function idDeFilaFaltante(prefijo: string, indice: number): string {
  return `${prefijo}-faltante-${indice}-nombre`;
}

interface Props {
  form: UseFormReturn<FormularioInput>;
  prefijo: string;
}

export function EditorFaltantes({ form, prefijo }: Props) {
  const {
    control,
    register,
    formState: { errors },
  } = form;

  const { fields, append, remove } = useFieldArray({ control, name: 'faltantes' });

  const erroresFaltantes = errors.faltantes;

  function agregar() {
    append({ nombre: '', sort_order: fields.length });
  }

  return (
    <div className="flex flex-col gap-lg">
      {fields.length > 0 && (
        <ul className="flex flex-col gap-lg">
          {fields.map((field, indice) => {
            const idNombre = idDeFilaFaltante(prefijo, indice);
            const error = erroresFaltantes?.[indice]?.nombre;

            return (
              <li key={field.id} className="flex flex-col gap-xs">
                <div className="flex items-center gap-sm">
                  <label htmlFor={idNombre} className="sr-only">
                    {`Nombre del faltante ${indice + 1}`}
                  </label>
                  <Input
                    id={idNombre}
                    autoComplete="off"
                    className="flex-1"
                    {...register(`faltantes.${indice}.nombre`)}
                    aria-invalid={Boolean(error) || undefined}
                    aria-describedby={error ? `${idNombre}-error` : undefined}
                  />

                  {/* Misma excepción de §2 que en `EditorCuartos`: 28px visuales
                      dentro de 40px de área clicable, lograda con el recuadro
                      exterior. El nombre accesible lleva el número de fila. */}
                  <button
                    type="button"
                    onClick={() => remove(indice)}
                    aria-label={`Quitar el faltante ${indice + 1}`}
                    className="group flex size-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="transicion flex size-7 items-center justify-center rounded-md text-muted-foreground group-hover:bg-muted group-hover:text-destructive">
                      <X className="size-4" strokeWidth={2} aria-hidden="true" />
                    </span>
                  </button>
                </div>

                {error && <FieldError id={`${idNombre}-error`} errors={[error]} />}
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <Button type="button" variant="outline" onClick={agregar}>
          <Plus aria-hidden="true" />
          Agregar faltante
        </Button>
      </div>

      <FieldDescription>
        Estos se suman a la lista base común a todos los apartamentos.
      </FieldDescription>
    </div>
  );
}
