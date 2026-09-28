'use client';

import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ResultadoAccion } from '@/lib/domain/acciones';

import { entrar } from '../_actions';

/**
 * Boton de envio. Vive en su propio componente porque `useFormStatus` lee el
 * estado del `<form>` ANCESTRO: llamado desde el mismo componente que renderiza
 * el form, siempre devolveria `pending: false`.
 */
function BotonEntrar() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      // Deshabilitado Y con spinner, nunca solo deshabilitado: un boton apagado
      // sin senal de progreso es un estado muerto invisible (UI-SPEC §9.3).
      disabled={pending}
      // El label cambia de `Entrar` a `Entrando…`, que es mas ancho. Aqui NO hace
      // falta el `min-width` que pide §9.3: el boton es de ancho completo, asi que
      // su ancho no depende del contenido y el cambio de label no puede hacerlo
      // saltar. Poner un `min-w-[…]` seria ademas un valor arbitrario de
      // espaciado, que §2 prohibe fuera de la escala de tokens.
      //
      // `ring-ring/70` es el HALLAZGO 4 de la auditoria del 2026-09-22, rescatado
      // el 2026-09-28. Sube de /50 a /70 por medicion y no por gusto: el anillo se
      // pinta FUERA del borde, y lo que decide si el foco se ve es el contraste de
      // esos MISMOS pixeles entre el estado con foco y el estado sin el (WCAG 2.2
      // SC 2.4.13, que pide 3:1). Medido sobre la superficie clara del login:
      //     /50 -> #8ea6eb, 2.39:1   (no llega)
      //     /65 -> #6c8ce6, 3.22:1   (justo en el umbral)
      //     /70 -> #6083e4, 3.58:1   (elegida; sobre el producto, 3.57:1)
      // Quien desplaza el /50 de la primitiva NO es la cascada, es `cn()`: las dos
      // clases caen en el mismo grupo de `tailwind-merge` con el mismo modificador,
      // asi que la local gana y la de la primitiva desaparece del DOM.
      // La primitiva se queda en /50 para todo el producto: la decision del dueno
      // del 2026-09-22 es no tocarla, y esta pantalla es la que se audito.
      className="w-full focus-visible:ring-ring/70"
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Entrando…
        </>
      ) : (
        'Entrar'
      )}
    </Button>
  );
}

/**
 * Formulario de acceso (PLAT-01, PLAT-02).
 *
 * `useActionState` y no react-hook-form: son dos campos sin validacion cruzada.
 * RHF se reserva para el formulario largo de apartamento (research §Patron 3).
 *
 * Lo que NO lleva, y no es un olvido: no hay "Crear cuenta" porque el
 * auto-registro esta cerrado en GoTrue (`enable_signup = false`) y las cuentas
 * las crea el administrador; no hay OAuth; no hay "Recordarme" (la sesion ya
 * persiste); y el aviso de contrasena olvidada NO es un link, porque en esta fase
 * no existe flujo de recuperacion y un link muerto es peor que ninguno.
 */
export function FormularioLogin() {
  const [estado, accion] = useActionState<ResultadoAccion | null, FormData>(
    entrar,
    null,
  );
  const [verContrasena, setVerContrasena] = useState(false);

  const idEmail = useId();
  const idPassword = useId();
  const idError = useId();

  const hayError = estado?.ok === false;
  const errorDeEmail = hayError && estado.campo === 'email';
  const errorDePassword = hayError && estado.campo === 'password';
  // Un error sin `campo` es de la operacion completa (credenciales, cuenta
  // desactivada, rate limit): se pinta bajo el boton, no colgando de un input.
  const errorGeneral = hayError && !estado.campo;

  return (
    <form action={accion} className="flex flex-col gap-lg" noValidate>
      <Field>
        <FieldLabel htmlFor={idEmail}>Email</FieldLabel>
        <Input
          id={idEmail}
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          aria-invalid={errorDeEmail || undefined}
          aria-describedby={errorDeEmail ? `${idError}-email` : undefined}
          // Parche local (rescatado el 2026-09-28) de un defecto de cascada de
          // `components/ui/input.tsx`. Alli `aria-invalid:ring-destructive/20` va
          // DESPUES de `focus-visible:ring-ring/50` en la misma cadena y con la
          // misma especificidad, asi que gana la ultima: un campo con error NO
          // cambia NADA al recibir el foco, que es exactamente el estado en que
          // queda el formulario despues de un login fallido. Medido el 2026-09-22
          // en el navegador: invalido-sin-foco e invalido-con-foco pintaban el
          // mismo anillo #ecd0d7, delta-E OKLab entre los dos estados = 0,
          // literalmente el mismo pixel.
          //
          // Por que el parche esta AQUI y no en la primitiva: decision del dueno
          // del 2026-09-22, `components/ui/input.tsx` no se toca.
          //
          // Por que funciona: `aria-invalid` mas `focus-visible` suma una
          // pseudo-clase sobre la cadena de la primitiva, asi que gana por
          // ESPECIFICIDAD y no por orden, y no cambia nada fuera de esta pantalla.
          //
          // El borde se queda en `--destructive`, porque lo que se recupera es el
          // FOCO, no el error: el error lo siguen comunicando el borde rojo y el
          // texto del `FieldError`. Un parche que pintara el campo entero del color
          // del foco perderia el estado de error.
          //
          // Y el /70 es el HALLAZGO 4, medido el 2026-09-22: a /50 el anillo daba
          // 2.39:1 (#8ea6eb), por debajo del 3:1 de WCAG 2.2 SC 2.4.13; a /65,
          // 3.22:1 (#6c8ce6); a /70, 3.58:1 (#6083e4). La salida alternativa
          // —darlo por cumplido porque el borde ya cambia— queda descartada CON
          // numero: el borde pasa de #858d9a a #1d4ed8, que son 2:1 entre si.
          className="focus-visible:ring-ring/70 aria-invalid:focus-visible:ring-ring/70"
        />
        {errorDeEmail && <FieldError id={`${idError}-email`}>{estado.error}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor={idPassword}>Contraseña</FieldLabel>
        <div className="relative">
          <Input
            id={idPassword}
            name="password"
            type={verContrasena ? 'text' : 'password'}
            autoComplete="current-password"
            required
            aria-invalid={errorDePassword || undefined}
            aria-describedby={errorDePassword ? `${idError}-password` : undefined}
            // Mismo parche local del campo de email y mismo /70 del hallazgo 4,
            // por las mismas razones: ver el comentario largo de arriba. `pr-9` es
            // lo de siempre, el hueco del boton del ojo, y se queda.
            className="pr-9 focus-visible:ring-ring/70 aria-invalid:focus-visible:ring-ring/70"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            // El icono va solo, sin texto: necesita nombre accesible propio
            // (UI-SPEC §13). `aria-hidden` en el svg para no leerlo dos veces.
            aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={verContrasena}
            onClick={() => setVerContrasena((v) => !v)}
            // Mismo /70 del hallazgo 4: es un control enfocable mas de esta
            // pantalla y su anillo se pinta sobre la misma superficie clara. No
            // lleva la variante `aria-invalid:`, y no es un olvido: `aria-invalid`
            // solo lo pone el formulario sobre los campos, nunca sobre un boton.
            className="absolute inset-y-0 right-1 my-auto focus-visible:ring-ring/70"
          >
            {verContrasena ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
          </Button>
        </div>
        {errorDePassword && (
          <FieldError id={`${idError}-password`}>{estado.error}</FieldError>
        )}
      </Field>

      <div className="flex flex-col gap-sm">
        <BotonEntrar />
        {errorGeneral && <FieldError>{estado.error}</FieldError>}
        <p className="text-micro text-muted-foreground">
          ¿Olvidaste la contraseña? Pídele al administrador que te la restablezca.
        </p>
      </div>
    </form>
  );
}
