'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { FilaDeOperacion } from '@/lib/data/operacion';
import type { ResultadoAccion } from '@/lib/domain/acciones';
import { formatFechaBog, formatHoraLimite } from '@/lib/domain/dates';

import { confirmarAseo } from '../_actions';
import { AvisoAseadorSinPush } from './AvisoAseadorSinPush';

/**
 * El `Sheet` de confirmación encadenada (ASEO-02, ASEO-03, 04-UI-SPEC.md §10).
 *
 * ── ESTÁ CALIBRADO PARA QUINCE SEGUIDAS, NO PARA UNA ───────────────────────
 * Una corrida del sync puede meter QUINCE aseos sin confirmar de golpe. Todo lo
 * que sigue —el encadenado, la barra de progreso, la ausencia de toast por paso,
 * el `Saltar este`— sale de ese único hecho medido. Un panel diseñado para "uno o
 * dos" obligaría a abrir y cerrar quince veces y a comerse quince toasts.
 *
 * ── LA TANDA SE CONGELA AL ABRIR, Y ESO NO ES UNA OPTIMIZACIÓN ─────────────
 * `confirmarAseo` llama a `revalidatePath('/operacion')`, así que en cuanto el
 * primero se confirma Next vuelve a renderizar el árbol de servidor y la bandeja
 * de abajo pasa de quince filas a catorce. Si esta lista viniera de la prop en
 * cada render, el aseo que el admin está mirando cambiaría DEBAJO del formulario
 * que acaba de rellenar. Por eso `useState(() => filas)`: se captura una vez, al
 * montar, y el componente va montado con `key` de sesión desde la bandeja, así
 * que abrir de nuevo produce una tanda nueva. Es también lo que hace verdadero el
 * `3 de 15` de la cabecera: el progreso cuenta CONFIRMADOS DE LA TANDA INICIAL,
 * no posición en una lista que se encoge (§10).
 *
 * ── EL CÓDIGO DE ACCESO NO APARECE ACÁ, Y NO ES UN OLVIDO (D-12, T-04-11) ──
 * Se revela por `reveal_access_code`, que deja auditoría y exige ser el aseador
 * asignado. Confirmar no lo necesita. Además `property_secrets` no tiene ningún
 * grant, así que ni siquiera es alcanzable desde la consulta que alimenta esta
 * pantalla: para pintarlo habría que ir a buscarlo a propósito. Queda escrito
 * para que nadie lo añada "por comodidad".
 *
 * ── NINGÚN COPY AFIRMA QUE EL AVISO LLEGÓ (05-UI-SPEC §11.4) ───────────────
 * Desde la Fase 5 la cola SÍ se drena, así que la regla vieja —"ni nombrar el
 * canal"— quedó al revés y está superseded. La que rige ahora distingue dos
 * cosas que se parecen y no lo son: se puede afirmar la AUSENCIA de canal, que
 * es un hecho conocido al escribir (cero suscripciones vivas), y NO se puede
 * afirmar la ENTREGA, porque el drenaje es asíncrono y fire-and-forget y nadie
 * de este lado sabe si sonó un teléfono. `Queda asignado a María` sigue siendo
 * cierto; `María ya sabe` seguiría siendo mentira.
 *
 * ── LA TRAMPA DE FOCO Y EL `Esc` LOS DA BASE UI ────────────────────────────
 * No se reimplementan con un `useEffect` de `keydown` (§16.3). Lo único que este
 * archivo añade es que al ENCADENAR el foco vuelve al campo de huéspedes en vez
 * de quedarse en el botón que se acaba de pulsar.
 */

/** Los dos únicos campos que el admin escribe. Se limpian en cada encadenado. */
const CAMPOS_VACIOS = { huespedes: '', instrucciones: '' };

/**
 * Entero mayor o igual a 1, validado ANTES de enviar.
 *
 * `cleanings.num_huespedes` lleva un CHECK `> 0` desde la migración 04, así que
 * esto no es la garantía: es lo que hace que ese CHECK no se dispare nunca desde
 * acá y el admin corrija en el campo en vez de recibir un `23514` traducido.
 */
function huespedesValidos(valor: string): boolean {
  const t = valor.trim();
  return /^\d+$/.test(t) && Number(t) >= 1;
}

/**
 * Botón primario del pie, en su propio componente porque `useFormStatus` lee el
 * estado del `<form>` ANCESTRO: llamado desde el componente que renderiza el form
 * devolvería siempre `pending: false`.
 *
 * En vuelo cambia a `Loader2` girando y `Confirmando…`, y conserva el ancho con
 * `min-w-boton-confirmar`. Prohibido deshabilitar sin mostrar el spinner (§15.2).
 */
function BotonConfirmar({
  etiqueta,
  bloqueado,
}: {
  etiqueta: string;
  bloqueado: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending || bloqueado}
      className="min-w-boton-confirmar"
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Confirmando…
        </>
      ) : (
        etiqueta
      )}
    </Button>
  );
}

export function SheetConfirmar({
  filas,
  responsables,
  responsableSinAvisos,
  onCerrar,
}: {
  /** La tanda, ya ordenada por `bandejaSinConfirmar()` y recortada al aseo pulsado. */
  filas: FilaDeOperacion[];
  /** `property_id` → nombre del responsable fijo, o `null` si no tiene. */
  responsables: Record<string, string | null>;
  /**
   * `property_id` → el responsable fijo de ese apartamento se quedó sin canal
   * (D-03, §11.3). Llega como mapa por apartamento y no como lista de aseadores
   * porque la línea `Queda asignado a {responsable}` de este panel se resuelve
   * por apartamento y NO tiene a mano el id del responsable: `responsables` solo
   * trae su nombre. El cruce lo hace el RSC, que sí tiene los dos lados.
   */
  responsableSinAvisos: Record<string, boolean>;
  onCerrar: () => void;
}) {
  const router = useRouter();

  // Ver la cabecera: la tanda se captura al montar y no se vuelve a leer de la
  // prop. El componente va con `key` de sesión, así que reabrir monta uno nuevo.
  const [tanda] = useState(() => filas);
  const total = tanda.length;

  const [indice, setIndice] = useState(0);
  const [confirmados, setConfirmados] = useState(0);
  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const [errorHuespedes, setErrorHuespedes] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');

  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    confirmarAseo,
    null,
  );

  const idHuespedes = useId();
  const idInstrucciones = useId();
  const idErrorHuespedes = useId();
  const idAyudaInstrucciones = useId();
  const idSinResponsable = useId();

  const campoHuespedes = useRef<HTMLInputElement>(null);
  // `useActionState` conserva el último resultado entre envíos. Sin esta marca,
  // cualquier re-render volvería a procesar el mismo éxito y avanzaría dos veces;
  // en desarrollo, además, React invoca los efectos por duplicado a propósito.
  const procesado = useRef<ResultadoAccion | null>(null);

  const aseo = tanda[indice];
  const esElUltimo = indice === total - 1;
  const responsable = aseo ? responsables[aseo.property_id] : null;
  const sinResponsable = !responsable;

  /**
   * §11.3. SOLO cambia lo que se PINTA; NO toca `sinResponsable`, que es lo
   * único que deshabilita el botón de este panel y sigue exactamente igual.
   *
   * La asimetría es la del contrato y conviene leerla despacio: sin responsable
   * la RPC lanza `P0001 sin_responsable` y confirmar es imposible, así que
   * bloquear es evitarle al admin un error seguro. Acá la RPC funciona y el aseo
   * queda asignado y correcto; lo único que no sale es el aviso, y bloquear
   * sería castigar al admin por el teléfono de otra persona (T-05-52).
   */
  const nombreDelMudo =
    aseo && responsable && responsableSinAvisos[aseo.property_id] === true ? responsable : null;

  /**
   * El cierre, con el ÚNICO toast de toda la tanda.
   *
   * `n` llega por parámetro y no se lee del estado: cuando la tanda termina sola,
   * quien llama acaba de calcular el contador definitivo y el `confirmados` de
   * esta clausura todavía es el anterior.
   *
   * Con cero confirmados no sale toast: abrir y cerrar sin tocar nada no es un
   * resultado que anunciar.
   */
  function finalizar(n: number) {
    if (n === total) {
      toast.success(`Listo: ${n} ${n === 1 ? 'aseo confirmado' : 'aseos confirmados'}.`);
    } else if (n > 0) {
      toast.success(`Confirmaste ${n} de ${total}. Los demás siguen en la bandeja.`);
    }

    // La action ya llamó a `revalidatePath`; esto pide el árbol de servidor YA
    // para que la bandeja quede con lo que de verdad falta.
    router.refresh();
    onCerrar();
  }

  /** Pasa al siguiente de la tanda, o cierra si este era el último. */
  function avanzar(confirmadosTrasEsto: number) {
    setFallo(null);
    setErrorHuespedes(null);
    setCampos(CAMPOS_VACIOS);

    if (esElUltimo) {
      finalizar(confirmadosTrasEsto);
      return;
    }
    setIndice((i) => i + 1);
  }

  useEffect(() => {
    if (!estado || estado === procesado.current) return;
    procesado.current = estado;

    if (!estado.ok) {
      // NO se avanza y NO se pierde lo tecleado: los dos campos son estado
      // controlado y siguen ahí. El mensaje ya viene traducido por `mapDbError()`
      // desde la action; acá no se interpreta ningún código de Postgres.
      setFallo(estado.error);
      return;
    }

    const n = confirmados + 1;
    setConfirmados(n);
    // El anuncio es lo que sustituye al toast por confirmación: quien ve la
    // pantalla tiene la barra de progreso, quien no la ve necesita esto (§16.3).
    setAnuncio(`Aseo ${n} de ${total} confirmado.`);
    avanzar(n);
    // `avanzar` y `confirmados` se leen en el mismo tick del resultado; la marca
    // `procesado` es la que garantiza una sola ejecución por respuesta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  // Al encadenar, el foco vuelve al campo de huéspedes y no se queda en el botón
  // que se acaba de pulsar (§16.3). En el primer render coincide con el
  // `autoFocus` del input y es idempotente.
  useEffect(() => {
    campoHuespedes.current?.focus();
  }, [indice]);

  /**
   * `Saltar este`: sigue con el resto SIN confirmar este.
   *
   * Sin esta salida, un aseo que la base rechaza (lo canceló el sync entre
   * medias, RLS, red) bloquea las doce que faltan, y el admin no tiene más
   * remedio que cerrar la tanda entera. El saltado se queda en la bandeja.
   */
  function saltar() {
    avanzar(confirmados);
  }

  function enviar(formData: FormData) {
    if (!huespedesValidos(campos.huespedes)) {
      setErrorHuespedes('Escribe cuántos huéspedes entraron. Es un número entero, mínimo 1.');
      campoHuespedes.current?.focus();
      return;
    }
    setErrorHuespedes(null);
    accion(formData);
  }

  // Defensa: una tanda vacía no debería poder abrirse desde la bandeja, pero
  // renderizar un panel sin aseo sería peor que no renderizar nada.
  if (!aseo) return null;

  const nombre = aseo.property?.nombre ?? 'Este apartamento';
  const progreso = total > 0 ? (confirmados / total) * 100 : 0;
  const etiquetaPrimario = fallo ? 'Reintentar' : esElUltimo ? 'Confirmar y cerrar' : 'Confirmar y seguir';

  return (
    <Sheet
      open
      onOpenChange={(abierto) => {
        // Botón `Cerrar`, `Esc` y clic fuera pasan todos por acá. Lo confirmado
        // NO se pierde jamás (D-10): ya está escrito en la base, aseo por aseo.
        // Lo único que se pierde es lo tecleado en el aseo actual, y eso va sin
        // diálogo de "¿seguro?": son dos campos, y un descarte encima de un
        // `Sheet` encima de una tanda de quince es una pila de tres.
        if (!abierto) finalizar(confirmados);
      }}
    >
      <SheetContent
        // El override tiene que repetir la cadena de variantes EXACTA. Ver la
        // cabecera de `components/ui/sheet.tsx`: `tailwind-merge` solo considera
        // en conflicto dos clases del mismo grupo con la misma cadena, así que un
        // `sm:max-w-sheet` suelto no desplazaría a la clase base de la primitiva,
        // hoy `data-[side=right]:sm:max-w-sheet-base` (384px, quick 260908-7w0).
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-sheet"
      >
        {/* `gap-sm` corrige el `gap-0.5` (2px) del registry, fuera de la escala. */}
        <SheetHeader className="gap-sm border-b border-border">
          {/* `font-semibold` pisa el `font-medium` (peso 500) del registry: el
              contrato declara exactamente dos pesos, 400 y 600. */}
          <SheetTitle className="font-semibold">Confirmar aseo</SheetTitle>

          <p className="text-micro tabular-nums text-muted-foreground">
            {indice + 1} de {total}
          </p>

          {/* Uso 6 del acento (§4.2): barra de avance de una tarea larga. */}
          <Progress value={progreso} className="gap-0" aria-label="Avance de la tanda" />
        </SheetHeader>

        <form action={enviar} className="flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto p-lg">
          <input type="hidden" name="aseo_id" value={aseo.id} />

          {/*
            Bloque de contexto. El código de acceso NO va acá (D-12): ver cabecera.
          */}
          <div className="flex flex-col gap-xs rounded-md bg-canvas p-lg">
            <p className="text-heading text-foreground">{nombre}</p>

            <p className="text-body text-muted-foreground">
              {formatFechaBog(aseo.scheduled_date)} · hora límite{' '}
              <span className="tabular-nums">{formatHoraLimite(aseo.hora_limite)}</span>
            </p>

            {sinResponsable ? (
              // La carencia la levanta TAMBIÉN la base: `confirm_cleaning` lanza
              // `P0001 sin_responsable`. La UI está evitando un error real, no
              // inventando una regla de negocio propia.
              <p id={idSinResponsable} className="text-body text-status-warn">
                Este apartamento no tiene responsable. Asígnalo antes de confirmar.{' '}
                <Link
                  href={`/apartamentos/${aseo.property_id}`}
                  className="transicion rounded-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Abrir la ficha de {nombre}
                </Link>
              </p>
            ) : (
              <p className="text-body text-foreground">Queda asignado a {responsable}</p>
            )}

            {/* Justo DEBAJO de la línea de arriba y dentro del mismo bloque de
                contexto (§11.3): el hecho pertenece a la persona que la línea
                anterior acaba de nombrar. No añade ningún paso a la tanda. */}
            {nombreDelMudo !== null && <AvisoAseadorSinPush nombre={nombreDelMudo} />}
          </div>

          {/*
            El fallo va ENCIMA de los campos y dentro del `Sheet`, no en un toast:
            el toast vive fuera del foco atrapado y quien navega por teclado no lo
            encuentra (§15.3).
          */}
          {fallo && (
            <Alert variant="destructive">
              <AlertTitle>No se pudo confirmar este aseo</AlertTitle>
              <AlertDescription>{fallo}</AlertDescription>
            </Alert>
          )}

          <Field data-invalid={Boolean(errorHuespedes) || undefined}>
            <FieldLabel htmlFor={idHuespedes}>Número de huéspedes</FieldLabel>
            {/*
              `type="text"` con `inputMode="numeric"` y no `type="number"`: el
              spinner del número invita a rueda del mouse y a flechas sobre un
              dato que se teclea una vez, y en muchos navegadores acepta `e`, `+`
              y `-`. La validación de entero >= 1 la hace `huespedesValidos()`.
            */}
            <Input
              id={idHuespedes}
              ref={campoHuespedes}
              name="huespedes"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              required
              value={campos.huespedes}
              onChange={(e) => setCampos((c) => ({ ...c, huespedes: e.target.value }))}
              aria-invalid={Boolean(errorHuespedes) || undefined}
              aria-describedby={errorHuespedes ? idErrorHuespedes : undefined}
            />
            {errorHuespedes && <FieldError id={idErrorHuespedes}>{errorHuespedes}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor={idInstrucciones}>Instrucciones</FieldLabel>
            <Textarea
              id={idInstrucciones}
              name="instrucciones"
              rows={3}
              value={campos.instrucciones}
              onChange={(e) => setCampos((c) => ({ ...c, instrucciones: e.target.value }))}
              aria-describedby={idAyudaInstrucciones}
            />
            <FieldDescription id={idAyudaInstrucciones}>
              Lo que el aseador va a leer antes de empezar. Opcional.
            </FieldDescription>
          </Field>

          {/*
            Pie: `Cerrar` en outline a la izquierda y el primario a la derecha.
            Nunca dos rellenos adyacentes (02-UI-SPEC.md §4.6).
          */}
          <SheetFooter className="flex-row items-center justify-between gap-md border-t border-border px-0 pb-0">
            <Button type="button" variant="outline" size="lg" onClick={() => finalizar(confirmados)}>
              Cerrar
            </Button>

            <div className="flex items-center gap-md">
              {/*
                `Saltar este` aparece en los DOS callejones sin salida de la tanda:
                un fallo de la base, y un apartamento sin responsable. El segundo
                no lo pide el contrato, pero sin él una unidad sin responsable
                bloquea las doce que faltan igual que un aseo roto, y la salida que
                le quedaría al admin sería cerrar la tanda entera.
              */}
              {(fallo || sinResponsable) && (
                <Button type="button" variant="outline" size="lg" onClick={saltar}>
                  Saltar este
                </Button>
              )}

              {sinResponsable ? (
                // El `<span>` NO es decorativo: un elemento con `disabled` no
                // emite eventos de puntero, así que un tooltip colgado directo de
                // él nunca se abriría. Mismo patrón que la barra de acciones del
                // formulario de apartamento.
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span>
                        <BotonConfirmar etiqueta={etiquetaPrimario} bloqueado />
                      </span>
                    }
                  />
                  <TooltipContent>
                    Este apartamento no tiene responsable. Asígnalo antes de confirmar.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <BotonConfirmar etiqueta={etiquetaPrimario} bloqueado={false} />
              )}
            </div>
          </SheetFooter>
        </form>

        {/*
          NO hay un toast por confirmación: quince toasts seguidos tapan la
          pantalla. Esta región es su sustituto para quien no ve la barra de
          progreso. Va SIEMPRE en el DOM, también vacía: un `aria-live` que
          aparece a la vez que su contenido no se anuncia de forma fiable.
        */}
        <span aria-live="polite" className="sr-only">
          {anuncio}
        </span>
      </SheetContent>
    </Sheet>
  );
}
