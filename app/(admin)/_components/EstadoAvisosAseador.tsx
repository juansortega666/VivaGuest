'use client';

import { Bell, BellOff, BellRing } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  estadoDeAvisosDeAseador,
  tituloDeEstadoDeAvisos,
  type ClaveEstadoAvisosAseador,
  type EntradaEstadoAvisosAseador,
  type IconoEstadoAvisosAseador,
} from '@/lib/domain/avisos';
import { cn } from '@/lib/utils';

/**
 * La columna `AVISOS` de `/aseadores` (D-03, criterio 6, 05-UI-SPEC §5.2 y §11.1).
 *
 * ── ESTE COMPONENTE NO DECIDE NADA ─────────────────────────────────────────
 * Es el mismo contrato que `EstadoAseo` de `/operacion`: la derivacion entera
 * vive en `estadoDeAvisosDeAseador()` de `lib/domain/avisos.ts`, y aqui solo se
 * traduce el NOMBRE del icono al componente de lucide, que es lo unico que el
 * modulo de dominio no puede hacer sin dejar de ser puro.
 *
 * Un `if` sobre el conteo de suscripciones DENTRO de este archivo seria la
 * segunda copia de la derivacion, y es exactamente como un badge acaba diciendo
 * `Activos` sobre un telefono al que no le suena nada. La regla de §8.6 que se
 * perderia primero es la mas importante de la fase: `Activos` exige verificacion
 * POR TOQUE, y una confirmacion a mano deja al aseador en `Sin probar`.
 *
 * Solo hay dos condiciones en el archivo y ninguna es un conteo:
 *   1. `sin_estado`, que es el aseador dado de baja. Lo decide el dominio; aqui
 *      solo se lee la rama de la union.
 *   2. El `title` ausente, que es una guarda de render: un tooltip con el cuerpo
 *      vacio es peor que ningun tooltip.
 *
 * ── PROHIBIDO EL ROJO EN ESTA COLUMNA (§4.2) ───────────────────────────────
 * Es la tentacion evidente y por eso queda escrito: un aseador sin avisos NO
 * tiene un problema, lo tiene su telefono. Pintar su fila del color de lo grave
 * la leeria cualquiera como "esta persona esta fallando". Los tres estados van
 * en `ok`, `idle` y `warn`, y `Sin probar` va en `idle` A PROPOSITO: no es un
 * error, es "hay a donde enviar, pero nadie comprobo que llegue".
 *
 * ── NUNCA COLOR SOLO ───────────────────────────────────────────────────────
 * Icono de forma distinta + etiqueta de texto + color, los tres. Las tres
 * siluetas de campana —sonando, quieta y tachada— se distinguen en escala de
 * grises, que es el test de verdad.
 *
 * ── EL RELOJ ENTRA POR PARAMETRO ───────────────────────────────────────────
 * `ahoraMs` baja desde el RSC, que lo lee UNA vez, igual que `leidoEnMs` en
 * `/operacion`. Leer `Date.now()` aqui daria una marca distinta por fila y otra
 * distinta en el servidor y en el cliente.
 */

/**
 * Los tres iconos de la lista cerrada de §17.5.
 *
 * El `Record` esta indexado por `IconoEstadoAvisosAseador`, que es una union de
 * literales: si el dominio anade un cuarto nombre, `tsc` rompe aqui en vez de
 * renderizar `undefined` como componente en el navegador.
 */
const ICONOS: Record<IconoEstadoAvisosAseador, LucideIcon> = {
  BellRing,
  Bell,
  BellOff,
};

interface Props {
  /** El estado crudo de la base mas `is_active`. Ni etiqueta ni color. */
  estado: EntradaEstadoAvisosAseador;
  /** El instante en que el RSC leyo, para el relativo del `title`. */
  ahoraMs: number;
}

export function EstadoAvisosAseador({ estado, ahoraMs }: Props) {
  const derivado = estadoDeAvisosDeAseador(estado);

  // Aseador dado de baja: raya y nada mas (§5.2). Su telefono ya no importa, y
  // pintarle un estado invitaria a llamarlo. La rama viene del dominio, no de
  // una comprobacion propia.
  if (derivado.clave === 'sin_estado') {
    return (
      <>
        <span aria-hidden="true" className="text-muted-foreground">
          —
        </span>
        <span className="sr-only">sin estado de avisos</span>
      </>
    );
  }

  const Icono = ICONOS[derivado.icono];
  const titulo = tituloDeEstadoDeAvisos(estado, ahoraMs);

  const chip = (
    <span
      // `data-avisos` no es decorativo: deja contar filas por estado sin depender
      // del texto visible, y hace que el DOM diga la clave del dominio y no solo
      // su traduccion. Mismo criterio que `data-estado` en `EstadoAseo`.
      data-avisos={derivado.clave}
      className={cn('flex items-center gap-xs text-micro font-semibold', derivado.clase)}
    >
      {/*
        14px dentro de celda de tabla, exactamente el mismo tratamiento que la
        columna `ESTADO` que ya cabe: la fila NO crece (§2.2). `aria-hidden`
        porque va ACOMPANADO de la etiqueta y anunciarlo la leeria dos veces.
      */}
      <Icono className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      {derivado.etiqueta}
    </span>
  );

  // Guarda de render, no derivacion: `tituloDeEstadoDeAvisos()` devuelve `null`
  // cuando no hay nada honesto que decir, y un tooltip con el cuerpo vacio es
  // peor que no ofrecerlo.
  if (titulo === null) return chip;

  return (
    <Tooltip>
      {/*
        El disparador es un `<span>` y no un boton: la celda no es un control.
        Base UI solo necesita un elemento que emita eventos de puntero.
      */}
      <TooltipTrigger render={<span className="cursor-default">{chip}</span>} />
      <TooltipContent>{titulo}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Entradas minimas que producen cada una de las tres claves.
 *
 * Las etiquetas y los iconos de la leyenda salen de la MISMA derivacion que los
 * de las filas, llamandola con estas entradas, en vez de repetir aqui las tres
 * cadenas. Una leyenda que dijera `Verificados` mientras la fila dice `Activos`
 * es peor que no tener leyenda. Misma tecnica que `LeyendaDeAseos`.
 *
 * El orden es el de §5.2: del mejor estado al que hay que atender.
 */
const MUESTRAS: ReadonlyArray<readonly [ClaveEstadoAvisosAseador, EntradaEstadoAvisosAseador]> = [
  [
    'activos',
    {
      is_active: true,
      suscripciones_vivas: 1,
      verificado_por_toque: true,
      primera_suscripcion_at: null,
      ultima_verificacion: null,
      ultimo_visto: null,
      ultimo_exito: null,
    },
  ],
  [
    'sin_probar',
    {
      is_active: true,
      suscripciones_vivas: 1,
      verificado_por_toque: false,
      primera_suscripcion_at: null,
      ultima_verificacion: null,
      ultimo_visto: null,
      ultimo_exito: null,
    },
  ],
  [
    'sin_avisos',
    {
      is_active: true,
      suscripciones_vivas: 0,
      verificado_por_toque: false,
      primera_suscripcion_at: null,
      ultima_verificacion: null,
      ultimo_visto: null,
      ultimo_exito: null,
    },
  ],
];

/**
 * Leyenda de los tres pares icono+etiqueta, bajo la tabla (§11.1).
 *
 * Va UNA sola vez y en 12px. Es una `<ul>` y no tres `<span>` sueltos para que
 * un lector de pantalla anuncie "lista de 3 elementos" en vez de una tirada de
 * palabras sin estructura.
 *
 * Existe porque la diferencia entre `Activos` y `Sin probar` es el nucleo de
 * D-02 y no se adivina de la etiqueta: la leyenda es donde el admin lee que una
 * es "el aviso llego y lo tocaron" y la otra "hay telefono, pero nadie lo
 * comprobo".
 */
const GLOSA: Record<ClaveEstadoAvisosAseador, string> = {
  activos: 'el aviso de prueba llegó y lo tocaron',
  sin_probar: 'hay teléfono registrado, pero nadie comprobó que llegue',
  sin_avisos: 'no hay ningún teléfono registrado',
};

export function LeyendaDeAvisos() {
  return (
    <ul className="flex flex-wrap items-center gap-lg text-micro text-muted-foreground">
      {MUESTRAS.map(([clave, muestra]) => {
        const derivado = estadoDeAvisosDeAseador(muestra);
        // `sin_estado` no esta en las muestras, asi que esta rama no se alcanza.
        // Se lee de la union para que `tsc` siga siendo quien garantiza que la
        // leyenda no invente un icono que el dominio no da.
        if (derivado.clave === 'sin_estado') return null;

        const Icono = ICONOS[derivado.icono];

        return (
          <li key={clave} className="flex items-center gap-xs">
            <Icono
              className={cn('size-3.5 shrink-0', derivado.clase)}
              strokeWidth={2}
              aria-hidden="true"
            />
            <span className="font-semibold">{derivado.etiqueta}</span>
            <span>{GLOSA[clave]}</span>
          </li>
        );
      })}
    </ul>
  );
}
