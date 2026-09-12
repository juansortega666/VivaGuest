'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { Accordion } from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import {
  armarChecklist,
  primerCuartoIncompleto,
  progresoTotal,
  type FilaDeChecklist,
  type FilaDeSkip,
  type GrupoDeCuarto,
  type Progreso,
} from '@/lib/domain/checklist';

import { CuartoAcordeon } from './CuartoAcordeon';

/**
 * EL CHECKLIST POR CUARTO (CHECK-01, CHECK-02, 06-UI-SPEC §7.1 y §7.2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE COMPONENTE NO AGRUPA, NO ORDENA Y NO CUENTA.
 *
 * Todo eso lo hizo la proyeccion pura de `lib/domain/checklist.ts`, y aqui solo
 * se consume. No es una preferencia de estilo: el progreso del aseo se pinta en
 * TRES sitios —la cabecera de cada cuarto, el total de arriba y el contador del
 * asistente de evidencia— y una segunda implementacion aqui es exactamente como
 * dos de esos tres numeros acaban diciendo cosas distintas sobre el mismo aseo.
 *
 * ── DONDE VIVE EL ESTADO, Y POR QUE NO EN LA FILA ──────────────────────────
 *
 * `ProgresoDelAseo` es el unico dueno del estado. La casilla optimista de una
 * tarea tiene que mover TRES contadores a la vez, asi que si el estado viviera
 * dentro de `FilaDeTarea` la cabecera de su cuarto y el total de arriba se
 * quedarian atras hasta el siguiente viaje al servidor.
 *
 * Se expone por contexto y no por props porque el consumidor de abajo es la
 * barra fija, que **no** es hija del checklist: vive fuera del flujo de lectura,
 * y la pagina las monta como hermanas.
 *
 * ── EL ESTADO DEL ACORDEON NO SE GUARDA EN NINGUNA PARTE ───────────────────
 *
 * Cada entrada a la pantalla recalcula que cuarto se abre, con
 * `primerCuartoIncompleto()`. Guardarlo entre visitas suena a cortesia y es un
 * riesgo: si la aseadora cerro la app a mitad y alguien marco algo desde otro
 * lado, al volver se le abriria un cuarto que ya esta hecho y se le quedaria
 * cerrado el que falta. Vale mas recalcular que acertar a veces.
 *
 * ── UN CUARTO COMPLETO SE RECOGE SOLO ──────────────────────────────────────
 *
 * En el momento en que su ultima tarea se marca, se cierra. **No desaparece**:
 * su cabecera se queda con el visto verde, que es la unica confirmacion de que
 * quedo hecho. Y se puede volver a abrir, porque se puede desmarcar.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface EstadoDelAseo {
  grupos: GrupoDeCuarto[];
  progreso: Progreso;
  abiertos: string[];
  soloLectura: boolean;
  setAbiertos: (v: string[]) => void;
  marcar: (itemId: string, hecha: boolean) => void;
}

const Contexto = createContext<EstadoDelAseo | null>(null);

/** El estado compartido del checklist y de la barra fija. */
export function useEstadoDelAseo(): EstadoDelAseo {
  const ctx = useContext(Contexto);
  if (ctx === null) {
    // Se lanza en vez de devolver un cero: una barra que dice "no falta nada"
    // porque no encontro su contexto es peor que una pantalla que se cae.
    throw new Error('ChecklistPorCuarto: falta el proveedor ProgresoDelAseo');
  }
  return ctx;
}

/**
 * El dueno del estado. Envuelve al checklist Y a la barra fija.
 *
 * Recibe las filas tal como las leyo el servidor y les aplica encima los cambios
 * optimistas, que son un mapa de `id de tarea -> marcada`. La fuente del
 * servidor **no se muta**: si el RPC falla, basta con quitar la entrada del mapa.
 */
export function ProgresoDelAseo({
  filas,
  skips,
  soloLectura = false,
  children,
}: {
  filas: FilaDeChecklist[];
  skips: FilaDeSkip[];
  soloLectura?: boolean;
  children: React.ReactNode;
}) {
  const [cambios, setCambios] = useState<Record<string, boolean>>({});

  /**
   * Las filas del servidor con los cambios optimistas encima.
   *
   * `done_at` se rellena con una marca de tiempo cualquiera porque lo unico que
   * el dominio pregunta es si es nulo. El valor exacto no se pinta en ningun
   * sitio de esta pantalla; el que vale es el que escribio el RPC.
   */
  const grupos = useMemo(() => {
    const conCambios = filas.map((f) => {
      const cambio = cambios[f.id];
      if (cambio === undefined) return f;
      return { ...f, done_at: cambio ? new Date().toISOString() : null };
    });
    return armarChecklist(conCambios, skips);
  }, [filas, skips, cambios]);

  const progreso = useMemo(() => progresoTotal(grupos), [grupos]);

  /**
   * Solo en el primer render: de ahi en adelante lo mueve la aseadora, o el
   * recogido automatico al completar un cuarto.
   *
   * Se calcula sobre `grupos`, que en el primer render es ya la agrupacion
   * completa: todavia no hay ningun cambio optimista encima. Volver a agrupar
   * aqui seria repetir el trabajo del montaje y, peor, dejar dos llamadas al
   * modulo de dominio que mantener de acuerdo.
   */
  const [abiertos, setAbiertos] = useState<string[]>(() => {
    const primero = primerCuartoIncompleto(grupos);
    return primero === null ? [] : [primero];
  });

  const marcar = useCallback(
    (itemId: string, hecha: boolean) => {
      setCambios((prev) => ({ ...prev, [itemId]: hecha }));

      // El recogido automatico se decide sobre el cuarto de ESA tarea, y con el
      // valor que acaba de quedar. Se calcula aqui y no en un efecto para que
      // ocurra en el mismo render que el cambio de la casilla: con un efecto, la
      // fila se marca y el cuarto se cierra un instante despues, que se ve como
      // un salto.
      const fila = filas.find((f) => f.id === itemId);
      if (!fila) return;

      const delCuarto = filas.filter((f) => f.property_room_id === fila.property_room_id);
      const quedaraCompleto = delCuarto.every((f) =>
        f.id === itemId ? hecha : (cambios[f.id] ?? f.done_at !== null),
      );

      if (quedaraCompleto) {
        setAbiertos((prev) => prev.filter((v) => v !== fila.property_room_id));
      }
    },
    [filas, cambios],
  );

  const valor = useMemo<EstadoDelAseo>(
    () => ({ grupos, progreso, abiertos, soloLectura, setAbiertos, marcar }),
    [grupos, progreso, abiertos, soloLectura, marcar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

const VACIO_TITULO = 'Este apartamento todavía no tiene cuartos configurados.';
const VACIO_CUERPO = 'Avísale a tu administrador.';
const ROTULO = 'Checklist';

export function ChecklistPorCuarto() {
  const { grupos, progreso, abiertos, soloLectura, setAbiertos, marcar } = useEstadoDelAseo();

  /**
   * APARTAMENTO SIN CUARTOS (§11.1).
   *
   * El checklist no se renderiza y se dice que pasa. Lo que NO cambia es la
   * barra de accion, que la monta la pagina y sigue ahi: un apartamento mal
   * configurado no puede dejar a la aseadora encerrada en una pantalla sin
   * salida. El arreglo es del admin, la salida es de ella.
   */
  if (grupos.length === 0) {
    return (
      <section className="flex flex-col gap-xs">
        <h2 className="text-heading-movil text-foreground">{VACIO_TITULO}</h2>
        <p className="text-body-movil text-muted-foreground">{VACIO_CUERPO}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-md">
      <div className="flex items-center justify-between gap-md">
        <h2 className="text-heading-movil text-foreground">{ROTULO}</h2>
        <span className="text-micro-movil tabular-nums text-muted-foreground">
          {progreso.hechas} de {progreso.total}
        </span>
      </div>

      {/*
        EL USO 8 DEL ACENTO, de la lista cerrada de §4.3: avance de una tarea
        larga. Es el mismo criterio que los siete anteriores —el acento marca
        progreso o la accion que decide la pantalla, nunca decora— y por eso la
        barra va en `--primary` y no en el verde de completado: lo verde es cada
        cuarto terminado, no el avance.
      */}
      {progreso.total > 0 && (
        <Progress
          value={progreso.hechas}
          max={progreso.total}
          aria-label="Avance del checklist"
          className="flex"
        />
      )}

      {/*
        `multiple`: se abre mas de un cuarto a la vez. La primitiva viene con eso
        apagado por defecto, que es lo correcto para un acordeon de preguntas
        frecuentes y lo contrario de lo que hace falta en una lista de trabajo.
      */}
      <Accordion
        multiple
        value={abiertos}
        onValueChange={(v) => setAbiertos(v as string[])}
        className="flex flex-col"
      >
        {grupos.map((grupo) => (
          <CuartoAcordeon
            key={grupo.propertyRoomId}
            grupo={grupo}
            soloLectura={soloLectura}
            onCambio={marcar}
          />
        ))}
      </Accordion>
    </section>
  );
}
