/**
 * EL VEREDICTO SOBRE EL CONSUMO DE STORAGE, COMO FUNCIONES PURAS (RET-07).
 *
 * ── POR QUÉ EL VEREDICTO VIVE AQUÍ Y NO EN LA BASE ─────────────────────────
 *
 * `public.consumo_de_storage()` (migración 29) devuelve CUATRO NÚMEROS CRUDOS y
 * ningún booleano: cuánto se usa, contra qué cupo, con qué umbral y desde qué
 * instante se pasó. El "está lleno" se decide aquí.
 *
 * Es la misma separación que ya existe entre `last_success_at` (el dato crudo
 * de la base) y `estadoDeSincronizacion()` (el veredicto en TypeScript), y por
 * la misma razón: un booleano calculado en SQL sería el ÚNICO sitio donde el
 * umbral estaría aplicado, y solo se podría ejercer con `db:test`, que es el
 * ciclo más lento del repo. Aquí el caso del 70% clavado cuesta una línea de
 * tabla.
 *
 * MÓDULO PURO, como todo `lib/domain/`: no importa React, no importa
 * `@supabase/*`, no lee el reloj y no construye clientes. Todo entra por
 * parámetro.
 */

/**
 * Lo que la base devuelve, ya en la forma del dominio.
 *
 * `cruceAt` es el `created_at` DEL OBJETO en que la suma corrida cruzó el
 * umbral, no el instante de la lectura, y es nulo cuando no hay cruce. Ese nulo
 * es lo que apaga la alerta del panel.
 */
export type ConsumoDeStorage = {
  usadoBytes: number;
  cupoBytes: number;
  /** El porcentaje del cupo a partir del cual se alerta. Sale de `app_settings`. */
  umbralPct: number;
  /** `timestamptz` crudo de la base, o nulo si no hay cruce. */
  cruceAt: string | null;
};

/**
 * ¿YA LLEGÓ AL UMBRAL?
 *
 * ── LA COMPARACIÓN ES ENTERA DE LOS DOS LADOS, Y ESO ES EL PUNTO ───────────
 *
 * `usado * 100 >= cupo * umbral`, nunca `porcentajeUsado(c) >= c.umbralPct`.
 * Redondear a porcentaje ANTES de comparar haría que un 69.6% dijera 70 y la
 * alerta saltaría antes de tiempo. En una alarma de capacidad, avisar antes de
 * tiempo es la forma más rápida de que dejen de creerle: el admin ve "70%" y
 * `412 MB de 1 GB`, no cuadran, y la próxima vez no mira.
 *
 * Es exactamente la misma expresión que la migración 29 usa para el instante de
 * cruce. Tienen que ser la misma o el medidor y la alerta se contradicen.
 *
 * ── ES `>=` Y NO `>`, Y TAMBIÉN ES DELIBERADO ─────────────────────────────
 *
 * El requisito dice "superar el 70%" y se implementa como LLEGAR al 70%.
 * Esperar al 70.1% para avisar no compra nada y cuesta el caso exacto que el
 * test fija.
 *
 * ── CUPO CERO O NEGATIVO ES ESTAR LLENO ───────────────────────────────────
 *
 * Sale solo de la aritmética (`usado * 100 >= 0` es cierto para cualquier
 * consumo), y es la respuesta correcta: sin cupo no cabe nada. Coincide con lo
 * que devuelve `porcentajeUsado` en ese mismo caso, que es lo que impide que el
 * medidor diga 100% mientras la alerta calla.
 */
export function superaElUmbral(c: ConsumoDeStorage): boolean {
  return c.usadoBytes * 100 >= c.cupoBytes * c.umbralPct;
}

/**
 * El porcentaje PARA PINTAR. No para decidir: quien decide es
 * `superaElUmbral()`.
 *
 * Con `cupoBytes <= 0` devuelve 100. Un cupo de cero no es una división por
 * cero que haya que esquivar: es estar lleno, y decirlo es más útil que poner
 * un `NaN%` en la cabecera del admin.
 */
export function porcentajeUsado(c: ConsumoDeStorage): number {
  if (c.cupoBytes <= 0) return 100;
  return Math.round((c.usadoBytes * 100) / c.cupoBytes);
}

/**
 * Las cuatro unidades, de mayor a menor. Base 1024, que es lo que significan el
 * gigabyte del free tier de Supabase y los megabytes de `storage_quota_mb`, y
 * la misma base con la que la migración 29 convierte el ajuste a bytes.
 */
const UNIDADES = [
  { sufijo: 'GB', factor: 1024 * 1024 * 1024 },
  { sufijo: 'MB', factor: 1024 * 1024 },
  { sufijo: 'KB', factor: 1024 },
  { sufijo: 'B', factor: 1 },
] as const;

/**
 * Bytes legibles, SIN DECIMALES.
 *
 * `412 MB` se lee de un vistazo; `412.38 MB` no aporta nada en una cabecera y
 * ocupa el doble. La precisión que el admin sí necesita la lleva el porcentaje,
 * que va al lado.
 *
 * ── EL ACARREO, QUE ES LA ÚNICA PARTE NO OBVIA ────────────────────────────
 *
 * Elegir la unidad por `bytes >= factor` y redondear después produce `1024 KB`
 * para 1023.6 KB, que se lee como un error de programación. Por eso, cuando el
 * redondeo alcanza la unidad siguiente, se sube de unidad y sale `1 MB`.
 *
 * Entradas absurdas (negativas, `NaN`) caen en `0 B` en vez de propagar basura
 * a la pantalla. Un consumo negativo no existe; si llegara, el bug está antes.
 */
export function formatearBytes(n: number): string {
  const bytes = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;

  for (let i = 0; i < UNIDADES.length; i++) {
    const u = UNIDADES[i];
    if (bytes < u.factor) continue;

    const valor = Math.round(bytes / u.factor);
    if (valor >= 1024 && i > 0) {
      const mayor = UNIDADES[i - 1];
      return `${Math.round(bytes / mayor.factor)} ${mayor.sufijo}`;
    }
    return `${valor} ${u.sufijo}`;
  }

  return '0 B';
}
