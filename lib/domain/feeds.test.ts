import { describe, expect, test } from 'vitest';

import type { FeedDeApartamento } from '@/lib/data/feeds';

import { saludDelFeed } from './feeds';

/**
 * EL CONTRATO DE LOS TRES ESTADOS DEL FEED. ESCRITO ANTES QUE SU IMPLEMENTACIÓN.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NACE EN ROJO A PROPÓSITO. `lib/domain/feeds.ts` todavía no
 * existe. El UI-SPEC §14.4 decía que sí, y el Hallazgo 8 de `08-RESEARCH.md` lo
 * midió: `grep -rn saludDelFeed` sobre el repo entero devolvía cero.
 *
 * ── QUÉ SE ESTÁ PROTEGIENDO ───────────────────────────────────────────────
 *
 * El grupo `CALENDARIO` del panel (§8.2) tiene tres estados, y la única forma de
 * que se puedan romper desde un test es que la derivación NO viva dentro del
 * componente. Lo que vive en un componente de servidor no tiene, hoy, ninguna
 * prueba en este repo que lo pueda medir.
 *
 * ── EL ORDEN DE EVALUACIÓN ES PARTE DE LA REGLA, NO UN DETALLE ────────────
 *
 * Hay un caso abajo, el quinto, que existe SOLO para fijarlo: un feed apagado
 * que además arrastra fallos. Las dos condiciones son ciertas a la vez y el
 * resultado tiene que ser la ausencia. Si alguien mueve la guarda de la
 * ausencia por debajo de la de los fallos, ese caso se pone rojo y ningún otro.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Un feed sano, con las ocho columnas que `leerFeedDeApartamento()` proyecta.
 * Cada caso lo copia y toca SOLO lo que mide, que es lo que deja ver de un
 * vistazo qué columna es la que decide.
 */
const FEED_SANO: FeedDeApartamento = {
  id: '11111111-1111-4111-8111-111111111111',
  is_active: true,
  last_attempt_at: '2026-09-17T09:42:00+00:00',
  last_success_at: '2026-09-17T09:42:00+00:00',
  last_http_status: 200,
  last_event_count: 24,
  last_error: null,
  consecutive_failures: 0,
};

describe('saludDelFeed', () => {
  test('sin feed, la clave de ausencia', () => {
    // `leerFeedDeApartamento()` devuelve `null` en DOS casos: el apartamento no
    // tiene calendario, y la seguridad a nivel de fila no lo deja ver. La
    // pantalla trata los dos igual, así que el dominio también.
    expect(saludDelFeed(null).clave).toBe('ausente');
  });

  test('un feed apagado es ausencia, aunque acabe de sincronizar', () => {
    // Apagado quiere decir que el cron ya no lo despacha: el calendario no está
    // trayendo nada, y decir otra cosa sería prometer aseos que no van a nacer.
    const apagado = { ...FEED_SANO, is_active: false };
    expect(saludDelFeed(apagado).clave).toBe('ausente');
  });

  test('un feed activo con tres fallos seguidos los reporta, con el número', () => {
    const fallando = { ...FEED_SANO, consecutive_failures: 3 };
    expect(saludDelFeed(fallando)).toEqual({ clave: 'con-fallos', fallos: 3 });
  });

  test('un solo fallo ya cuenta: el umbral es uno, no una racha', () => {
    expect(saludDelFeed({ ...FEED_SANO, consecutive_failures: 1 }).clave).toBe('con-fallos');
  });

  test('un feed activo sin fallos está sano', () => {
    expect(saludDelFeed(FEED_SANO)).toEqual({ clave: 'sano', fallos: 0 });
  });

  test('EL ORDEN: apagado Y con fallos es ausencia, no fallo', () => {
    // El caso que fija la regla. Las dos condiciones son ciertas a la vez, y la
    // que manda es la primera de la tabla de §8.2. Un feed que alguien apagó
    // porque fallaba no se anuncia como "falla", se anuncia como que no está.
    const apagadoYRoto = { ...FEED_SANO, is_active: false, consecutive_failures: 7 };
    expect(saludDelFeed(apagadoYRoto).clave).toBe('ausente');
  });

  test('un feed activo y sin fallos está sano aunque no haya sincronizado nunca', () => {
    // Recién conectado: `last_success_at` en nulo. El estado NO depende de haber
    // sincronizado alguna vez; si dependiera, el panel diría que algo va mal
    // durante los primeros treinta minutos de todos los calendarios nuevos.
    const recienConectado = {
      ...FEED_SANO,
      last_success_at: null,
      last_attempt_at: null,
      last_http_status: null,
      last_event_count: null,
    };
    expect(saludDelFeed(recienConectado).clave).toBe('sano');
  });

  test('ninguna rama devuelve texto de pantalla', () => {
    // El copy de §15.2 vive en el componente, que es la disciplina de
    // `estadoDeAseo()`. Esta aserción es lo que impide que alguien "ahorre" un
    // paso metiendo la etiqueta aquí: las tres claves son slugs sin tildes, sin
    // espacios y sin mayúsculas.
    const claves = [
      saludDelFeed(null).clave,
      saludDelFeed({ ...FEED_SANO, consecutive_failures: 2 }).clave,
      saludDelFeed(FEED_SANO).clave,
    ];

    for (const clave of claves) {
      expect(clave).toMatch(/^[a-z-]+$/);
    }
  });

  test('el número de fallos viaja en las tres ramas, también en la de ausencia', () => {
    // Para que el consumidor no tenga que volver a la fila del feed si quiere
    // ponerlo en un `title`. En la ausencia es cero, que es lo honesto: sin
    // feed no hay fallos que contar.
    expect(saludDelFeed(null).fallos).toBe(0);
    expect(saludDelFeed({ ...FEED_SANO, is_active: false }).fallos).toBe(0);
    expect(saludDelFeed({ ...FEED_SANO, consecutive_failures: 5 }).fallos).toBe(5);
  });
});
