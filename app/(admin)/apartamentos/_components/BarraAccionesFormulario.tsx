'use client';

import { Check, Loader2 } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  faltantesParaActivar,
  type ApartamentoInput,
  type Faltante,
} from '@/lib/domain/apartamento.schema';
import { cn } from '@/lib/utils';

/**
 * Barra de acciones del formulario: el contrato borrador → activo (UI-SPEC §8.2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * `faltantesParaActivar` ES LA UNICA FUENTE DE LAS TRES COSAS, Y NO HAY NINGUN
 * `if` DE ACTIVACION EN ESTE ARCHIVO.
 *
 * De ella salen:
 *   1. la lista "Para activar falta", con sus ítems cumplidos y pendientes,
 *   2. el `disabled` del botón `Guardar y activar`,
 *   3. el texto del tooltip que explica por qué está deshabilitado.
 *
 * Incluida la LISTA COMPLETA de requisitos, que se obtiene llamando a la misma
 * función con un objeto que solo trae `gestion_vivaguest`: sin ningún valor
 * puesto, todo falta, así que lo que devuelve es exactamente el conjunto de
 * requisitos de ese modo. Escribir aquí un array literal con los tres ítems
 * sería una segunda copia de la regla, y el día que la regla cambie el checklist
 * y la validación dirían cosas distintas: el botón se habilitaría y el submit
 * fallaría con un error inline sin explicación.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Y por eso mismo la simetría de la regla 6 no cuesta nada: para una unidad
 * informativa, `faltantesParaActivar` devuelve `Contacto externo` y el resto de
 * este componente no se entera de que hay dos casos.
 */

/** Qué operación está en vuelo. `null` es "ninguna". */
export type OperacionEnVuelo = 'borrador' | 'activar' | null;

interface Props {
  /**
   * El estado EN VIVO del formulario, alimentado por la suscripción granular de
   * react-hook-form con array de nombres. La forma sin argumentos de esa misma
   * API está prohibida en este directorio y hay un `grep` que lo verifica, así
   * que su nombre no se escribe literal ni en un comentario.
   */
  valores: Partial<ApartamentoInput>;
  /** Lleva el foco al campo del ítem pulsado. */
  enfocarCampo: (campo: Faltante['campo']) => void;
  onGuardar: () => void;
  onActivar: () => void;
  /** `Guardar` exige nombre y cluster; nada más (regla 1). */
  puedeGuardar: boolean;
  enVuelo: OperacionEnVuelo;
}

export function BarraAccionesFormulario({
  valores,
  enfocarCampo,
  onGuardar,
  onActivar,
  puedeGuardar,
  enVuelo,
}: Props) {
  const idChecklist = useId();

  const gestion = valores.gestion_vivaguest !== false;

  // El universo de requisitos de este modo, derivado de la MISMA función. Ver la
  // cabecera: con un objeto sin valores, todo falta.
  const requisitos = faltantesParaActivar({ gestion_vivaguest: gestion });
  const faltantes = faltantesParaActivar(valores);
  const pendientes = new Set(faltantes.map((f) => f.campo));

  const puedeActivar = faltantes.length === 0 && puedeGuardar;
  const bloqueado = enVuelo !== null;

  return (
    <div
      className={cn(
        // §8.2: fija al fondo, 64px, fondo opaco y borde superior de 1px. El
        // fondo NO puede ser transparente: la barra se superpone al último campo
        // del formulario mientras se hace scroll.
        'sticky bottom-0 z-30 -mx-xl mt-xl flex min-h-barra-acciones items-center',
        'justify-between gap-xl border-t border-border bg-background px-xl py-md',
      )}
    >
      <div id={idChecklist} className="flex flex-col gap-xs text-micro">
        {requisitos.length > 0 && (
          <>
            <span className="font-semibold text-foreground">Para activar falta:</span>
            <ul className="flex flex-wrap items-center gap-md">
              {requisitos.map((r) => {
                const pendiente = pendientes.has(r.campo);
                return (
                  <li key={r.campo}>
                    {/*
                      Cada ítem es un botón de verdad y no un `<span>` con
                      `onClick`: es lo que lo pone en el orden de tabulación y lo
                      que hace que un lector de pantalla lo anuncie como algo que
                      se puede pulsar. Es también la única ruta de teclado a la
                      explicación, porque el tooltip vive sobre un botón
                      deshabilitado, que no recibe foco.
                    */}
                    <button
                      type="button"
                      onClick={() => enfocarCampo(r.campo)}
                      className={cn(
                        'flex items-center gap-xs rounded-sm underline-offset-4 transicion',
                        'hover:underline focus-visible:outline-2 focus-visible:outline-offset-2',
                        'focus-visible:outline-primary',
                        pendiente
                          ? 'text-foreground'
                          : 'text-muted-foreground line-through',
                      )}
                    >
                      {pendiente ? (
                        // Casilla vacía dibujada, no un carácter: un `☐` se
                        // renderiza distinto en cada sistema y en algunos ni
                        // aparece.
                        <span
                          aria-hidden="true"
                          className="size-3.5 shrink-0 rounded-xs border border-input"
                        />
                      ) : (
                        <Check
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-status-ok"
                          strokeWidth={2}
                        />
                      )}
                      {/* El estado va también en TEXTO y no solo en el icono y el
                          tachado (§5, §13): tachado y color no llegan a un lector
                          de pantalla. */}
                      <span className="sr-only">{pendiente ? 'Falta:' : 'Listo:'}</span>
                      {r.etiqueta}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <p className="text-muted-foreground">
          Puedes guardar este apartamento incompleto. No se puede activar hasta completar
          lo que falta.
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-sm">
        <Button
          type="button"
          variant="secondary"
          onClick={onGuardar}
          disabled={!puedeGuardar || bloqueado}
          className="min-w-boton-guardar"
        >
          {enVuelo === 'borrador' ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Guardando…
            </>
          ) : (
            'Guardar'
          )}
        </Button>

        {/*
          El `<span>` que envuelve al botón NO es decorativo: un elemento con el
          atributo `disabled` no emite eventos de puntero, así que un tooltip
          colgado directamente de él nunca se abriría, que es exactamente el
          callejón sin salida que la regla 4 quiere evitar. Va sin `tabIndex`
          para no meter una parada de tabulación fantasma: la ruta de teclado a
          la misma información son los botones del checklist de la izquierda.
        */}
        <Tooltip>
          <TooltipTrigger
            render={
              <span>
                <Button
                  type="button"
                  onClick={onActivar}
                  disabled={!puedeActivar || bloqueado}
                  aria-describedby={faltantes.length > 0 ? idChecklist : undefined}
                  className="min-w-boton-activar"
                >
                  {enVuelo === 'activar' ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      Activando…
                    </>
                  ) : (
                    'Guardar y activar'
                  )}
                </Button>
              </span>
            }
          />
          {/* La PRIMERA carencia, que es la del contrato. Cuando no falta nada,
              el tooltip explica qué hace el botón en vez de quedarse vacío. */}
          <TooltipContent>
            {faltantes.length > 0
              ? `Falta: ${faltantes[0].etiqueta}`
              : !puedeGuardar
                ? 'Falta el nombre o el cluster'
                : 'Guarda y pone el apartamento en circulación'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
