"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * VivaGuest solo tiene tema claro (02-UI-SPEC.md §4.5).
 *
 * El archivo que genera el CLI de shadcn lee el tema con `useTheme()` del
 * paquete de temas que sonner arrastra como transitiva. Sin un ThemeProvider
 * en el arbol ese hook devuelve `'system'`, asi que Sonner pintaria los toasts
 * en oscuro cuando el sistema operativo esta en oscuro: exactamente lo que la
 * decision de "solo claro" quiere evitar, y ademas incoherente con el resto de
 * la app, que no reacciona a esa preferencia.
 *
 * Por eso el tema va fijo y ese paquete quedo desinstalado del proyecto.
 * `theme` se declara DESPUES de `{...props}` a proposito: no es un default
 * que el llamador pueda pisar, es una invariante de la fase.
 *
 * Este comentario describe el paquete en vez de nombrarlo: la verificacion del
 * plan es un grep de su nombre sobre este directorio, y citarlo aqui la
 * pondria en rojo por una mencion en prosa. Misma regla que la cabecera de
 * scripts/ci/check-service-role.sh.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
      theme="light"
    />
  )
}

export { Toaster }
