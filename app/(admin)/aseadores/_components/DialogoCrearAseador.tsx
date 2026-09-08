'use client';

import { Check, Copy, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { toast } from 'sonner';

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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

import {
  crearAseador,
  generarPassword,
  type ResultadoCrearAseador,
} from '../_actions';

/**
 * Alta de aseador (ASEADOR-01, UI-SPEC §11.2).
 *
 * LA PROPIEDAD QUE MANDA SOBRE TODAS LAS DEMÁS: al crear con éxito el diálogo NO
 * SE CIERRA. Pasa al estado de entrega, porque la contraseña no se puede
 * recuperar después: no se persiste en ninguna parte y en esta fase no hay flujo
 * de recuperación. Cerrar el diálogo al terminar sería perder la credencial.
 *
 * Accesibilidad: el foco atrapado, el cierre con `Esc` y la devolución del foco al
 * disparador los da Base UI (UI-SPEC §13). NO se reimplementan aquí.
 */

/** Lo que la action devuelve cuando el alta salió bien. */
type Entrega = { nombre: string; email: string; password: string };

/**
 * Botón primario en vuelo (§9.3): spinner + label en gerundio, y `min-width` para
 * que no salte de ancho al cambiar de `Crear aseador` a `Creando…`.
 *
 * Vive en su propio componente porque `useFormStatus` lee el estado del `<form>`
 * ANCESTRO: llamado desde el mismo componente que renderiza el form devolvería
 * siempre `pending: false`.
 */
function BotonCrear() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="min-w-boton-alta">
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Creando…
        </>
      ) : (
        'Crear aseador'
      )}
    </Button>
  );
}

/**
 * Fila `etiqueta · valor · Copiar` del estado de entrega.
 *
 * Al copiar, el icono pasa a `Check` durante 1,5 s y el resultado se anuncia por
 * el `aria-live` del padre: un cambio de icono es invisible para un lector de
 * pantalla, y la confirmación de copiado es uno de los tres casos donde §13 exige
 * `aria-live="polite"`.
 */
function FilaCopiable({
  etiqueta,
  valor,
  onCopiado,
}: {
  etiqueta: string;
  valor: string;
  onCopiado: (mensaje: string) => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sin esto, desmontar el diálogo antes de que venzan los 1,5 s deja un
  // `setState` sobre un componente que ya no existe.
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  async function copiar() {
    try {
      // `navigator.clipboard` no existe en contexto no seguro (http sin
      // localhost). Si falla, NO se pinta el `Check`: decirle al admin que copió
      // algo que no está en el portapapeles es peor que no ofrecer el botón.
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      onCopiado(`${etiqueta} copiado al portapapeles`);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiado(false), 1500);
    } catch {
      onCopiado(`No se pudo copiar ${etiqueta.toLowerCase()}. Selecciónalo y cópialo a mano.`);
    }
  }

  return (
    <div className="flex items-center justify-between gap-md">
      <span className="text-micro text-muted-foreground">{etiqueta}</span>
      <div className="flex items-center gap-sm">
        {/* `font-mono` solo en la contraseña no: el email tampoco debe romper por
            ligaduras cuando alguien lo dicta. Ambos van en la misma familia. */}
        <span className="font-mono text-body text-foreground" data-slot="valor-entrega">
          {valor}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copiar}
          aria-label={`Copiar ${etiqueta.toLowerCase()}`}
        >
          {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          Copiar
        </Button>
      </div>
    </div>
  );
}

export function DialogoCrearAseador() {
  const router = useRouter();

  const [abierto, setAbierto] = useState(false);
  const [entrega, setEntrega] = useState<Entrega | null>(null);

  // LOS CUATRO CAMPOS SON CONTROLADOS, Y NO ES UNA PREFERENCIA DE ESTILO.
  // Medido: React 19 RESETEA un `<form action={...}>` no controlado en cuanto la
  // action responde. Con inputs sin controlar, un `email_exists` dejaba el
  // formulario en blanco y el admin tenía que volver a teclear nombre, email y
  // teléfono para corregir una letra del email. §9.4 exige justo lo contrario:
  // "el formulario CONSERVA todo lo escrito". Lo atrapó `aseadores-alta.spec.ts`.
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [generando, setGenerando] = useState(false);
  const [anuncio, setAnuncio] = useState('');

  const [estado, accion] = useActionState<ResultadoCrearAseador | null, FormData>(
    crearAseador,
    null,
  );

  const idNombre = useId();
  const idEmail = useId();
  const idTelefono = useId();
  const idPassword = useId();
  const idError = useId();

  // El éxito NO cierra: cambia de estado. `estado` es un objeto nuevo por envío,
  // así que la dependencia dispara una vez por respuesta.
  useEffect(() => {
    if (!estado) return;
    if (estado.ok) {
      setEntrega(estado.entrega);
      toast.success(estado.mensaje);
      return;
    }
    // Con `campo` el error ya se pinta inline bajo ese input; duplicarlo en un
    // toast sería decir dos veces lo mismo. Sin `campo` es un error de la
    // operación completa y ahí sí va a toast destructivo (UI-SPEC §9.4).
    if (!estado.campo) toast.error(estado.error);
  }, [estado]);

  function alCambiarApertura(siguiente: boolean) {
    setAbierto(siguiente);
    if (!siguiente) {
      // Al cerrar se limpia TODO. La contraseña entregada no puede sobrevivir en
      // el estado de un componente montado para el siguiente alta.
      setEntrega(null);
      setNombre('');
      setEmail('');
      setTelefono('');
      setPassword('');
      setAnuncio('');
      // La action ya hizo `revalidatePath('/aseadores')`; esto fuerza a que el
      // árbol de servidor se vuelva a pedir ya, para que la fila nueva esté en la
      // tabla en cuanto el diálogo desaparece.
      router.refresh();
    }
  }

  async function alGenerar() {
    setGenerando(true);
    try {
      setPassword(await generarPassword());
    } finally {
      setGenerando(false);
    }
  }

  // Se extraen a constantes en vez de consultarlas con un helper: TypeScript
  // estrecha la unión discriminada a través de `hayError` (que es un `const`
  // sobre el discriminante), pero NO a través de una función que devuelva
  // booleano. Con un helper, cada uso de `estado.error` sería un error de tipos.
  const hayError = estado?.ok === false;
  const campoConError = hayError ? estado.campo : undefined;
  const mensajeError = hayError ? estado.error : '';
  const errorDe = (campo: string) => campoConError === campo;

  return (
    <Dialog open={abierto} onOpenChange={alCambiarApertura}>
      <DialogTrigger render={<Button type="button">Crear aseador</Button>} />

      <DialogContent className="sm:max-w-dialogo">
        {entrega ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-sm">
                <Check className="text-status-ok" aria-hidden="true" />
                Cuenta creada para {entrega.nombre}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Credenciales de la cuenta recién creada.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-md">
              <FilaCopiable
                etiqueta="Email"
                valor={entrega.email}
                onCopiado={setAnuncio}
              />
              <FilaCopiable
                etiqueta="Contraseña"
                valor={entrega.password}
                onCopiado={setAnuncio}
              />
            </div>

            <p className="text-micro text-status-warn">
              Esta contraseña no se vuelve a mostrar. Entrégasela ahora.
            </p>

            <DialogFooter>
              <DialogClose render={<Button type="button">Listo</Button>} />
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Crear aseador</DialogTitle>
              <DialogDescription className="text-micro text-muted-foreground">
                El aseador no puede registrarse por su cuenta. Esta cuenta la creas
                tú y le entregas la contraseña.
              </DialogDescription>
            </DialogHeader>

            <form action={accion} className="flex flex-col gap-lg" noValidate>
              <Field>
                <FieldLabel htmlFor={idNombre}>Nombre</FieldLabel>
                <Input
                  id={idNombre}
                  name="full_name"
                  autoComplete="off"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  aria-invalid={errorDe('full_name') || undefined}
                  aria-describedby={
                    errorDe('full_name') ? `${idError}-full_name` : undefined
                  }
                />
                {errorDe('full_name') && (
                  <FieldError id={`${idError}-full_name`}>{mensajeError}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor={idEmail}>Email</FieldLabel>
                <Input
                  id={idEmail}
                  name="email"
                  type="email"
                  autoComplete="off"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={errorDe('email') || undefined}
                  aria-describedby={errorDe('email') ? `${idError}-email` : undefined}
                />
                {/* `email_exists` llega con `campo: 'email'` desde la action, así
                    que el "ya existe una cuenta" se pinta AQUÍ y no en un toast:
                    es un error de campo y el admin tiene que corregir este input
                    (UI-SPEC §9.4). */}
                {errorDe('email') && (
                  <FieldError id={`${idError}-email`}>{mensajeError}</FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor={idTelefono}>Teléfono</FieldLabel>
                <Input
                  id={idTelefono}
                  name="phone"
                  type="tel"
                  autoComplete="off"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor={idPassword}>Contraseña temporal</FieldLabel>
                <div className="flex items-center gap-sm">
                  <Input
                    id={idPassword}
                    name="password"
                    // DE SOLO LECTURA A PROPÓSITO: la contraseña se genera en el
                    // servidor, así que el valor que se muestra es exactamente el
                    // que se va a guardar. Un campo editable permitiría teclear
                    // algo distinto de lo que se entrega, o una credencial débil.
                    readOnly
                    required
                    value={password}
                    autoComplete="off"
                    className="font-mono"
                    aria-invalid={errorDe('password') || undefined}
                    aria-describedby={
                      errorDe('password') ? `${idError}-password` : undefined
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={alGenerar}
                    disabled={generando}
                  >
                    {generando ? (
                      <>
                        <Loader2 className="animate-spin" aria-hidden="true" />
                        Generando…
                      </>
                    ) : (
                      'Generar'
                    )}
                  </Button>
                </div>
                {errorDe('password') && (
                  <FieldError id={`${idError}-password`}>{mensajeError}</FieldError>
                )}
              </Field>

              <DialogFooter>
                <DialogClose
                  render={
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  }
                />
                <BotonCrear />
              </DialogFooter>

              {/* Error de la OPERACIÓN (sin `campo`): va a toast según §9.4, pero
                  también se deja visible en el diálogo, porque el toast vive
                  fuera del foco atrapado y quien navega por teclado no lo
                  encuentra. El formulario conserva todo lo escrito. */}
              {hayError && !campoConError && <FieldError>{mensajeError}</FieldError>}
            </form>
          </>
        )}

        {/* §13: la confirmación de copiado es uno de los tres casos que exigen
            `aria-live="polite"`. Está fuera del condicional para que la región ya
            exista en el DOM cuando llegue el anuncio; un `aria-live` que aparece
            al mismo tiempo que su contenido no se anuncia de forma fiable. */}
        <span aria-live="polite" className="sr-only">
          {anuncio}
        </span>
      </DialogContent>
    </Dialog>
  );
}
