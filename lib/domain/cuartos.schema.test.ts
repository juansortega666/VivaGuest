import { describe, expect, it } from 'vitest';

import {
  MSG_CUARTO_DUPLICADO,
  MSG_FALTANTE_DUPLICADO,
  esquemaCuartos,
  esquemaFaltantes,
  esquemaFormularioActivar,
  esquemaFormularioBorrador,
} from './cuartos.schema';
import { mapDbError } from './errors';
import {
  IDX_MIC_PROP_UNIQ,
  IDX_PROPERTY_ROOMS_ETIQUETA_UNIQ,
} from './constants';

/**
 * Sección 5 del formulario (UI-SPEC §8.1): los dos arrays y su unicidad.
 *
 * ── LO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ─────────────────────────────────
 * Un array de longitud variable es el sitio natural de dos falsos verdes:
 *
 *  1. Una aserción de "no salió error de duplicado" pasa TRIVIALMENTE cuando no
 *     había filas que comparar. Cada negativa de este archivo lleva su CONTROL:
 *     el mismo esquema, en el mismo test, diciendo que SI hay error con datos
 *     que sí colisionan.
 *  2. Un issue emitido en la RAIZ del array pasaría cualquier `success === false`
 *     igual de bien que uno emitido en el índice correcto, y la diferencia es
 *     que en pantalla el mensaje aparece bajo la fila culpable o suelto encima
 *     de la lista. Por eso todas las aserciones miran el `path` completo.
 */

const TIPO_A = '5eed0020-0000-4000-8000-000000000002'; // habitacion
const TIPO_B = '5eed0020-0000-4000-8000-000000000003'; // bano

function cuarto(etiqueta: string, sort_order = 0, room_type_id = TIPO_A) {
  return { room_type_id, etiqueta, sort_order };
}

function falta(nombre: string, sort_order = 0) {
  return { nombre, sort_order };
}

describe('esquemaCuartos', () => {
  it('acepta un array vacío: un apartamento se puede guardar sin cuartos', () => {
    const r = esquemaCuartos.safeParse([]);
    expect(r.success).toBe(true);
    expect(r.data).toEqual([]);
  });

  it('acepta varios cuartos con etiquetas distintas', () => {
    const r = esquemaCuartos.safeParse([
      cuarto('Habitación 1', 0),
      cuarto('Baño social', 1, TIPO_B),
    ]);
    expect(r.success).toBe(true);
  });

  it('rechaza una etiqueta vacía y también la de solo espacios', () => {
    const vacia = esquemaCuartos.safeParse([cuarto('')]);
    expect(vacia.success).toBe(false);
    expect(vacia.error?.issues[0].path).toEqual([0, 'etiqueta']);

    // En pantalla `'   '` es indistinguible de vacío, y guardado produce un
    // cuarto sin nombre en el checklist del aseador.
    const espacios = esquemaCuartos.safeParse([cuarto('   ')]);
    expect(espacios.success).toBe(false);
    expect(espacios.error?.issues[0].path).toEqual([0, 'etiqueta']);

    // CONTROL: la misma forma con una etiqueta de verdad pasa. Sin esto, un
    // esquema roto que rechazara TODO daría los dos verdes de arriba.
    expect(esquemaCuartos.safeParse([cuarto('Cocina')]).success).toBe(true);
  });

  it('rechaza dos cuartos con la misma etiqueta y señala el SEGUNDO', () => {
    const r = esquemaCuartos.safeParse([
      cuarto('Baño social', 0),
      cuarto('Otra cosa', 1),
      cuarto('Baño social', 2),
    ]);

    expect(r.success).toBe(false);
    const issues = r.error?.issues ?? [];
    expect(issues).toHaveLength(1);
    // El índice 2, no el 0 y no la raíz: la primera aparición es el cuarto que
    // ya estaba, la segunda es la que el admin acaba de escribir.
    expect(issues[0].path).toEqual([2, 'etiqueta']);
    expect(issues[0].message).toBe(MSG_CUARTO_DUPLICADO);
  });

  it('rechaza dos etiquetas que solo difieren en mayúsculas o en espacios de borde', () => {
    const mayusculas = esquemaCuartos.safeParse([cuarto('Baño'), cuarto('BAÑO', 1)]);
    expect(mayusculas.success).toBe(false);
    expect(mayusculas.error?.issues[0].path).toEqual([1, 'etiqueta']);

    const espacios = esquemaCuartos.safeParse([cuarto('Cocina'), cuarto('  Cocina  ', 1)]);
    expect(espacios.success).toBe(false);
    expect(espacios.error?.issues[0].path).toEqual([1, 'etiqueta']);

    // CONTROL: la UI es MAS ESTRICTA que el índice de la base a propósito
    // (`unique (property_id, etiqueta)` sin `lower`). Este control fija que la
    // regla que se aplica es la estricta y no un `===` que dejaría pasar
    // `Baño`/`BAÑO`, que es lo que la base sí aceptaría.
    expect(esquemaCuartos.safeParse([cuarto('Baño'), cuarto('Baño 2', 1)]).success).toBe(true);
  });

  it('no marca como duplicadas dos filas todavía vacías', () => {
    // Dos filas recién añadidas están vacías las dos. De eso se queja `min(1)`
    // en cada una; añadir además un duplicado daría dos errores por un problema.
    const r = esquemaCuartos.safeParse([cuarto(''), cuarto('', 1)]);
    expect(r.success).toBe(false);
    const mensajes = (r.error?.issues ?? []).map((i) => i.message);
    expect(mensajes).not.toContain(MSG_CUARTO_DUPLICADO);
    expect(mensajes).toHaveLength(2);
  });

  it('rechaza un room_type_id que no sea uuid', () => {
    const r = esquemaCuartos.safeParse([
      { room_type_id: 'habitacion', etiqueta: 'Habitación 1', sort_order: 0 },
    ]);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual([0, 'room_type_id']);

    // CONTROL: el mismo cuarto con un uuid real pasa.
    expect(esquemaCuartos.safeParse([cuarto('Habitación 1')]).success).toBe(true);
  });

  it('pone tope al número de cuartos (T-02-68)', () => {
    const muchos = Array.from({ length: 101 }, (_, i) => cuarto(`Cuarto ${i}`, i));
    expect(esquemaCuartos.safeParse(muchos).success).toBe(false);

    // CONTROL: justo por debajo del tope pasa, así que el rechazo de arriba es
    // por longitud y no porque el generador produzca filas inválidas.
    expect(esquemaCuartos.safeParse(muchos.slice(0, 100)).success).toBe(true);
  });

  it('recorta los espacios de borde de la etiqueta que se va a guardar', () => {
    const r = esquemaCuartos.safeParse([cuarto('  Baño social  ')]);
    expect(r.success).toBe(true);
    expect(r.data?.[0].etiqueta).toBe('Baño social');
  });
});

describe('esquemaFaltantes', () => {
  it('acepta un array vacío', () => {
    expect(esquemaFaltantes.safeParse([]).success).toBe(true);
  });

  it('rechaza dos faltantes con el mismo nombre ignorando mayúsculas', () => {
    const r = esquemaFaltantes.safeParse([falta('Toallas'), falta('toallas', 1)]);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual([1, 'nombre']);
    expect(r.error?.issues[0].message).toBe(MSG_FALTANTE_DUPLICADO);

    // CONTROL: dos nombres distintos pasan.
    expect(esquemaFaltantes.safeParse([falta('Toallas'), falta('Jabón', 1)]).success).toBe(
      true,
    );
  });

  it('rechaza un nombre vacío o de solo espacios', () => {
    expect(esquemaFaltantes.safeParse([falta('')]).success).toBe(false);
    expect(esquemaFaltantes.safeParse([falta('   ')]).success).toBe(false);
    expect(esquemaFaltantes.safeParse([falta('Papel higiénico')]).success).toBe(true);
  });

  it('pone tope al número de faltantes (T-02-68)', () => {
    const muchos = Array.from({ length: 201 }, (_, i) => falta(`Faltante ${i}`, i));
    expect(esquemaFaltantes.safeParse(muchos).success).toBe(false);
    expect(esquemaFaltantes.safeParse(muchos.slice(0, 200)).success).toBe(true);
  });
});

describe('los mensajes de duplicado coinciden con los de mapDbError', () => {
  /**
   * Si estos dos se separan, el mismo problema se le cuenta al admin de dos
   * formas distintas según por dónde llegue: una si lo bloquea el cliente, otra
   * si lo bloquea el 23505. Este test es lo único que los mantiene atados.
   */
  it('property_rooms_etiqueta_uniq da el mismo texto que esquemaCuartos', () => {
    const delaBase = mapDbError({
      code: '23505',
      message: `duplicate key value violates unique constraint "${IDX_PROPERTY_ROOMS_ETIQUETA_UNIQ}"`,
    });
    expect(delaBase).toBe(MSG_CUARTO_DUPLICADO);
  });

  it('mic_prop_uniq da el mismo texto que esquemaFaltantes', () => {
    const delaBase = mapDbError({
      code: '23505',
      message: `duplicate key value violates unique constraint "${IDX_MIC_PROP_UNIQ}"`,
    });
    expect(delaBase).toBe(MSG_FALTANTE_DUPLICADO);
  });
});

/**
 * Los dos esquemas que el formulario resuelve de verdad.
 *
 * Extender uno y olvidar el otro deja el duplicado bloqueado al guardar borrador
 * y suelto al activar (o al revés), y `tsc` no dice nada porque los dos
 * compilan. Estos tests son la única red de esa composición.
 */
describe('esquemaFormularioBorrador y esquemaFormularioActivar', () => {
  const base = {
    nombre: 'Apto de prueba',
    cluster: 'Bogotá 1',
    direccion: '',
    maps_url: '',
    gestion_vivaguest: true,
    tarifa_huesped: 120000,
    pago_aseador: 45000,
    fee_discriminado: false,
    responsable_id: '11111111-1111-4111-8111-111111111111',
    suplente_id: '',
    contacto_externo: '',
    hora_limite: '11:30',
    cuartos: [] as ReturnType<typeof cuarto>[],
    faltantes: [] as ReturnType<typeof falta>[],
  };

  it('los dos bloquean un cuarto duplicado, bajo la fila correcta', () => {
    const conDuplicado = {
      ...base,
      cuartos: [cuarto('Baño social', 0), cuarto('baño social', 1, TIPO_B)],
    };

    for (const [nombre, esquema] of [
      ['borrador', esquemaFormularioBorrador],
      ['activar', esquemaFormularioActivar],
    ] as const) {
      const r = esquema.safeParse(conDuplicado);
      expect(r.success, `el esquema de ${nombre} dejó pasar el duplicado`).toBe(false);
      expect(r.error?.issues[0].path).toEqual(['cuartos', 1, 'etiqueta']);
      expect(r.error?.issues[0].message).toBe(MSG_CUARTO_DUPLICADO);
    }
  });

  it('los dos bloquean un faltante duplicado', () => {
    const conDuplicado = { ...base, faltantes: [falta('Toallas'), falta('TOALLAS', 1)] };

    expect(esquemaFormularioBorrador.safeParse(conDuplicado).success).toBe(false);
    const r = esquemaFormularioActivar.safeParse(conDuplicado);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(['faltantes', 1, 'nombre']);
  });

  it('CONTROL: los dos aceptan el mismo apartamento sin duplicados', () => {
    const limpio = {
      ...base,
      cuartos: [cuarto('Habitación 1', 0), cuarto('Baño social', 1, TIPO_B)],
      faltantes: [falta('Toallas')],
    };
    expect(esquemaFormularioBorrador.safeParse(limpio).success).toBe(true);
    expect(esquemaFormularioActivar.safeParse(limpio).success).toBe(true);
  });

  it('LOS CUARTOS NO SON UNA PUERTA DE ACTIVACION: sin cuartos se puede activar', () => {
    // Ningún CHECK de `properties` exige cuartos y ningún REQ lo pide. Este test
    // existe para que nadie los añada a la puerta "por inercia" al ver que la
    // sección 5 está vacía.
    const sinCuartos = { ...base, cuartos: [], faltantes: [] };
    expect(esquemaFormularioActivar.safeParse(sinCuartos).success).toBe(true);
  });

  it('el .extend() NO se comió los refinamientos de apartamento.schema.ts', () => {
    // CONTROL de composición. Sin esto, extender con un `z.object` nuevo que
    // perdiera los `.refine()` heredados pasaría todos los tests de arriba y
    // dejaría las tres puertas de activación abiertas.
    const sinResponsable = { ...base, responsable_id: '' };
    const r = esquemaFormularioActivar.safeParse(sinResponsable);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(['responsable_id']);

    // Y el de borrador SIGUE aceptándolo: es un borrador incompleto legítimo.
    expect(esquemaFormularioBorrador.safeParse(sinResponsable).success).toBe(true);

    // La invariante que vale SIEMPRE también sobrevive en los dos.
    const externaConResponsable = { ...base, gestion_vivaguest: false };
    expect(esquemaFormularioBorrador.safeParse(externaConResponsable).success).toBe(false);
    expect(esquemaFormularioActivar.safeParse(externaConResponsable).success).toBe(false);
  });
});
