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
      className="w-full"
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
            className="pr-9"
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
            className="absolute inset-y-0 right-1 my-auto"
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
