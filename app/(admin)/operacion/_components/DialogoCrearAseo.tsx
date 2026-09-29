'use client';

import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { normalizar } from '@/lib/domain/properties';
import { cn } from '@/lib/utils';

import { crearAseoManual } from '../_actions';

/**
 * Creación manual de un aseo (ASEO-05, 04-UI-SPEC.md §12.3).
 *
 * ── `normal` NO ES UNA OPCIÓN, Y ESO ES LA MITAD DEL DISEÑO ────────────────
 * Los aseos normales los crea el motor de calendario al detectar el checkout.
 * Ofrecer `normal` acá sería invitar al admin a duplicar a mano lo que el sync ya
 * hace, y el resultado sería un `23505` del índice parcial o, peor, un aseo
 * fantasma en una fecha donde el sync todavía no ha llegado. Solo `Repaso` y
 * `Emergencia`, que son los dos casos que el calendario NO puede saber.
 *
 * ── NO PIDE HUÉSPEDES NI INSTRUCCIONES, Y TAMPOCO ES UN OLVIDO ─────────────
 * El aseo nace `Sin confirmar` y cae en la bandeja igual que uno del sync. Lo
 * exige ASEO-01 ("todo aseo nace pendiente y sin confirmar") y evita dos caminos
 * distintos para el mismo dato: si acá se pudieran meter los huéspedes, habría un
 * aseo confirmado que nunca pasó por el `Sheet` de §10.
 *
 * ── EL COMBOBOX NO AUTORIZA NADA (T-04-04) ────────────────────────────────
 * Que solo liste unidades gestionadas y activas es UX: no ofrecer lo que la base
 * va a rechazar. La autorización real son `exigirAdmin()` en la action y
 * `private.is_admin()` más el filtro de `is_managed` dentro de
 * `create_manual_cleaning`. Un Server Action es un endpoint HTTP público: quien
 * tenga su id y el payload la invoca sin pasar por este diálogo. Lo mismo vale
 * para el `min` del input de fecha, que del lado del servidor lo vuelve a
 * comprobar `today_bog()`.
 *
 * ── EL ERROR DE ASEO-07 VA INLINE, NUNCA EN TOAST (D-19, §12.6) ───────────
 * La action ya devuelve `campo: 'fecha'` con el mensaje interpolado, así que este
 * diálogo solo tiene que pintar el error en el campo que la action nombra. Es un
 * error atado a un campo concreto y el admin tiene que poder corregirlo sin
 * cerrar el diálogo y volver a teclear los otros dos. Nunca se renderiza `23505`
 * ni el texto crudo de Postgres: eso ya lo resolvió `mapDbError()`.
 */

export interface ApartamentoParaAseo {
  id: string;
  nombre: string;
}

/** Las dos únicas opciones. `normal` no está, y su ausencia es deliberada. */
const TIPOS = [
  { valor: 'repaso', etiqueta: 'Repaso' },
  { valor: 'emergencia', etiqueta: 'Emergencia' },
] as const;

/**
 * Botón primario en vuelo (§15.2). Vive aparte porque `useFormStatus` lee el
 * estado del `<form>` ANCESTRO: llamado desde el componente que renderiza el form
 * devolvería siempre `pending: false`.
 */
function BotonCrear() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="min-w-boton-crear-aseo">
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Creando…
        </>
      ) : (
        'Crear aseo'
      )}
    </Button>
  );
}

/**
 * El valor inicial del campo de fecha: el día seleccionado, o vacío si ya pasó.
 *
 * Comparación entre cadenas `'YYYY-MM-DD'` y nunca construyendo un `Date`: su orden
 * lexicográfico coincide con el cronológico, y `new Date('2026-09-10')` es
 * medianoche UTC, que en Bogotá es el día anterior.
 */
function fechaPorDefecto(dia: string, hoy: string): string {
  return dia >= hoy ? dia : '';
}

export function DialogoCrearAseo({
  apartamentos,
  hoy,
  dia,
}: {
  /** Solo unidades gestionadas y activas, ya ordenadas por nombre. */
  apartamentos: ApartamentoParaAseo[];
  /**
   * El día de negocio de Bogotá, del servidor. Llega por prop y no de `hoyBog()`
   * en el cliente: el reloj del navegador puede estar en cualquier zona, y es el
   * mismo valor que la ventana de la pantalla ya usó.
   *
   * **Sigue siendo el `min` del campo de fecha y NO su valor por defecto**: no se
   * puede crear un aseo en el pasado, y eso no cambió con el selector de día.
   */
  hoy: string;
  /**
   * EL DÍA SELECCIONADO EN LA PANTALLA (plan 10-05), que pasa a ser la FECHA POR
   * DEFECTO del formulario.
   *
   * **Es un cambio de comportamiento y va escrito:** antes el campo nacía vacío y
   * el admin tecleaba el día; ahora crear un aseo apunta por defecto al día que
   * está en pantalla, que es el que acaba de mirar. Con el eje de la pantalla en
   * un día concreto, obligar a re-teclear ese mismo día sería pedirle al admin que
   * repita lo que el selector ya dice.
   *
   * Con un día ANTERIOR a hoy el campo vuelve a nacer vacío, porque ese valor
   * violaría el `min` y dejaría el formulario inválido de salida, sin que nada
   * explicara por qué.
   */
  dia: string;
}) {
  const router = useRouter();

  const [abierto, setAbierto] = useState(false);
  const [buscador, setBuscador] = useState(false);

  // Los tres campos son CONTROLADOS, y no es preferencia de estilo: React 19
  // RESETEA un `<form action={...}>` no controlado en cuanto la action responde,
  // así que el error de fecha ocupada dejaría el formulario en blanco y el admin
  // tendría que volver a elegir apartamento y tipo para corregir un día. §15.3
  // exige justo lo contrario: el formulario conserva lo escrito.
  const [apartamento, setApartamento] = useState<ApartamentoParaAseo | null>(null);
  const [fecha, setFecha] = useState(fechaPorDefecto(dia, hoy));
  const [tipo, setTipo] = useState<string>(TIPOS[0].valor);

  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    crearAseoManual,
    null,
  );

  const idApartamento = useId();
  const idEtiquetaApartamento = useId();
  const idFecha = useId();
  const idTipo = useId();
  const idError = useId();

  // `useActionState` conserva el último resultado entre envíos; sin esta marca,
  // un re-render volvería a lanzar el toast del mismo éxito.
  const procesado = useRef<ResultadoAccion | null>(null);

  useEffect(() => {
    if (!estado || estado === procesado.current) return;
    procesado.current = estado;

    if (estado.ok) {
      // El toast DICE DÓNDE QUEDÓ a propósito: el aseo recién creado no aparece
      // en la tabla del día si el día está colapsado, y sin esa frase el admin
      // cree que no se creó nada.
      toast.success(estado.mensaje);
      setAbierto(false);
      return;
    }

    // Con `campo` el error ya se pinta inline bajo ese input; duplicarlo en un
    // toast sería decir dos veces lo mismo. Sin `campo` es un error de la
    // operación completa y ahí sí va a toast destructivo (§15.3).
    if (!estado.campo) toast.error(estado.error);
  }, [estado]);

  function alCambiarApertura(siguiente: boolean) {
    setAbierto(siguiente);

    if (siguiente) {
      // LA FECHA POR DEFECTO SE VUELVE A FIJAR AL ABRIR, y no basta con el estado
      // inicial: este componente NO se desmonta al navegar de día, así que su
      // `useState` conserva el valor del día anterior. Sin esto, el admin navega al
      // viernes, abre el diálogo y el campo sigue diciendo el jueves.
      setFecha(fechaPorDefecto(dia, hoy));
      return;
    }

    setApartamento(null);
    setFecha(fechaPorDefecto(dia, hoy));
    setTipo(TIPOS[0].valor);
    procesado.current = null;
    // La action ya llamó a `revalidatePath('/operacion')`; esto pide el árbol de
    // servidor YA, para que el aseo nuevo esté en la bandeja en cuanto el diálogo
    // desaparece.
    router.refresh();
  }

  // Se extraen a constantes y no a un helper: TypeScript estrecha la unión
  // discriminada a través de un `const` sobre el discriminante, pero NO a través
  // de una función que devuelva booleano.
  const hayError = estado?.ok === false;
  const campoConError = hayError ? estado.campo : undefined;
  const mensajeError = hayError ? estado.error : '';
  const errorDeFecha = campoConError === 'fecha';

  return (
    <Dialog open={abierto} onOpenChange={alCambiarApertura}>
      {/*
        `outline` y no primario (§4.2): el único relleno de la pantalla es
        `Confirmar N aseos` de la bandeja. Crear un aseo a mano es una acción rara
        y deliberada.
      */}
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <Plus aria-hidden="true" />
            Crear aseo
          </Button>
        }
      />

      <DialogContent className="sm:max-w-dialogo">
        <DialogHeader>
          <DialogTitle>Crear aseo</DialogTitle>
          <DialogDescription className="text-micro text-muted-foreground">
            Solo repasos y emergencias. Los aseos normales los crea el calendario al
            detectar el checkout.
          </DialogDescription>
        </DialogHeader>

        <form action={accion} className="flex flex-col gap-lg" noValidate>
          {/* `apartamento_nombre` NO viaja a la base: es lo que permite interpolar
              el nombre en el error de ASEO-07 sin que `mapDbError()` deje de ser
              una función pura de mapeo. Contrato de claves del plan 04-08. */}
          <input type="hidden" name="apartamento_id" value={apartamento?.id ?? ''} />
          <input type="hidden" name="apartamento_nombre" value={apartamento?.nombre ?? ''} />
          <input type="hidden" name="tipo" value={tipo} />

          <Field>
            <FieldLabel id={idEtiquetaApartamento} htmlFor={idApartamento}>
              Apartamento
            </FieldLabel>

            <Popover open={buscador} onOpenChange={setBuscador}>
              <PopoverTrigger
                render={
                  <Button
                    id={idApartamento}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={buscador}
                    // El nombre accesible se compone de la etiqueta MÁS el valor
                    // actual. Solo con la etiqueta, un lector anunciaría
                    // "Apartamento, botón" sin decir cuál está elegido.
                    aria-labelledby={`${idEtiquetaApartamento} ${idApartamento}`}
                    className={cn(
                      'w-full justify-between font-normal',
                      !apartamento && 'text-muted-foreground',
                    )}
                  >
                    {apartamento?.nombre ?? 'Elige un apartamento'}
                    <ChevronDown aria-hidden="true" className="opacity-50" />
                  </Button>
                }
              />

              <PopoverContent className="w-(--anchor-width) p-0">
                <Command
                  // El filtro por defecto de cmdk compara los caracteres tal cual,
                  // así que `bogota` no encontraría `Bogotá 3`. `normalizar()` es
                  // la misma función que usan el buscador de la tabla y el
                  // selector de cluster: dos implementaciones del mismo matching
                  // se desincronizan.
                  filter={(value, search) =>
                    normalizar(value).includes(normalizar(search)) ? 1 : 0
                  }
                >
                  <CommandInput
                    autoFocus
                    placeholder="Busca un apartamento"
                    aria-label="Busca un apartamento"
                  />
                  <CommandList>
                    <CommandEmpty>Ningún apartamento coincide.</CommandEmpty>
                    <CommandGroup>
                      {apartamentos.map((a) => (
                        <CommandItem
                          key={a.id}
                          value={a.nombre}
                          onSelect={() => {
                            setApartamento(a);
                            setBuscador(false);
                          }}
                        >
                          {a.nombre}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Field>

          <Field data-invalid={errorDeFecha || undefined}>
            <FieldLabel htmlFor={idFecha}>Fecha</FieldLabel>
            <Input
              id={idFecha}
              name="fecha"
              type="date"
              required
              min={hoy}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-invalid={errorDeFecha || undefined}
              aria-describedby={errorDeFecha ? idError : undefined}
            />
            {/* AQUÍ, y no en un toast: el mensaje nombra el apartamento y el día,
                y el admin corrige el día sin cerrar el diálogo (D-19). */}
            {errorDeFecha && <FieldError id={idError}>{mensajeError}</FieldError>}
          </Field>

          <Field>
            <FieldLabel id={`${idTipo}-label`} htmlFor={idTipo}>
              Tipo
            </FieldLabel>
            <Select value={tipo} onValueChange={(v) => setTipo(String(v))}>
              <SelectTrigger
                id={idTipo}
                aria-labelledby={`${idTipo}-label ${idTipo}`}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            {/* `Volver` en outline y con `autoFocus`: nunca dos rellenos
                adyacentes, y un Enter reflejo sobre un diálogo recién abierto no
                puede crear un aseo. */}
            <DialogClose
              render={
                <Button type="button" variant="outline" autoFocus>
                  Volver
                </Button>
              }
            />
            <BotonCrear />
          </DialogFooter>

          {/* Error de la OPERACIÓN (sin `campo`): va a toast según §15.3, pero
              también queda visible en el diálogo, porque el toast vive fuera del
              foco atrapado y quien navega por teclado no lo encuentra. */}
          {hayError && !campoConError && <FieldError>{mensajeError}</FieldError>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
