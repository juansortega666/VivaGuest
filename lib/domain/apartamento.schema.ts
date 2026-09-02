/**
 * Contrato borrador → activo del formulario de apartamento (UI-SPEC §8.2).
 *
 * Un apartamento NACE inactivo (`properties.is_active default false`) y `is_active`
 * es un MODO DE SUBMIT, no un campo del formulario: dos botones, dos niveles de
 * exigencia. De ahí que haya un esquema base laxo y dos refinamientos.
 *
 *   `Guardar`            → `esquemaBorrador`  (invariantes que valen siempre)
 *   `Guardar y activar`  → `esquemaActivar`   (invariantes + puertas de activación)
 *
 * Los CHECK de activación de `properties` NO DEBEN PODER DISPARARSE desde la UI.
 * Este archivo es la red que lo impide; `mapDbError()` solo es el paracaídas.
 */
import { z } from 'zod';

import type { Tables } from '@/lib/database.types';

/**
 * Normaliza a `null` lo que un formulario manda como "vacío".
 *
 * Un input numérico vacío llega como `''` desde react-hook-form (y como `NaN` con
 * `valueAsNumber`). Sin esto, `z.coerce.number()` convertiría `''` en `0` y una
 * unidad se activaría con "tarifa 0" en vez de bloquear la activación: la lista de
 * faltantes diría que el campo está lleno cuando en pantalla está vacío.
 */
function vacioANulo(v: unknown): unknown {
  if (v === '') return null;
  if (typeof v === 'number' && Number.isNaN(v)) return null;
  return v;
}

/**
 * Pesos colombianos ENTEROS (`bigint` en la base, sin decimales nunca).
 * El `nonnegative()` es el espejo en UI de `props_rates_nonneg`.
 */
const cop = z.preprocess(
  vacioANulo,
  z.coerce
    .number()
    .int('Escribe un valor en pesos, sin decimales')
    .nonnegative('Las tarifas no pueden ser negativas')
    .nullish(),
);

/**
 * `properties.hora_limite` es de tipo `time`. La regex acepta solo horas reales:
 * un `24:00` pasaría un `/^\d{2}:\d{2}$/` y luego reventaría en Postgres como
 * error de parseo crudo, que es justo lo que la UI no debe dejar llegar.
 */
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Los 12 campos del formulario, en su forma laxa. */
export const apartamentoBase = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  cluster: z.string().trim().min(1, 'El cluster es obligatorio'),
  direccion: z.string().trim().nullish(),
  maps_url: z.url('Pega un link válido de Google Maps').nullish(),
  gestion_vivaguest: z.boolean(),
  tarifa_huesped: cop,
  pago_aseador: cop,
  fee_discriminado: z.boolean(),
  responsable_id: z.uuid().nullish(),
  suplente_id: z.uuid().nullish(),
  contacto_externo: z.string().trim().nullish(),
  hora_limite: z.string().regex(RE_HORA, 'La hora debe tener el formato HH:MM'),
});

/** Los valores tal como los entrega el formulario, antes de coerción. */
export type ApartamentoInput = z.input<typeof apartamentoBase>;

/** Los valores ya validados y normalizados, listos para la Server Action. */
export type ApartamentoOutput = z.output<typeof apartamentoBase>;

/** La forma que ven los refinamientos: la salida del objeto base. */
type Valores = ApartamentoOutput;

/**
 * Invariantes que valen SIEMPRE, incluso en un borrador incompleto.
 * Son el espejo exacto de dos CHECK de `properties`.
 */
function invariantesSiempre<T extends z.ZodType<Valores, ApartamentoInput>>(s: T) {
  return (
    s
      // props_assignees_only_when_managed
      .refine((v) => v.gestion_vivaguest || (!v.responsable_id && !v.suplente_id), {
        path: ['responsable_id'],
        message: 'Una unidad de gestión externa no lleva responsable ni suplente.',
      })
      // props_suplente_distinct
      .refine((v) => !v.suplente_id || v.suplente_id !== v.responsable_id, {
        path: ['suplente_id'],
        message: 'El suplente no puede ser la misma persona que el responsable.',
      })
  );
}

/**
 * `Guardar`: se admite cualquier hueco salvo las invariantes. UI-SPEC §8.2 regla 1:
 * "Guarda incompleto, sin ruido, sin confirmación."
 */
export const esquemaBorrador = invariantesSiempre(apartamentoBase);

/**
 * `Guardar y activar`: lo que la UI exige DE MÁS para activar.
 *
 * Dos divergencias deliberadas respecto de la base, que nadie debe "corregir":
 *
 * 1. Para unidades GESTIONADAS, `props_active_requires_owner` acepta
 *    `responsable_id IS NOT NULL OR contacto_externo IS NOT NULL`. Aquí se exige
 *    `responsable_id` y punto: lo piden APTO-08 y el criterio de éxito 3 del
 *    ROADMAP. La UI aprieta; la base no se toca.
 *
 * 2. Para unidades INFORMATIVAS, la puerta de `contacto_externo` es SOLO DE UI y
 *    NO TIENE RESPALDO EN BASE. `props_active_requires_owner` está condicionado a
 *    `not (is_active and gestion_vivaguest)`, así que con `gestion_vivaguest =
 *    false` el CHECK es verdadero por vacuidad y la base DEJARÍA activar una
 *    unidad informativa con el contacto vacío. No existe ningún 23514 que cubra
 *    este caso: si este refinamiento se borra, la regla desaparece del sistema
 *    entero. Lo exigen APTO-09 y el criterio de éxito 3 del ROADMAP.
 */
export const esquemaActivar = invariantesSiempre(apartamentoBase)
  // props_active_requires_rates (parte 1)
  .refine((v) => !v.gestion_vivaguest || v.tarifa_huesped != null, {
    path: ['tarifa_huesped'],
    message: 'Falta la tarifa al huésped.',
  })
  // props_active_requires_rates (parte 2)
  .refine((v) => !v.gestion_vivaguest || v.pago_aseador != null, {
    path: ['pago_aseador'],
    message: 'Falta el pago al aseador.',
  })
  // props_active_requires_owner, apretado: la base aceptaría contacto_externo
  .refine((v) => !v.gestion_vivaguest || v.responsable_id != null, {
    path: ['responsable_id'],
    message: 'Falta el aseador responsable.',
  })
  // Sin respaldo en base. Ver el punto 2 del comentario de arriba.
  .refine((v) => v.gestion_vivaguest || !!v.contacto_externo?.trim(), {
    path: ['contacto_externo'],
    message: 'Falta el contacto externo.',
  });

/**
 * Una fila YA GUARDADA de `properties`, en la forma que comen los dos esquemas.
 *
 * Existe para que `activarApartamento` (plan 02-10) pueda revalidar el contrato
 * de §8.2 sobre lo que hay en la base, sin pasar por el formulario: el menú `⋯`
 * de UI-SPEC §7.3 ofrece `Activar` sobre una fila de la tabla y ahí no hay
 * ninguna validación de cliente detrás.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA LÍNEA QUE IMPORTA DE ESTA FUNCIÓN ES LA DE `hora_limite`, Y SIN ELLA NO
 * SE PUEDE ACTIVAR NI UN SOLO APARTAMENTO.
 *
 * `properties.hora_limite` es de tipo `time` y PostgREST la serializa como
 * `'11:30:00'`, con segundos. `RE_HORA` exige `'HH:MM'` EXACTO —y es estricta a
 * propósito, porque un `24:00` reventaría en Postgres como error de parseo
 * crudo—, así que pasar el valor tal cual hace fallar la revalidación de TODAS
 * las filas con el mensaje "La hora debe tener el formato HH:MM", que no tiene
 * absolutamente nada que ver con lo que el admin acaba de pulsar.
 *
 * Vive aquí, en `lib/domain/`, y no dentro del archivo de Server Actions, por
 * una razón mecánica: un archivo con `'use server'` solo puede exportar
 * funciones async, así que un helper puro declarado ahí es inexportable y por
 * tanto imposible de cubrir con un test unitario. Y `vitest.config.ts` solo
 * recoge `lib/**`. Un trozo de lógica que rompe la funcionalidad entera no
 * puede vivir donde ninguna suite lo alcanza.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function valoresDesdeFilaGuardada(fila: Tables<'properties'>): ApartamentoInput {
  return {
    nombre: fila.nombre,
    cluster: fila.cluster,
    direccion: fila.direccion,
    maps_url: fila.maps_url,
    gestion_vivaguest: fila.gestion_vivaguest,
    tarifa_huesped: fila.tarifa_huesped,
    pago_aseador: fila.pago_aseador,
    fee_discriminado: fila.fee_discriminado,
    responsable_id: fila.responsable_id,
    suplente_id: fila.suplente_id,
    contacto_externo: fila.contacto_externo,
    hora_limite: fila.hora_limite.slice(0, 5),
  };
}

/** Un ítem de la lista "Para activar falta" de UI-SPEC §8.2. */
export type Faltante = {
  campo: keyof ApartamentoInput;
  etiqueta: string;
};

/** ¿El formulario mandó este campo vacío? `0` y `false` SÍ son valores presentes. */
function ausente(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (typeof v === 'number') return Number.isNaN(v);
  return false;
}

/**
 * FUENTE ÚNICA de la regla de activación.
 *
 * Esta misma función alimenta las tres cosas de UI-SPEC §8.2:
 *   1. la lista en vivo "Para activar falta" (recalculada con `watch()`),
 *   2. el `disabled` del botón `Guardar y activar`,
 *   3. el tooltip que repite la primera carencia.
 *
 * NO duplicar esta lógica con un `if` en el componente: un `if` duplicado entre el
 * checklist y la validación es EXACTAMENTE cómo la UI se desincroniza del contrato.
 * Si hay que cambiar la regla, se cambia aquí y en `esquemaActivar`, y el test
 * cruzado de `apartamento.schema.test.ts` verifica que los dos coincidan.
 *
 * El orden del array es el orden en que se pinta el checklist.
 */
export function faltantesParaActivar(v: Partial<ApartamentoInput>): Faltante[] {
  // Unidad informativa (gestión externa): ni tarifas ni responsable, pero sí
  // contacto. Es el mismo patrón simétrico, no una excepción.
  if (v.gestion_vivaguest === false) {
    return ausente(v.contacto_externo)
      ? [{ campo: 'contacto_externo', etiqueta: 'Contacto externo' }]
      : [];
  }

  const faltantes: Faltante[] = [];
  if (ausente(v.tarifa_huesped)) {
    faltantes.push({ campo: 'tarifa_huesped', etiqueta: 'Tarifa al huésped' });
  }
  if (ausente(v.pago_aseador)) {
    faltantes.push({ campo: 'pago_aseador', etiqueta: 'Pago al aseador' });
  }
  if (ausente(v.responsable_id)) {
    faltantes.push({ campo: 'responsable_id', etiqueta: 'Aseador responsable' });
  }
  return faltantes;
}
