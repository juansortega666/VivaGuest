'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

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
import { normalizar } from '@/lib/domain/properties';
import { cn } from '@/lib/utils';

/**
 * Combobox de cluster con entrada libre (UI-SPEC §8.1, sección 1).
 *
 * ── POR QUE ENTRADA LIBRE Y NO UN `Select` CERRADO ─────────────────────────
 * `properties.cluster` es `text not null`. No es un enum, no es una FK, no hay
 * tabla de clusters. Los 8 valores que existen hoy salen de las 39 filas
 * sembradas, y el día que el admin abra una unidad en una ciudad nueva tiene que
 * poder escribirla sin una migración. Un `Select` cerrado haría imposible el caso
 * que el modelo de datos permite explícitamente.
 *
 * ── EL PRECIO DE ESO, Y LAS DOS MITADES DE SU MITIGACION ────────────────────
 * 02-RESEARCH §8.8: un typo crea un cluster nuevo EN SILENCIO, y el agrupamiento
 * por cluster es la consulta más frecuente del dashboard. El filtro de la tabla
 * pasa a tener nueve opciones donde el admin ve ocho, y nada avisa.
 *
 * La primera mitad de la mitigación ya vive en `listarClusters` (plan 02-10):
 * normaliza por `trim` y descarta el cluster en blanco. La segunda es esta
 * pantalla, y son dos cosas distintas:
 *
 *   1. Se SUGIEREN los existentes mientras se escribe, sin tildes y sin
 *      distinguir mayúsculas, reutilizando `normalizar()` del plan 02-11. Así
 *      teclear `bogota` encuentra `Bogotá 1` sin que el admin tenga que acertar
 *      con la tilde.
 *   2. Cuando lo tecleado coincide con un cluster existente salvo por tildes o
 *      mayúsculas, la opción de CREAR NO SE OFRECE. Es lo que impide que
 *      `bogota 1` nazca al lado de `Bogotá 1` como dos clusters distintos, que es
 *      exactamente la forma que toma el bug en la práctica.
 *
 * Lo que se escribe se guarda con `trim` y con la capitalización que el admin
 * teclee: normalizarla a la fuerza sería inventarse el dato.
 */

interface Props {
  /** Va al botón disparador, para que la etiqueta del `Field` lo apunte. */
  id: string;
  /** El id del elemento que rotula el campo, para el nombre accesible. */
  idEtiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  /** Los clusters que ya existen en el catálogo, derivados de `listarClusters`. */
  clusters: string[];
  invalido?: boolean;
  describedBy?: string;
}

export function SelectorCluster({
  id,
  idEtiqueta,
  valor,
  onChange,
  clusters,
  invalido,
  describedBy,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');

  const tecleado = consulta.trim();

  // Segunda mitad de la mitigación: si lo tecleado ya existe salvo por tildes o
  // mayúsculas, no se ofrece crearlo. Ver el bloque de arriba.
  const yaExiste =
    tecleado.length > 0 && clusters.some((c) => normalizar(c) === normalizar(tecleado));

  function elegir(nombre: string) {
    // `trim` antes de salir del componente. Un espacio final es invisible en
    // pantalla y produce un cluster nuevo que nadie puede distinguir del bueno.
    onChange(nombre.trim());
    setConsulta('');
    setAbierto(false);
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={abierto}
            // El nombre accesible se compone de la etiqueta MAS el valor actual.
            // Solo con la etiqueta, un lector de pantalla anunciaría "Cluster,
            // botón" sin decir qué cluster está puesto; solo con el contenido,
            // diría "Bogotá 1" sin decir de qué campo se trata.
            aria-labelledby={`${idEtiqueta} ${id}`}
            aria-invalid={invalido || undefined}
            aria-describedby={describedBy}
            className={cn(
              'w-full justify-between font-normal',
              !valor && 'text-muted-foreground',
            )}
          >
            {valor || 'Elige o escribe un cluster'}
            <ChevronDown aria-hidden="true" className="opacity-50" />
          </Button>
        }
      />

      <PopoverContent className="w-(--anchor-width) p-0">
        <Command
          // El filtro por defecto de cmdk compara los caracteres tal cual, así
          // que `bogota` no encontraría `Bogotá 1` y el admin acabaría creando el
          // duplicado que este componente existe para evitar. `normalizar()` es
          // la misma función que usa el buscador de la tabla (plan 02-11): dos
          // implementaciones del mismo matching se desincronizan.
          filter={(value, search) =>
            normalizar(value).includes(normalizar(search)) ? 1 : 0
          }
        >
          <CommandInput
            autoFocus
            value={consulta}
            onValueChange={setConsulta}
            placeholder="Busca o escribe un cluster"
            aria-label="Busca o escribe un cluster"
          />
          <CommandList>
            <CommandEmpty>Ningún cluster coincide. Escribe para crear uno.</CommandEmpty>

            {tecleado.length > 0 && !yaExiste && (
              <CommandGroup heading="Crear">
                {/*
                  El `value` es lo tecleado, así que el filtro de arriba siempre
                  lo deja pasar. Y `onSelect` NO usa el argumento que le pasa
                  cmdk: cmdk normaliza los valores para su índice interno, y
                  guardar esa versión en vez de la que el admin escribió cambiaría
                  la capitalización del cluster sin decírselo.
                */}
                <CommandItem value={tecleado} onSelect={() => elegir(tecleado)}>
                  Usar «{tecleado}»
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading="Clusters existentes">
              {clusters.map((nombre) => (
                <CommandItem key={nombre} value={nombre} onSelect={() => elegir(nombre)}>
                  {nombre}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
