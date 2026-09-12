import type { Tables } from '@/lib/database.types';

/**
 * Armado del checklist por cuarto, su progreso, y la derivación de si un aseo
 * quedó sin evidencia completa.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MÓDULO PURO. No importa React, ni `lucide-react`, ni nada de `app/`. Devuelve
 * datos y NOMBRES; quién los pinta es el componente. Misma regla escrita en la
 * cabecera de `lib/domain/alertas.ts`.
 *
 * ── POR QUÉ ESTO NO VIVE DENTRO DE LOS COMPONENTES ──────────────────────────
 *
 * El progreso de un cuarto se muestra en TRES sitios: la cabecera del acordeón,
 * la barra de arriba y el contador del asistente de evidencia. Tres copias del
 * mismo cálculo se desincronizan en el primer cambio, y el síntoma es el peor
 * posible: dos números distintos para la misma pregunta en la misma pantalla.
 *
 * ── DUPLICACIÓN DECLARADA, Y ES DELIBERADA ──────────────────────────────────
 *
 * `sinEvidenciaCompleta()` implementa LA MISMA REGLA que
 * `public.aseo_sin_evidencia_completa()` de la migración 18. Dos
 * implementaciones de la misma verdad pueden divergir, así que esto no es un
 * descuido: es una decisión con razón escrita.
 *
 *   · La de SQL la consume el dashboard del admin, que lee decenas de aseos
 *     agregados y no tiene sus filas en memoria.
 *   · La de aquí la consume la pantalla del aseador, que YA tiene las filas
 *     delante. Hacer un viaje a la base para decidir lo que ya se tiene
 *     cargado sería peor que duplicar.
 *
 * **La mitigación acordada es un test que las compare sobre los mismos datos**,
 * y vive en `lib/domain/evidencia-paridad.integration.test.ts`. Si algún día se
 * cambia una de las dos, ese test lo dice. NO se "arregla" una sin la otra.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Lo que el checklist necesita de la fila, y nada más. */
export type FilaDeChecklist = Pick<
  Tables<'cleaning_checklist_items'>,
  'id' | 'property_room_id' | 'room_label' | 'task_label' | 'requiere_foto' | 'sort_order' | 'done_at'
>;

/** Lo que el grupo necesita de un cuarto saltado. */
export type FilaDeSkip = Pick<
  Tables<'cleaning_room_skips'>,
  'property_room_id' | 'room_label' | 'motivo' | 'nota'
>;

/** Solo el vínculo: lo único que decide si una tarea tiene evidencia. */
export type FotoDeChecklist = { checklist_item_id: string | null };

/** Un cuarto con sus tareas, tal como el acordeón lo pinta. */
export interface GrupoDeCuarto {
  propertyRoomId: string;
  /**
   * El `room_label` de SNAPSHOT, no el nombre actual del cuarto.
   *
   * Si el admin renombra un cuarto mañana, el aseo de hoy sigue diciendo lo que
   * la aseadora vio. Por eso este módulo NO resuelve el nombre contra
   * `property_rooms` al leer, aunque tenga el identificador a mano.
   */
  etiqueta: string;
  tareas: FilaDeChecklist[];
  /** El skip, si ese cuarto se saltó. Trae el motivo para pintarlo. */
  saltado: FilaDeSkip | null;
}

export interface Progreso {
  hechas: number;
  total: number;
}

/**
 * Agrupa las filas por cuarto y les pega su skip.
 *
 * ── ORDEN ───────────────────────────────────────────────────────────────────
 * Dentro del cuarto, por `sort_order`. Entre cuartos, por el `sort_order` más
 * bajo de sus tareas, que es el que `confirm_cleaning` compone como
 * `pr.sort_order * 100 + ct.slot`, así que ordena por cuarto primero.
 *
 * El desempate va con `localeCompare('es-CO')` y NO con `<`: un `sort()` a
 * secas compara puntos de código UTF-16 y manda 'Álamos' después de 'Zipaquirá'.
 */
export function armarChecklist(
  filas: readonly FilaDeChecklist[],
  skips: readonly FilaDeSkip[] = [],
  fotos: readonly FotoDeChecklist[] = [],
): GrupoDeCuarto[] {
  void fotos; // las fotos no agrupan; las consume `faltaEvidenciaEnCuarto`.

  const porCuarto = new Map<string, FilaDeChecklist[]>();
  for (const fila of filas) {
    const actual = porCuarto.get(fila.property_room_id);
    if (actual) actual.push(fila);
    else porCuarto.set(fila.property_room_id, [fila]);
  }

  const skipPorCuarto = new Map(skips.map((s) => [s.property_room_id, s]));

  const grupos: GrupoDeCuarto[] = [...porCuarto.entries()].map(([propertyRoomId, tareas]) => {
    const ordenadas = [...tareas].sort(
      (a, b) => a.sort_order - b.sort_order || a.task_label.localeCompare(b.task_label, 'es-CO'),
    );
    return {
      propertyRoomId,
      // Todas las filas del cuarto traen el mismo snapshot; se toma el de la
      // primera ordenada para que el resultado sea determinista.
      etiqueta: ordenadas[0]?.room_label ?? '',
      tareas: ordenadas,
      saltado: skipPorCuarto.get(propertyRoomId) ?? null,
    };
  });

  /**
   * UN CUARTO SALTADO QUE NO TIENE NINGUNA TAREA TAMBIEN ES UN GRUPO.
   *
   * ── ESTO LO ENCONTRO EL TEST DE PARIDAD, Y ERA UNA DIVERGENCIA DE VERDAD ──
   *
   * Agrupando SOLO por las filas del checklist, el salto de un cuarto sin
   * tareas se quedaba sin grupo al que pegarse y desaparecia en silencio. La
   * consecuencia no era cosmetica: `sinEvidenciaCompleta()` devolvia `false`
   * mientras `public.aseo_sin_evidencia_completa()` devolvia `true` sobre EL
   * MISMO aseo, porque la de SQL pregunta por la tabla de saltos directamente y
   * no le importa si el cuarto tiene tareas.
   *
   * O sea: el dashboard del admin marcaba el aseo y la pantalla de la aseadora
   * decia que estaba completo. Nadie mira las dos a la vez, asi que habria
   * vivido ahi.
   *
   * Se resuelve del lado de TypeScript y no relajando el SQL a proposito: la de
   * SQL es la conservadora —marca de mas, nunca de menos— y es la que ve el
   * admin, que es quien tiene que reclamar la evidencia.
   */
  const conGrupo = new Set(grupos.map((g) => g.propertyRoomId));
  for (const skip of skips) {
    if (conGrupo.has(skip.property_room_id)) continue;
    grupos.push({
      propertyRoomId: skip.property_room_id,
      etiqueta: skip.room_label,
      tareas: [],
      saltado: skip,
    });
  }

  /**
   * Los cuartos sin tareas van AL FINAL, no al principio.
   *
   * Con `?? 0` caerian arriba del todo, que es el peor sitio: lo primero que
   * veria la aseadora al abrir el aseo seria un cuarto en el que no hay nada que
   * hacer. Se ordenan por el `sort_order` mas bajo de sus tareas, y quien no
   * tiene ninguna se va detras.
   */
  return grupos.sort(
    (a, b) =>
      (a.tareas[0]?.sort_order ?? Number.POSITIVE_INFINITY) -
        (b.tareas[0]?.sort_order ?? Number.POSITIVE_INFINITY) ||
      a.etiqueta.localeCompare(b.etiqueta, 'es-CO'),
  );
}

/**
 * Cuántas tareas del cuarto están hechas y cuántas hay.
 *
 * Devuelve los DOS números y no un porcentaje: la cabecera del acordeón muestra
 * `1/4` literal, y el porcentaje solo lo necesita la barra de progreso, que lo
 * calcula al pintar. Devolver el porcentaje obligaría a la cabecera a
 * deshacerlo.
 *
 * Un cuarto sin tareas cuenta como completo, y no divide por cero.
 */
export function progresoDeCuarto(grupo: GrupoDeCuarto): Progreso {
  return {
    hechas: grupo.tareas.filter((t) => t.done_at !== null).length,
    total: grupo.tareas.length,
  };
}

/** La suma sobre todos los cuartos. Suma, no promedio de porcentajes. */
export function progresoTotal(grupos: readonly GrupoDeCuarto[]): Progreso {
  return grupos.reduce<Progreso>(
    (acc, g) => {
      const p = progresoDeCuarto(g);
      return { hechas: acc.hechas + p.hechas, total: acc.total + p.total };
    },
    { hechas: 0, total: 0 },
  );
}

/** Un cuarto está completo cuando todas sus tareas están marcadas. */
export function cuartoCompleto(grupo: GrupoDeCuarto): boolean {
  const { hechas, total } = progresoDeCuarto(grupo);
  return hechas === total;
}

/**
 * Un cuarto necesita foto si ALGUNA de sus tareas la exige.
 *
 * Es la traducción de D-05: `requiere_foto` está por TAREA en el schema, pero
 * la evidencia se recoge por CUARTO. Sin esta función, el asistente de
 * evidencia pediría una foto por tarea, que es tres veces el trabajo para la
 * misma prueba.
 */
export function cuartoNecesitaFoto(grupo: GrupoDeCuarto): boolean {
  return grupo.tareas.some((t) => t.requiere_foto);
}

/**
 * A este cuarto le falta evidencia: alguna tarea que exige foto no tiene
 * ninguna.
 *
 * Espeja **exactamente** la segunda rama de `aseo_sin_evidencia_completa()`.
 */
export function faltaEvidenciaEnCuarto(
  grupo: GrupoDeCuarto,
  fotos: readonly FotoDeChecklist[],
): boolean {
  const conFoto = new Set(fotos.map((f) => f.checklist_item_id).filter((id): id is string => id !== null));
  return grupo.tareas.some((t) => t.requiere_foto && !conFoto.has(t.id));
}

/**
 * El aseo quedó sin evidencia completa.
 *
 * **Espeja `public.aseo_sin_evidencia_completa()` de la migración 18**, y la
 * paridad la mide `lib/domain/evidencia-paridad.integration.test.ts`. Ver la
 * cabecera de este módulo para la razón de que exista dos veces.
 *
 * Las dos ramas, en el mismo orden que la función de SQL:
 *   1. algún cuarto saltado, o
 *   2. alguna tarea que exige foto sin ninguna foto.
 */
export function sinEvidenciaCompleta(
  grupos: readonly GrupoDeCuarto[],
  fotos: readonly FotoDeChecklist[] = [],
): boolean {
  if (grupos.some((g) => g.saltado !== null)) return true;
  return grupos.some((g) => faltaEvidenciaEnCuarto(g, fotos));
}

/**
 * El cuarto que el acordeón abre al entrar.
 *
 * Devuelve `null` cuando todos están completos, y entonces el acordeón nace
 * cerrado: no hay nada que la aseadora tenga que hacer primero.
 */
export function primerCuartoIncompleto(grupos: readonly GrupoDeCuarto[]): string | null {
  return grupos.find((g) => !cuartoCompleto(g))?.propertyRoomId ?? null;
}
