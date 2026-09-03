"use client"

/**
 * Sheet — generado por `npx shadcn@4.19.1 add sheet` (04-UI-SPEC.md §1.1).
 *
 * El archivo se deja REGENERABLE a proposito: lo unico que se toco respecto a
 * la salida del CLI es traducir el `sr-only` del boton de cierre a `Cerrar`,
 * porque la interfaz es en espanol y el CLI no traduce.
 *
 * Las otras tres desviaciones del contrato de la fase NO se arreglan aqui, se
 * arreglan en el sitio de uso. La razon esta medida y va escrita para que en
 * tres meses nadie lo lea como un olvido:
 *
 * 1. `SheetTitle` trae `font-medium` (peso 500) y el contrato de tipografia
 *    declara exactamente dos pesos, 400 y 600 (02-UI-SPEC.md §3). No se corrige
 *    en la primitiva porque `font-medium` esta en las QUINCE primitivas ya
 *    instaladas (dialog, alert-dialog, button, badge, label, card, table, field,
 *    alert, popover, progress, input-group, command, dropdown-menu, input) y la
 *    Fase 2 no lo quito de ninguna. Arreglar solo `sheet` dejaria el unico
 *    `Sheet` de la app en 600 y los cinco `Dialog`/`AlertDialog` de la misma
 *    pantalla en 500, que es peor que la inconsistencia actual.
 *    Uso correcto:  <SheetTitle className="font-semibold">
 *    Funciona porque `cn()` (tailwind-merge) resuelve `font-medium` contra
 *    `font-semibold`: mismo grupo y sin prefijo de variante.
 *
 * 2. `SheetContent` trae `data-[side=right]:w-3/4` y
 *    `data-[side=right]:sm:max-w-sm` (384px), y D-09 pide 480px.
 *    Uso correcto:  <SheetContent className="data-[side=right]:sm:max-w-sheet
 *                                            data-[side=right]:w-full">
 *    El prefijo de variante tiene que repetirse EXACTO. `tailwind-merge` solo
 *    considera en conflicto dos clases del mismo grupo con la MISMA cadena de
 *    variantes: un `sm:max-w-sheet` suelto no desplaza a
 *    `data-[side=right]:sm:max-w-sm`, las dos sobreviven y gana la de mayor
 *    especificidad en un orden de CSS que no esta garantizado.
 *
 * 3. `SheetHeader` trae `gap-0.5` (2px), fuera de la escala de espaciado, cuyo
 *    minimo declarado es `xs` = 4px; el `DialogHeader` instalado usa `gap-2`.
 *    Misma naturaleza que el punto 1 y se resuelve igual.
 *    Uso correcto:  <SheetHeader className="gap-sm">
 */

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Cerrar</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
