'use client';

import { ChevronDown, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useState, useTransition, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ApartamentoDelFiltro, FiltroDeTipo } from '@/lib/data/finanzas-detalle';
import { normalizar } from '@/lib/domain/properties';
import { cn } from '@/lib/utils';

/**
 * LOS TRES FILTROS DEL DETALLE (07-UI-SPEC §7.2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LOS TRES VIVEN EN LA DIRECCION DE LA PAGINA, Y NO EN ESTADO DE CLIENTE.
 *
 * No es preferencia: cambian **QUE FILAS LEE EL SERVIDOR**. Un filtro que vive en
 * estado de cliente no se puede enlazar, no sobrevive a un refresco, no se puede
 * mandar por chat y obliga a traerse al navegador todas las filas del periodo
 * para esconder la mayoria. Es la regla que el panel de alertas ya dejo escrita
 * un plan antes.
 *
 * ── EL PERIODO NO SE VUELVE A DECLARAR AQUI ──────────────────────────────
 *
 * Llega heredado en la direccion y se muestra como texto en la cabecera, con el
 * enlace de volver al resumen para cambiarlo. Un segundo control de periodo en la
 * hija seria un sitio mas donde el admin puede acabar mirando un rango distinto
 * del que pidio, y entrar al detalle no puede cambiar el contexto.
 *
 * Por eso `ir()` PARTE DE LOS PARAMETROS ACTUALES y solo pisa el suyo: construir
 * la direccion desde cero borraria el rango y el ancla heredados.
 *
 * ── POR QUE ESTE COMPONENTE ENVUELVE LA TABLA ────────────────────────────
 *
 * Misma decision estructural que el filtro de periodo del Resumen, y por la misma
 * razon: al cambiar de filtro **no hay esqueleto ni indicador de espera**. Las
 * filas viejas se quedan visibles y atenuadas mientras llegan las nuevas. Cambiar
 * de `Con gastos` a `Con danos` no es ir a otra pantalla, es la misma con otras
 * filas, y sustituirlas por bloques grises pierde justo lo que el admin esta
 * haciendo.
 *
 * La tabla sigue siendo un componente de servidor: entra como hijos ya
 * renderizados y lo unico que viaja al navegador es esta barra.
 *
 * ── LOS CONTROLES NO SE INHABILITAN MIENTRAS CARGA ───────────────────────
 *
 * Es un estado muerto invisible: el admin toca `Con danos`, no pasa nada, y
 * vuelve a tocar. El segmentado sigue respondiendo y la opcion recien tocada ya
 * se ve activa aunque las filas todavia sean las viejas.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Los tres botones segmentados, con el copy exacto de §15.2 y en su orden. */
const TIPOS: { valor: FiltroDeTipo; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'con-gastos', etiqueta: 'Con gastos' },
  { valor: 'con-danos', etiqueta: 'Con daños' },
];

/** Lo que el desplegable de aseador necesita. Es la forma que ya devuelve el repo. */
export type AseadorDelFiltro = {
  id: string;
  full_name: string;
};

/**
 * El valor del desplegable cuando no hay nadie elegido.
 *
 * La primitiva de seleccion NO admite la cadena vacia como valor de una opcion:
 * la usa internamente para "sin elegir", asi que una opcion con valor vacio no se
 * puede seleccionar nunca. Se usa un centinela y se traduce en `ir()`.
 */
const TODOS = '__todos__';

export function FiltrosDeAseos({
  apartamentos,
  aseadores,
  apartamentoId,
  aseadorId,
  tipo,
  children,
}: {
  /** Solo unidades gestionadas. Las de gestion externa no existen aqui (FIN-05). */
  apartamentos: ApartamentoDelFiltro[];
  aseadores: AseadorDelFiltro[];
  apartamentoId: string | null;
  aseadorId: string | null;
  tipo: FiltroDeTipo;
  /** La tabla, o su estado vacio, ya renderizados por el servidor. */
  children: ReactNode;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [pendiente, empezar] = useTransition();
  const [buscador, setBuscador] = useState(false);

  const idApartamento = useId();
  const idEtiquetaApartamento = useId();
  const idAseador = useId();
  const idEtiquetaAseador = useId();

  /**
   * Navega conservando lo que esta barra no gobierna.
   *
   * El rango y el ancla del periodo viven en la misma direccion y llegan
   * heredados del Resumen: reconstruir la direccion desde cero los borraria y
   * elegir un apartamento devolveria al admin al mes por defecto.
   *
   * Un valor nulo BORRA su parametro en vez de escribir una cadena vacia: la
   * ausencia del parametro es lo que la pagina lee como «todos», y `?aseador=`
   * no es lo mismo que no tener `aseador`.
   */
  function ir(cambios: Record<string, string | null>) {
    const busqueda = new URLSearchParams(parametros.toString());

    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null) busqueda.delete(clave);
      else busqueda.set(clave, valor);
    }

    empezar(() => {
      // Sin desplazar: es la misma pantalla con otras filas, y saltar arriba en
      // cada cambio haria perder el sitio.
      router.push(`${ruta}?${busqueda.toString()}`, { scroll: false });
    });
  }

  const elegido = apartamentos.find((a) => a.id === apartamentoId) ?? null;

  // Hay filtro activo cuando alguno de los TRES se aparta de su defecto. El
  // periodo NO cuenta: siempre hay uno, así que contarlo dejaría el botón de
  // quitar filtros visible permanentemente y sin nada que quitar.
  const hayFiltro = apartamentoId !== null || aseadorId !== null || tipo !== 'todos';

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center gap-md">
        {/* ── APARTAMENTO: combinado con búsqueda ───────────────────────────
            Treinta y cuatro unidades gestionadas. Una lista plana es inusable:
            hay que poder escribir tres letras y llegar. */}
        <span id={idEtiquetaApartamento} className="sr-only">
          Apartamento
        </span>

        <Popover open={buscador} onOpenChange={setBuscador}>
          <PopoverTrigger
            render={
              <Button
                id={idApartamento}
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={buscador}
                // El nombre accesible se compone de la etiqueta MAS el valor
                // actual. Solo con la etiqueta, un lector anunciaria
                // "Apartamento, botón" sin decir cuál está elegido.
                aria-labelledby={`${idEtiquetaApartamento} ${idApartamento}`}
                className={cn('justify-between font-normal', !elegido && 'text-muted-foreground')}
              >
                {elegido?.nombre ?? 'Todos los apartamentos'}
                <ChevronDown aria-hidden="true" className="opacity-50" />
              </Button>
            }
          />

          <PopoverContent className="w-(--anchor-width) p-0">
            <Command
              // El filtro por defecto compara los caracteres tal cual, así que
              // `bogota` no encontraría `Bogotá 3`. Es la misma normalización que
              // usan el buscador de la tabla de apartamentos y el de clusters: dos
              // implementaciones del mismo emparejado se desincronizan.
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
                  {/* La opción de quitar el filtro va DENTRO de la lista y no
                      como un botón aparte: es donde la busca quien acaba de
                      elegir uno por error. */}
                  <CommandItem
                    value="Todos los apartamentos"
                    onSelect={() => {
                      setBuscador(false);
                      ir({ apartamento: null });
                    }}
                  >
                    Todos los apartamentos
                  </CommandItem>

                  {apartamentos.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={a.nombre}
                      onSelect={() => {
                        setBuscador(false);
                        ir({ apartamento: a.id });
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

        {/* ── ASEADOR: desplegable ──────────────────────────────────────────
            Unas ocho opciones más `Todos`. Un combinado con búsqueda para ocho
            nombres es un paso de más. */}
        <span id={idEtiquetaAseador} className="sr-only">
          Aseador
        </span>

        <Select
          value={aseadorId ?? TODOS}
          onValueChange={(valor) => {
            const elegido = String(valor);
            ir({ aseador: elegido === TODOS ? null : elegido });
          }}
        >
          <SelectTrigger
            id={idAseador}
            aria-labelledby={`${idEtiquetaAseador} ${idAseador}`}
            className="min-w-col-acargo"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los aseadores</SelectItem>
            {aseadores.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* ── TIPO: tres botones segmentados ────────────────────────────────
            Tres opciones que se cambian varias veces por sesión detrás de dos
            clics es justo el caso que un segmentado resuelve. El borde del
            contenedor es lo que hace que los tres se lean como un solo control. */}
        <div
          role="group"
          aria-label="Tipo de aseo"
          className="flex items-center gap-xs rounded-md border border-border p-xs"
        >
          {TIPOS.map(({ valor, etiqueta }) => {
            const activo = valor === tipo;

            return (
              <Button
                key={valor}
                type="button"
                variant={activo ? 'secondary' : 'ghost'}
                aria-pressed={activo}
                // Nunca inhabilitado mientras carga: ver la cabecera.
                onClick={() => ir({ filtro: valor })}
                className={cn(activo && 'font-semibold')}
              >
                {etiqueta}
              </Button>
            );
          })}
        </div>

        {/* Aparecer y desaparecer ES información: si está, es que hay algo puesto.
            Renderizarlo siempre y deshabilitarlo dejaría un control muerto
            permanente en el caso normal. */}
        {hayFiltro && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => ir({ apartamento: null, aseador: null, filtro: null })}
          >
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
            Quitar filtros
          </Button>
        )}
      </div>

      {/*
        Las filas viejas, atenuadas y legibles, mientras llegan las nuevas.
        `pointer-events-none` evita entrar al apartamento de una fila que ya no va
        a estar, que es como se llega a una pantalla que contradice a la anterior.
      */}
      <div
        aria-busy={pendiente || undefined}
        className={cn('transicion', pendiente && 'pointer-events-none opacity-60')}
      >
        {children}
      </div>
    </div>
  );
}
