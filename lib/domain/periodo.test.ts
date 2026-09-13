import { describe, expect, it } from 'vitest';

import { contieneHoy, etiquetaDeRango, rangoDePeriodo } from './periodo';

/**
 * EL CONTRATO DEL FILTRO DE PERIODO DEL RESUMEN. ESCRITO ANTES QUE SU CÓDIGO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NACE EN ROJO A PROPÓSITO. `lib/domain/periodo.ts` todavía no
 * existe; lo escribe el plan 07-06 contra estas aserciones.
 *
 * ── LA PALABRA "MES" SIGNIFICA DOS COSAS DISTINTAS (UI-SPEC §6.2.1) ────────
 *
 * En el RESUMEN, `mes` es el mes calendario: del 1 al 30 de septiembre. Es una
 * vista viva que se recalcula.
 *
 * En PAGOS, el periodo va de CIERRE A CIERRE (D7-5): el de enero de 2026 es del
 * 1 al 30 porque el 31 es sábado, y ese 31 pertenece al periodo siguiente.
 *
 * ESTE MÓDULO ES EL DEL RESUMEN Y NO DEBE REUTILIZAR EL CALENDARIO DE CIERRE.
 * Hay una aserción abajo que lo fija con fecha real, porque la tentación de
 * "unificar los dos calendarios" es exactamente el defecto más caro que esta
 * pantalla puede producir: el admin transfiriendo plata calculada sobre un mes
 * calendario que no coincide con el periodo que la persona cobró.
 *
 * ── LA SEMANA ARRANCA EN LUNES ────────────────────────────────────────────
 *
 * Es lo que espera un calendario colombiano, y se declara aquí para que no lo
 * decida una librería por su cuenta. El caso que decide si está bien resuelto
 * es el ancla EN DOMINGO: con la semana en base domingo, ese día abre la semana
 * siguiente en vez de cerrar la suya, y el filtro salta siete días sin avisar.
 *
 * ── PROHIBIDO EL CONSTRUCTOR NATIVO SOBRE UNA CADENA DE SOLO FECHA ────────
 *
 * `new Date('2026-09-13')` se parsea como medianoche en tiempo universal y en
 * Bogotá renderiza el día anterior. Aquí no se construye ninguna fecha: se
 * comparan cadenas `'YYYY-MM-DD'`, que es el orden lexicográfico correcto.
 * ════════════════════════════════════════════════════════════════════════════
 */

describe('rangoDePeriodo, rango de día', () => {
  it('desde y hasta son el mismo día', () => {
    expect(rangoDePeriodo('dia', '2026-09-10')).toEqual({
      desde: '2026-09-10',
      hasta: '2026-09-10',
    });
  });

  it('no se desplaza en ningún borde de mes ni de año', () => {
    // Un día es un día. Se ejercen los dos bordes porque una implementación que
    // pasara por un instante los movería justo aquí.
    expect(rangoDePeriodo('dia', '2026-01-01')).toEqual({
      desde: '2026-01-01',
      hasta: '2026-01-01',
    });
    expect(rangoDePeriodo('dia', '2026-12-31')).toEqual({
      desde: '2026-12-31',
      hasta: '2026-12-31',
    });
    expect(rangoDePeriodo('dia', '2028-02-29')).toEqual({
      desde: '2028-02-29',
      hasta: '2028-02-29',
    });
  });
});

describe('rangoDePeriodo, rango de semana', () => {
  it('arranca en LUNES y termina en domingo', () => {
    // El 10 de septiembre de 2026 es jueves. Su semana va del lunes 7 al
    // domingo 13.
    expect(rangoDePeriodo('semana', '2026-09-10')).toEqual({
      desde: '2026-09-07',
      hasta: '2026-09-13',
    });
  });

  it('UN ANCLA EN DOMINGO CIERRA SU SEMANA, NO ABRE LA SIGUIENTE', () => {
    // EL CASO QUE DECIDE ESTE MÓDULO, y donde se equivoca la mayoría de las
    // implementaciones: el 13 de septiembre de 2026 es domingo. Con la semana en
    // base domingo —que es el default de buena parte del ecosistema— devolvería
    // del 13 al 19, y el filtro saltaría siete días hacia adelante sin que nada
    // lo diga. El admin vería los números de la semana que todavía no ha
    // ocurrido creyendo que son los de la que acaba de terminar.
    expect(rangoDePeriodo('semana', '2026-09-13')).toEqual({
      desde: '2026-09-07',
      hasta: '2026-09-13',
    });
  });

  it('un ancla en LUNES abre su propia semana y no retrocede una entera', () => {
    // El otro extremo del mismo error, en el otro sentido: una implementación
    // que reste siempre siete días para "ir al lunes" devolvería la semana
    // anterior cuando el ancla YA es lunes.
    expect(rangoDePeriodo('semana', '2026-09-07')).toEqual({
      desde: '2026-09-07',
      hasta: '2026-09-13',
    });
  });

  it('los siete días de la semana con la misma ancla de semana dan el MISMO rango', () => {
    // Propiedad, no caso: los siete días del lunes 7 al domingo 13 de septiembre
    // de 2026 tienen que producir un único rango. Cubre de una vez los cinco
    // días intermedios que los casos de arriba no nombran.
    const esperado = { desde: '2026-09-07', hasta: '2026-09-13' };
    for (const dia of [7, 8, 9, 10, 11, 12, 13]) {
      const iso = `2026-09-${String(dia).padStart(2, '0')}`;
      expect(rangoDePeriodo('semana', iso), `falló con ancla ${iso}`).toEqual(esperado);
    }
  });

  it('cruza el mes sin recortarse', () => {
    // El 1 de octubre de 2026 es jueves. Su semana empieza el lunes 28 de
    // SEPTIEMBRE. Una implementación que recortara al primer día del mes daría
    // un rango de cuatro días y los KPIs de esa semana saldrían cortos.
    expect(rangoDePeriodo('semana', '2026-10-01')).toEqual({
      desde: '2026-09-28',
      hasta: '2026-10-04',
    });
  });

  it('cruza el AÑO sin recortarse', () => {
    // El 1 de enero de 2027 es viernes. Su semana empieza el lunes 28 de
    // DICIEMBRE de 2026.
    expect(rangoDePeriodo('semana', '2027-01-01')).toEqual({
      desde: '2026-12-28',
      hasta: '2027-01-03',
    });
  });
});

describe('rangoDePeriodo, rango de mes', () => {
  it('va del primero al último día del MES CALENDARIO', () => {
    expect(rangoDePeriodo('mes', '2026-09-13')).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-30',
    });
  });

  it('NO ES EL PERIODO DE PAGO, y enero de 2026 es donde se ve', () => {
    // LA ASERCIÓN QUE SEPARA LOS DOS CALENDARIOS (UI-SPEC §6.2.1).
    //
    // El 31 de enero de 2026 es sábado. En PAGOS, el periodo de enero termina el
    // viernes 30 y el 31 pertenece a febrero. En el RESUMEN, el mes es el mes
    // calendario y termina el 31.
    //
    // Los dos son correctos, cada uno en su pantalla. Unificarlos es el defecto
    // más caro que esta pantalla puede producir, y esta es la aserción que lo
    // atrapa el día que alguien lo intente.
    const rango = rangoDePeriodo('mes', '2026-01-15');
    expect(rango).toEqual({ desde: '2026-01-01', hasta: '2026-01-31' });
    expect(rango.hasta).not.toBe('2026-01-30');
  });

  it('acepta cualquier día del mes, incluidos los dos extremos', () => {
    const esperado = { desde: '2026-01-01', hasta: '2026-01-31' };
    expect(rangoDePeriodo('mes', '2026-01-01')).toEqual(esperado);
    expect(rangoDePeriodo('mes', '2026-01-31')).toEqual(esperado);
  });

  it('resuelve febrero, con y sin año bisiesto', () => {
    // El caso donde una tabla de longitudes de mes escrita a mano falla.
    expect(rangoDePeriodo('mes', '2026-02-14')).toEqual({
      desde: '2026-02-01',
      hasta: '2026-02-28',
    });
    expect(rangoDePeriodo('mes', '2028-02-14')).toEqual({
      desde: '2028-02-01',
      hasta: '2028-02-29',
    });
  });
});

describe('etiquetaDeRango', () => {
  it('el rango de DÍA lleva el día de la semana, con el copy de UI-SPEC §11.2', () => {
    // El 10 de septiembre de 2026 es jueves.
    expect(etiquetaDeRango('dia', '2026-09-10', '2026-09-10')).toBe('jueves 10 de septiembre');
  });

  it('el rango de SEMANA es un rango explícito', () => {
    expect(etiquetaDeRango('semana', '2026-09-07', '2026-09-13')).toBe(
      'del 7 al 13 de septiembre',
    );
  });

  it('la semana que cruza el mes NOMBRA LOS DOS MESES', () => {
    // "del 28 al 4 de octubre" no significa nada. Con D7-5 fuera de juego aquí,
    // esta es la única ambigüedad que la etiqueta del filtro puede producir, y
    // ocurre una de cada cuatro semanas.
    expect(etiquetaDeRango('semana', '2026-09-28', '2026-10-04')).toBe(
      'del 28 de septiembre al 4 de octubre',
    );
  });

  it('la semana que cruza el año se rotula con la misma regla', () => {
    expect(etiquetaDeRango('semana', '2026-12-28', '2027-01-03')).toBe(
      'del 28 de diciembre al 3 de enero',
    );
  });

  it('el rango de MES lleva mes y año', () => {
    // Con año, a diferencia de los otros dos: es el rango por defecto de la
    // pantalla y el que alguien puede estar mirando después de navegar hacia
    // atrás varios meses.
    expect(etiquetaDeRango('mes', '2026-09-01', '2026-09-30')).toBe('septiembre de 2026');
    expect(etiquetaDeRango('mes', '2027-01-01', '2027-01-31')).toBe('enero de 2027');
  });

  it('los meses van en minúscula, como en el resto del producto', () => {
    // `Intl` en es-CO ya los devuelve así, pero la etiqueta se compone a mano y
    // una mayúscula suelta aquí rompe la homogeneidad de la cabecera.
    for (const mes of [1, 6, 12]) {
      const iso = `2026-${String(mes).padStart(2, '0')}`;
      const etiqueta = etiquetaDeRango('mes', `${iso}-01`, `${iso}-28`);
      expect(etiqueta[0], `"${etiqueta}" empieza en mayúscula`).toBe(etiqueta[0].toLowerCase());
    }
  });
});

describe('contieneHoy', () => {
  it('es verdadero EN LOS DOS EXTREMOS del rango, no solo en el interior', () => {
    // Gobierna dos cosas a la vez: el chevron de "periodo siguiente" va
    // deshabilitado cuando el periodo ya contiene hoy, y el botón de volver a
    // hoy solo se renderiza cuando NO lo contiene.
    //
    // Con una comparación estricta en los extremos, el primer y el último día de
    // cada mes el admin vería un chevron habilitado hacia un futuro que no
    // existe Y un botón de "Hoy" estando en hoy. Los dos extremos importan.
    expect(contieneHoy('2026-09-01', '2026-09-30', '2026-09-01')).toBe(true);
    expect(contieneHoy('2026-09-01', '2026-09-30', '2026-09-30')).toBe(true);
    expect(contieneHoy('2026-09-01', '2026-09-30', '2026-09-15')).toBe(true);
  });

  it('es falso fuera del rango, por un solo día a cada lado', () => {
    expect(contieneHoy('2026-09-01', '2026-09-30', '2026-08-31')).toBe(false);
    expect(contieneHoy('2026-09-01', '2026-09-30', '2026-10-01')).toBe(false);
  });

  it('funciona sobre un rango de un solo día', () => {
    // Es el rango de `día`, y es donde un cálculo con aritmética de instantes se
    // rompe: el rango tiene duración cero.
    expect(contieneHoy('2026-09-10', '2026-09-10', '2026-09-10')).toBe(true);
    expect(contieneHoy('2026-09-10', '2026-09-10', '2026-09-11')).toBe(false);
  });

  it('NO LEE EL RELOJ: el día de hoy entra por parámetro', () => {
    // La razón es la de siempre en este repo: el proceso corre en tiempo
    // universal y pasadas las 19:00 de Bogotá un reloj leído aquí ya dice
    // mañana. El día de negocio lo resuelve `hoyBog()` o la base, y este módulo
    // solo compara.
    //
    // Se comprueba pasando dos "hoy" distintos sobre el mismo rango: si la
    // función leyera el reloj, los dos darían lo mismo.
    expect(contieneHoy('2026-09-01', '2026-09-30', '2026-09-15')).toBe(true);
    expect(contieneHoy('2026-09-01', '2026-09-30', '2027-09-15')).toBe(false);
  });
});
