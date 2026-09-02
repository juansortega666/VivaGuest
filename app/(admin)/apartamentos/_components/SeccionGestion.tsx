'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AseadorElegible } from '@/lib/data/apartamentos';
import type { ApartamentoInput } from '@/lib/domain/apartamento.schema';

/**
 * Sección 2 del formulario: el switch que reconfigura medio formulario
 * (UI-SPEC §8.3).
 *
 * ── LO QUE ESTE COMPONENTE IMPIDE, QUE ES SU RAZON DE SER ───────────────────
 * `props_assignees_only_when_managed` prohíbe que una unidad de gestión externa
 * lleve responsable o suplente, y `props_suplente_distinct` prohíbe que sean la
 * misma persona. Los dos son CHECK de `properties`, y los dos se disparan con un
 * 23514 cuyo mensaje traducido no dice qué campo arreglar. Aquí no pueden
 * ocurrir: al pasar a gestión externa los tres campos se limpian, y el `Select`
 * de suplente no ofrece siquiera al responsable elegido.
 *
 * ── LOS CALLBACKS DE BASE UI RECIBEN DOS ARGUMENTOS ─────────────────────────
 * 02-RESEARCH §3.6: `onCheckedChange(checked, eventDetails)` y
 * `onValueChange(value, eventDetails)`. Pasar `field.onChange` directo FUNCIONA,
 * pero por accidente: react-hook-form ignora el segundo argumento. Aquí se
 * envuelve siempre, para que se vea qué es lo que se está guardando.
 *
 * `Select` y `Switch` son primitivos controlados y van con `<Controller>`;
 * `Textarea` va con `register()`.
 */

/** Centinela del `Select` para "sin asignar". Base UI necesita un string. */
const SIN_ASIGNAR = '';

/**
 * El estado del formulario guarda `unknown` en los campos que pasan por un
 * `z.preprocess` (el esquema acepta lo que un input entrega de verdad). Los
 * `Select` necesitan un string, así que el estrechamiento se hace en un solo
 * sitio en vez de repartir casts por el JSX.
 */
function comoTexto(v: unknown): string {
  return typeof v === 'string' ? v : SIN_ASIGNAR;
}

interface Props {
  form: UseFormReturn<ApartamentoInput>;
  /**
   * Aseadores del catálogo. Llega con los INACTIVOS incluidos a propósito: ver
   * el filtrado de abajo.
   */
  aseadores: AseadorElegible[];
}

export function SeccionGestion({ form, aseadores }: Props) {
  const {
    control,
    register,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = form;

  const idGestion = useId();
  const idResponsable = useId();
  const idSuplente = useId();
  const idContacto = useId();

  // Suscripción GRANULAR, con array. `watch()` sin argumentos re-renderiza el
  // formulario entero en cada tecla de cualquiera de los 12 campos.
  const [gestion, responsable, suplente] = watch([
    'gestion_vivaguest',
    'responsable_id',
    'suplente_id',
  ]);

  const [confirmando, setConfirmando] = useState(false);
  const [avisoSuplente, setAvisoSuplente] = useState(false);

  // El aviso ámbar se retira en cuanto el admin vuelve a elegir suplente. Sin
  // esto se quedaría en pantalla contradiciendo lo que el campo muestra.
  const suplenteAnterior = useRef(suplente);
  useEffect(() => {
    if (suplente !== suplenteAnterior.current) {
      suplenteAnterior.current = suplente;
      if (comoTexto(suplente) !== SIN_ASIGNAR) setAvisoSuplente(false);
    }
  }, [suplente]);

  /**
   * Regla de §8.3: si el admin pone de responsable a quien ya era suplente, el
   * suplente se limpia y se avisa.
   *
   * Se hace al ELEGIR y no en un efecto sobre el par de valores: un efecto que
   * observa los dos campos también dispararía al llegar los `defaultValues` de
   * una fila guardada, y ahí la base ya garantiza que son distintos. Limpiar en
   * ese momento borraría un suplente correcto nada más abrir la pantalla.
   */
  function elegirResponsable(valor: string) {
    setValue('responsable_id', valor, { shouldDirty: true, shouldValidate: true });

    if (valor !== SIN_ASIGNAR && comoTexto(getValues('suplente_id')) === valor) {
      setValue('suplente_id', SIN_ASIGNAR, { shouldDirty: true, shouldValidate: true });
      setAvisoSuplente(true);
    }
  }

  /** ¿Hay algo que el paso a gestión externa vaya a borrar? */
  function hayDatosQuePerder(): boolean {
    const v = getValues();
    return Boolean(
      comoTexto(v.responsable_id) ||
        comoTexto(v.suplente_id) ||
        v.tarifa_huesped != null ||
        v.pago_aseador != null,
    );
  }

  function alCambiarGestion(activado: boolean) {
    // De externa a gestionada no se pregunta: no se pierde nada, porque los
    // campos que la gestionada usa estaban ocultos y vacíos.
    if (activado || !hayDatosQuePerder()) {
      setValue('gestion_vivaguest', activado, { shouldDirty: true, shouldValidate: true });
      if (!activado) limpiarCamposDeGestionada();
      return;
    }

    // Con datos escritos se pregunta ANTES de tocar el switch. Cancelar no
    // necesita "devolverlo": nunca se movió.
    setConfirmando(true);
  }

  function limpiarCamposDeGestionada() {
    // Los tres campos que la base prohíbe en una unidad externa, más las tarifas
    // que el diálogo anuncia. Sin esto, `props_assignees_only_when_managed`
    // rechaza el guardado con un 23514 y el admin no ve ningún campo culpable:
    // los que sobran están ocultos.
    setValue('responsable_id', SIN_ASIGNAR, { shouldDirty: true });
    setValue('suplente_id', SIN_ASIGNAR, { shouldDirty: true });
    setValue('tarifa_huesped', null, { shouldDirty: true });
    setValue('pago_aseador', null, { shouldDirty: true });
    setAvisoSuplente(false);
  }

  function confirmarGestionExterna() {
    setValue('gestion_vivaguest', false, { shouldDirty: true, shouldValidate: true });
    limpiarCamposDeGestionada();
    setConfirmando(false);
  }

  /**
   * Los elegibles son los ACTIVOS, más el que ya estuviera asignado aunque esté
   * desactivado.
   *
   * `listarAseadoresActivos` devuelve también los inactivos justamente para esto
   * (plan 02-10): si el responsable actual quedó desactivado y se filtrara aquí,
   * el `Select` no tendría su nombre que pintar, mostraría un valor sin etiqueta,
   * y el primer guardado borraría la asignación sin que nadie lo pidiera.
   */
  function opciones(seleccionado: string) {
    return aseadores.filter((a) => a.is_active || a.id === seleccionado);
  }

  function etiqueta(id: string): string {
    const encontrado = aseadores.find((a) => a.id === id);
    if (!encontrado) return 'Sin asignar';
    return encontrado.is_active ? encontrado.full_name : `${encontrado.full_name} (inactivo)`;
  }

  const idResponsable_ = comoTexto(responsable);
  const idSuplente_ = comoTexto(suplente);

  return (
    <>
      <Field orientation="horizontal">
        <Controller
          control={control}
          name="gestion_vivaguest"
          render={({ field }) => (
            <Switch
              id={idGestion}
              name={field.name}
              checked={field.value === true}
              // Envuelto a propósito: el segundo argumento de Base UI
              // (`eventDetails`) no es lo que se guarda. Ver la cabecera.
              onCheckedChange={(activado) => alCambiarGestion(activado)}
              onBlur={field.onBlur}
            />
          )}
        />
        <FieldLabel htmlFor={idGestion}>Gestionado por VivaGuest</FieldLabel>
      </Field>

      {gestion === false ? (
        <Field data-invalid={Boolean(errors.contacto_externo) || undefined}>
          <FieldLabel htmlFor={idContacto}>Contacto externo</FieldLabel>
          <Textarea
            id={idContacto}
            rows={2}
            {...register('contacto_externo')}
            aria-invalid={Boolean(errors.contacto_externo) || undefined}
          />
          <FieldDescription>
            Nombre y teléfono de quien responde por esta unidad. Sin esto no se puede
            activar.
          </FieldDescription>
          <FieldError errors={[errors.contacto_externo]} />
        </Field>
      ) : (
        <>
          <Field data-invalid={Boolean(errors.responsable_id) || undefined}>
            <FieldLabel htmlFor={idResponsable}>Aseador responsable</FieldLabel>
            <Select
              value={idResponsable_}
              onValueChange={(valor) => elegirResponsable(comoTexto(valor))}
            >
              <SelectTrigger id={idResponsable} className="w-full">
                <SelectValue>{(v: string) => etiqueta(v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
                {opciones(idResponsable_).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.is_active ? (
                      a.full_name
                    ) : (
                      // El inactivo se muestra MARCADO y no se esconde: el dato
                      // sigue en la base y ocultarlo lo borraría en el primer
                      // guardado sin decir nada.
                      <span className="text-status-idle">{a.full_name} (inactivo)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={[errors.responsable_id]} />
          </Field>

          <Field data-invalid={Boolean(errors.suplente_id) || undefined}>
            <FieldLabel htmlFor={idSuplente}>Aseador suplente</FieldLabel>
            <Controller
              control={control}
              name="suplente_id"
              render={({ field }) => (
                <Select
                  value={comoTexto(field.value)}
                  onValueChange={(valor) => field.onChange(comoTexto(valor))}
                >
                  <SelectTrigger id={idSuplente} className="w-full">
                    <SelectValue>{(v: string) => etiqueta(v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_ASIGNAR}>Sin asignar</SelectItem>
                    {/*
                      El responsable elegido NO aparece en esta lista. Es el
                      espejo de `props_suplente_distinct`, y dejarlo seleccionable
                      convertiría un descuido de un clic en un 23514.
                    */}
                    {opciones(idSuplente_)
                      .filter((a) => a.id !== idResponsable_)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.is_active ? (
                            a.full_name
                          ) : (
                            <span className="text-status-idle">{a.full_name} (inactivo)</span>
                          )}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            {avisoSuplente && (
              // `aria-live` porque el cambio lo provoca OTRO campo: quien acaba
              // de elegir responsable no tiene el foco aquí y no vería el aviso.
              <p aria-live="polite" className="text-micro text-status-warn">
                Se quitó el suplente: no puede ser la misma persona que el responsable.
              </p>
            )}
            <FieldError errors={[errors.suplente_id]} />
          </Field>
        </>
      )}

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar como gestión externa</AlertDialogTitle>
            <AlertDialogDescription>
              Esto borra el responsable, el suplente y las tarifas de este apartamento.
              Las unidades de gestión externa solo llevan un contacto de texto libre.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            {/*
              `autoFocus` en Cancelar. No es un diálogo destructivo de datos ya
              guardados, pero sí borra cuatro campos del formulario, y un Enter
              reflejo no debería hacerlo.
            */}
            <AlertDialogCancel autoFocus>Cancelar</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmarGestionExterna}>
              Marcar como externa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
