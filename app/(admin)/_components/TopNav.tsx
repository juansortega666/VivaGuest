'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cerrarSesion } from '@/app/_actions/sesion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { CirculoIniciales } from './CirculoIniciales';

/**
 * Barra superior del admin (UI-SPEC §6.1).
 *
 * Es Client Component por UNA sola razon: `usePathname()`, que es lo que decide
 * cual de los cuatro links esta activo. El resto del shell se queda en servidor. La
 * alternativa (convertir `layout.tsx` entero en cliente) arrastraria al bundle el
 * guard y la fabrica de Supabase de servidor, que ni siquiera pueden viajar al
 * navegador porque declaran `server-only`.
 */

/**
 * Los CUATRO links del admin, en este orden (07-UI-SPEC.md §5.1).
 *
 * ── LA FASE 7 ANADE `Finanzas`, Y VA ULTIMO ────────────────────────────────
 * El orden es de frecuencia de uso y la operacion del dia manda: el dinero se
 * consulta, no se coordina. Ponerlo primero desplazaria a la derecha la pantalla
 * de trabajo, que es la que el admin abre decenas de veces al dia.
 *
 * Y va aqui, en la barra principal, y no dentro de `Operacion`, porque D7-1
 * decide que el dinero vive en su propia seccion: la pantalla operativa se
 * comparte, y con ella se compartirian los margenes.
 *
 * La logica de activacion de abajo ya marca el link en todas las subrutas
 * (`/finanzas/aseos`, `/finanzas/pagos`, `/finanzas/aseadoras/[id]`), asi que no
 * hubo que tocarla.
 *
 * ── EL CONTRATO ANTERIOR, QUE SIGUE VIGENTE EN TODO LO DEMAS ───────────────
 * Lo que la Fase 4 dejo escrito sobre los tres primeros (04-UI-SPEC.md §6.3):
 *
 * ── SUPERSEDE DE `02-UI-SPEC.md` §6.1 ───────────────────────────────────────
 * Aquel contrato anticipaba que la Fase 4 anadiria `Dia`, `Sin confirmar` y
 * `Alertas`, y se escribio ANTES de D-01. D-01 fija una sola ruta para todo el
 * dashboard operativo, asi que esos tres links apuntarian los tres a la misma
 * pantalla: tres links muertos. Lo que la Fase 4 anade es UNO, `Operacion`.
 *
 * Va primero porque es la pantalla de trabajo, y es tambien el destino del
 * wordmark y el aterrizaje del admin tras el login (`RAIZ.admin` en
 * `lib/auth/routing.ts`).
 *
 * Sigue en pie la regla de la Fase 2: no se anaden aqui links de fases futuras.
 * Un link muerto o deshabilitado promete navegacion que no existe.
 */
const ENLACES = [
  { href: '/operacion', etiqueta: 'Operación' },
  { href: '/apartamentos', etiqueta: 'Apartamentos' },
  { href: '/aseadores', etiqueta: 'Aseadores' },
  { href: '/finanzas', etiqueta: 'Finanzas' },
] as const;

export function TopNav({ nombre }: { nombre: string }) {
  const ruta = usePathname();

  return (
    <header className="sticky top-0 z-40 h-barra border-b border-border bg-background">
      <nav
        aria-label="Navegación principal"
        className="mx-auto flex h-full w-full max-w-admin items-center gap-xl px-xl"
      >
        {/*
          El wordmark va en `--foreground`, nunca en el color de marca: §4.4 deja
          el wordmark explicitamente FUERA de la lista cerrada del acento. Poppins
          (`font-brand`) si es correcta aqui, porque el logotipo es uno de los tres
          momentos de marca del contrato.

          Sin logo, a proposito: pintar un placeholder de identidad es exactamente
          lo que haria doloroso el rebrand.
        */}
        <Link
          href="/operacion"
          className="transicion font-brand text-heading text-foreground hover:opacity-80"
        >
          VivaGuest
        </Link>

        {/* gap-xs = 4px entre links (§6.1). */}
        <ul className="flex h-full items-stretch gap-xs">
          {ENLACES.map(({ href, etiqueta }) => {
            // Activo tambien en las subrutas: `/apartamentos/nuevo` sigue siendo
            // la seccion Apartamentos. Sin esto, el usuario pierde de vista en que
            // parte del panel esta en cuanto abre una ficha.
            const activo = ruta === href || ruta.startsWith(`${href}/`);

            return (
              <li key={href} className="flex items-stretch">
                {/*
                  El link ocupa toda la altura de la barra para que su
                  `border-bottom` de 2px quede pegado al borde inferior, como pide
                  §6.1. El alto de 40px del contrato es el area de interaccion
                  visual, que se consigue con el padding vertical implicito de
                  `items-center` dentro de los 56px.
                */}
                <Link
                  href={href}
                  aria-current={activo ? 'page' : undefined}
                  className={cn(
                    'transicion flex h-full items-center border-b-2 px-md text-body',
                    activo
                      ? 'border-primary font-semibold text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {etiqueta}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger className="transicion flex items-center gap-sm rounded-md px-sm py-xs text-body text-foreground hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {/*
                El circulo vive en `CirculoIniciales` desde la Fase 7: el bloque
                por aseadora, la ficha y la tabla de pagos pintan el mismo, y
                cuatro copias se desincronizan en el primer retoque.
              */}
              <CirculoIniciales nombre={nombre} />
              <span>{nombre}</span>
              <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-auto min-w-40">
              {/*
                La accion va en un <form> de verdad y no en un `onClick`: cerrar
                sesion no necesita ni un gramo de JavaScript de cliente, y asi
                funciona igual si el bundle todavia no hidrato.

                `closeOnClick={false}` no es cosmetico: con el default, Base UI
                desmonta el popup en el mismo click, y desmontar el <form> antes de
                que el navegador procese el submit es una carrera que a veces se
                pierde y deja al usuario dentro sin ninguna senal de error. El
                `redirect` de la action se lleva la pantalla igual, asi que no hay
                menu abierto que cerrar.
              */}
              <form action={cerrarSesion}>
                <DropdownMenuItem
                  variant="destructive"
                  closeOnClick={false}
                  nativeButton
                  render={<button type="submit" />}
                  className="w-full"
                >
                  <LogOut className="size-4" strokeWidth={2} aria-hidden="true" />
                  Cerrar sesión
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}
