'use client';

import { CircleDashed, Plus, X } from 'lucide-react';
import { Controller, useFieldArray, type UseFormReturn } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TipoDeCuarto } from '@/lib/data/apartamentos';
import type { FormularioInput } from '@/lib/domain/cuartos.schema';

import { EstadoVacio } from '../../_components/EstadoVacio';

/**
 * Sección 5 del formulario, mitad de los cuartos (APTO-06, UI-SPEC §8.1).
 *
 * ── ESTA LISTA NO ES DECORATIVA ─────────────────────────────────────────────
 * De aquí sale el checklist que el aseador ejecuta en la Fase 6: cada cuarto
 * aporta las tareas de su tipo (`checklist_tasks`, máximo 3 por tipo). Por eso
 * el estado vacío de §9.2 no dice solo "no hay cuartos", dice la consecuencia:
 * `Sin cuartos no se puede armar el checklist del aseo.` Esa segunda frase es lo
 * único que le explica al admin por qué le importa una sección que puede dejar
 * en blanco sin que nada se lo impida.
 *
 * ── LOS CUARTOS NO SON UNA PUERTA DE ACTIVACION ─────────────────────────────
 * Un apartamento se puede activar sin un solo cuarto. Ningún CHECK de
 * `properties` lo exige y ningún REQ lo pide, así que esta sección NO alimenta
 * `faltantesParaActivar` ni aparece en el bloque `Para activar falta:`.
 * Añadirlo ahí "porque parece incompleto" cambiaría el contrato de §8.2 y
 * bloquearía las 39 unidades del catálogo. Hay un test de Playwright dedicado a
 * que el botón siga habilitado con la sección vacía.
 *
 * ── LA CLAVE DE CADA FILA ES `field.id`, Y NINGUN TEST LO DEFIENDE ──────────
 * `useFieldArray` entrega un `id` propio y estable por fila, y usarlo es el
 * contrato documentado de esa API: con la clave por índice, React reutiliza el
 * nodo de la fila borrada para la siguiente y el estado no controlado que vive
 * dentro (foco, posición del cursor, popup abierto) se queda en la fila
 * equivocada.
 *
 * HONESTIDAD SOBRE LA COBERTURA, porque lo contrario sería una afirmación falsa
 * en un comentario: se sustituyó `field.id` por el índice y **los 9 tests de
 * `e2e/apartamento-cuartos.spec.ts` siguieron en verde**, incluido el que quita
 * la PRIMERA de dos filas con tipo y etiqueta distintos, que es el montaje
 * pensado para atraparlo. Con esta composición —`Input` no controlado
 * registrado por nombre más un `Controller` que se re-suscribe por nombre— el
 * cambio no produce un síntoma observable desde Playwright. La clave se queda en
 * `field.id` por contrato, no porque haya una red debajo; quien la cambie no va
 * a ver nada rojo.
 *
 * ── EL AÑADIDO QUE SE PERDIA UNA VEZ DE CADA DOS (medido, no supuesto) ──────
 * `useFieldArray` combinado con `mode: 'onBlur'` y un resolver de esquema
 * DESCARTA EN SILENCIO el `append` que ocurre en el mismo gesto en el que una
 * fila del array pierde el foco. Medido con este mismo formulario, pulsando
 * `Agregar cuarto` cuatro veces seguidas: 1 fila, 1 fila, 2 filas, 2 filas. La
 * mitad de los clics no hacía nada y nada fallaba.
 *
 * Se aisló a dos causas que se suman:
 *
 *  1. `append` FOCALIZA la fila nueva por defecto. Eso deja el cursor dentro del
 *     array, así que el clic siguiente en `Agregar cuarto` es a la vez un blur
 *     de una fila y un `append`, que es exactamente la combinación que se pierde.
 *     Se pasa `shouldFocus: false`: el foco se queda en el botón, que no es un
 *     campo registrado.
 *  2. Aun así el admin puede pulsar dentro de una etiqueta y añadir sin escribir
 *     nada, y ahí volvía a perderse (medido aparte: 1 fila donde debía haber 2).
 *     Lo que dispara la pérdida es el manejador de blur que `register()` instala,
 *     no el blur del DOM: neutralizándolo, las dos filas aparecen. Con el foco en
 *     un campo AJENO al array (`Dirección`) nunca se perdió nada, que es lo que
 *     acota la causa al array y descarta "el clic no llegó".
 *
 * Consecuencia asumida y declarada: los errores de estas filas se pintan al
 * ENVIAR, no al salir de cada campo. Es lo que pide la sección 5 de §8.1 —el
 * duplicado se bloquea en el cliente antes de enviar— y a partir del primer
 * envío fallido la revalidación por cambio los va limpiando conforme se
 * corrigen. Perder una fila entera sin avisar es mucho peor que pintar su error
 * un gesto más tarde.
 */

/**
 * El id de un control de la fila `indice`.
 *
 * Se EXPORTA y no se acuña suelto dentro del render por la misma razón medida en
 * el plan 02-12 con `SeccionGestion`: el formulario tiene que poder llevar el
 * foco a la fila que falló tras un submit, y si cada sitio compone la cadena a
 * mano, cambiar el formato en uno deja el `getElementById` del otro devolviendo
 * `null` y el foco no se mueve SIN QUE NADA FALLE.
 */
export function idDeFilaCuarto(
  prefijo: string,
  indice: number,
  campo: 'tipo' | 'etiqueta',
): string {
  return `${prefijo}-cuarto-${indice}-${campo}`;
}

interface Props {
  form: UseFormReturn<FormularioInput>;
  /** El catálogo global, leído de `room_types`. Nunca codificado. */
  tipos: TipoDeCuarto[];
  /** Prefijo de ids que reparte el formulario, igual que el resto de secciones. */
  prefijo: string;
}

export function EditorCuartos({ form, tipos, prefijo }: Props) {
  const {
    control,
    register,
    formState: { errors },
  } = form;

  const { fields, append, remove } = useFieldArray({ control, name: 'cuartos' });

  const erroresCuartos = errors.cuartos;

  /**
   * `sort_order` se deriva del índice al enviar (ver `FormularioApartamento`),
   * pero se siembra aquí para que el valor por defecto ya sea coherente. El
   * reordenamiento por arrastre NO está en el alcance de esta fase.
   *
   * El tipo arranca VACIO y no en el primero del catálogo: elegir el tipo es lo
   * que decide qué tareas de checklist recibe ese cuarto, y un default silencioso
   * haría que la mayoría de los cuartos naciera como "General" sin que nadie lo
   * decidiera. El esquema bloquea el vacío con `Elige un tipo de cuarto`.
   */
  function agregar() {
    // `shouldFocus: false` NO es cosmético: ver la causa 1 de la cabecera.
    append({ room_type_id: '', etiqueta: '', sort_order: fields.length }, { shouldFocus: false });
  }

  function nombreDeTipo(id: unknown): string {
    const encontrado = tipos.find((t) => t.id === id);
    return encontrado?.nombre ?? 'Elige un tipo';
  }

  if (fields.length === 0) {
    return (
      <EstadoVacio
        icono={CircleDashed}
        encabezado="Este apartamento no tiene cuartos definidos."
        cuerpo="Sin cuartos no se puede armar el checklist del aseo."
        accion={
          <Button type="button" onClick={agregar}>
            <Plus aria-hidden="true" />
            Agregar cuarto
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      {/*
        Encabezados de columna visibles UNA vez, con la etiqueta real de cada
        control en `sr-only` por fila. §13 exige `<label>` real ligado por
        `htmlFor` —nunca el placeholder como etiqueta— y repetir "Tipo" y
        "Etiqueta" ocho veces en pantalla convertiría la sección en ruido.
        Las dos anchuras son las mismas que las de las filas.
      */}
      <div className="flex items-center gap-sm text-micro font-semibold text-muted-foreground">
        <span className="w-col-tipo-cuarto shrink-0">Tipo</span>
        <span className="flex-1">Etiqueta</span>
        <span className="size-10 shrink-0" aria-hidden="true" />
      </div>

      <ul className="flex flex-col gap-lg">
        {fields.map((field, indice) => {
          const idTipo = idDeFilaCuarto(prefijo, indice, 'tipo');
          const idEtiqueta = idDeFilaCuarto(prefijo, indice, 'etiqueta');
          const errorTipo = erroresCuartos?.[indice]?.room_type_id;
          const errorEtiqueta = erroresCuartos?.[indice]?.etiqueta;

          return (
            // `field.id`, no `indice`. Ver la cabecera.
            <li key={field.id} className="flex flex-col gap-xs">
              <div className="flex items-center gap-sm">
                <label htmlFor={idTipo} id={`${idTipo}-label`} className="sr-only">
                  {`Tipo del cuarto ${indice + 1}`}
                </label>
                <Controller
                  control={control}
                  name={`cuartos.${indice}.room_type_id`}
                  render={({ field: campo }) => (
                    <Select
                      value={typeof campo.value === 'string' ? campo.value : ''}
                      onValueChange={(valor) =>
                        campo.onChange(typeof valor === 'string' ? valor : '')
                      }
                    >
                      {/*
                        Etiqueta MAS disparador en `aria-labelledby`: un `<button>`
                        es etiquetable, así que un `<label htmlFor>` a secas GANA a
                        su contenido y el tipo seleccionado desaparece del nombre
                        accesible. Medido en el plan 02-12 sobre los tres `Select`
                        de esta misma pantalla.
                      */}
                      <SelectTrigger
                        id={idTipo}
                        aria-labelledby={`${idTipo}-label ${idTipo}`}
                        aria-invalid={Boolean(errorTipo) || undefined}
                        className="w-col-tipo-cuarto shrink-0"
                      >
                        <SelectValue>{(v: string) => nombreDeTipo(v)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {tipos.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />

                <label htmlFor={idEtiqueta} className="sr-only">
                  {`Etiqueta del cuarto ${indice + 1}`}
                </label>
                <Input
                  id={idEtiqueta}
                  autoComplete="off"
                  className="flex-1"
                  {...register(`cuartos.${indice}.etiqueta`)}
                  // El manejador de blur que instala `register()` queda
                  // NEUTRALIZADO a propósito: es la causa 2 de la cabecera, y
                  // dejarlo puesto hace que añadir una fila justo después de
                  // salir de esta se pierda sin decir nada. La validación de
                  // estas filas ocurre al enviar, que es donde el contrato la
                  // pide.
                  onBlur={() => {}}
                  aria-invalid={Boolean(errorEtiqueta) || undefined}
                  aria-describedby={errorEtiqueta ? `${idEtiqueta}-error` : undefined}
                />

                {/*
                  EXCEPCION DECLARADA DE UI-SPEC §2: 28px visuales dentro de 40px
                  de área clicable. El área se consigue con el recuadro exterior y
                  no agrandando el afordance visual, para no romper el ritmo
                  vertical de la fila.

                  El nombre accesible lleva el NUMERO de la fila. Sin él, ocho
                  botones se llamarían igual y ni un lector de pantalla ni un
                  `getByRole` podrían distinguirlos.
                */}
                <button
                  type="button"
                  onClick={() => remove(indice)}
                  aria-label={`Quitar el cuarto ${indice + 1}`}
                  className="group flex size-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="transicion flex size-7 items-center justify-center rounded-md text-muted-foreground group-hover:bg-muted group-hover:text-destructive">
                    <X className="size-4" strokeWidth={2} aria-hidden="true" />
                  </span>
                </button>
              </div>

              {/*
                El error va BAJO SU FILA. `esquemaCuartos` emite el issue del
                duplicado en el índice del elemento repetido justamente para que
                react-hook-form lo deje en `cuartos.<i>.etiqueta` y aparezca aquí,
                y no como un mensaje suelto encima de la lista donde el admin
                tendría que adivinar qué fila sobra.
              */}
              {(errorTipo || errorEtiqueta) && (
                <FieldError
                  id={`${idEtiqueta}-error`}
                  errors={[errorTipo, errorEtiqueta]}
                />
              )}
            </li>
          );
        })}
      </ul>

      <div>
        <Button type="button" variant="outline" onClick={agregar}>
          <Plus aria-hidden="true" />
          Agregar cuarto
        </Button>
      </div>
    </div>
  );
}
