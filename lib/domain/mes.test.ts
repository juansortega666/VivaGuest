import { describe, expect, it } from 'vitest';

import { sumarDias } from './dates';
import { etiquetaDePeriodoDePago, periodoDeCierre, ultimoDiaHabilDelMes } from './mes';

/**
 * EL CONTRATO DEL CALENDARIO DE CIERRE. ESCRITO ANTES QUE SU IMPLEMENTACIÓN.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NACE EN ROJO A PROPÓSITO. `lib/domain/mes.ts` todavía no existe;
 * lo escribe el plan 07-06 contra estas aserciones. Un verde aquí hoy
 * significaría que el test no mide nada.
 *
 * ── POR QUÉ EXISTE UN GEMELO EN TYPESCRIPT SI LA BASE YA SABE CERRAR ───────
 *
 * Porque la base decide cuándo cierra y la pantalla dice cuándo cierra, y son
 * dos sitios. La Fase 6 encontró una divergencia real el primer día que corrió
 * su test de paridad: el dashboard decía una cosa y el teléfono otra, sobre el
 * mismo aseo y el mismo día, y nadie mira las dos pantallas a la vez.
 *
 * La mitigación acordada al aceptar la duplicación es `mes.integration.test.ts`,
 * que compara las dos implementaciones sobre los 36 meses de 2026 a 2028. Este
 * archivo es la otra mitad: fija QUÉ tiene que decir la de TypeScript. Hacen
 * falta los dos. Con solo la paridad, las dos podrían equivocarse igual.
 *
 * ── LA REGLA, COMPLETA, Y DE DÓNDE SALE ───────────────────────────────────
 *
 * El mes cierra el último día hábil: si el último día del mes cae en sábado o
 * en domingo, se retrocede al viernes. SIN FESTIVOS, por decisión explícita del
 * ROADMAP y confirmada en `07-CONTEXT.md`. Una librería de días hábiles aquí
 * INTRODUCE el defecto en vez de evitarlo, porque incluiría los festivos que el
 * requisito excluye. Hay un caso abajo que lo deja escrito con fecha real.
 *
 * El periodo va de cierre a cierre (D7-5), y un aseo cuenta en el periodo en que
 * SE COMPLETÓ (D7-8). Juntas, las dos eliminan los días huérfanos: no existe
 * ningún día que no pertenezca a ningún periodo.
 *
 * ── PROHIBIDO EL CONSTRUCTOR NATIVO SOBRE UNA CADENA DE SOLO FECHA ─────────
 *
 * `new Date('2026-01-31')` se parsea como medianoche en tiempo universal y en
 * Bogotá renderiza el día anterior. Por eso todo lo que necesita aritmética de
 * calendario en este archivo pasa por `sumarDias` de `lib/domain/dates.ts` o por
 * el helper de abajo, que ancla en UTC sobre componentes ya partidos.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Día de la semana de un día de negocio. 0 es domingo y 6 es sábado.
 *
 * Se parte la cadena y se ancla con `Date.UTC`, que es la forma sancionada por
 * `lib/domain/dates.ts`: no hay conversión de zona, solo aritmética de
 * calendario sobre componentes que ya vienen resueltos.
 */
function diaDeLaSemana(iso: string): number {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Los 36 meses de 2026 a 2028, GENERADOS. Una lista literal se queda corta sola. */
const MESES: string[] = [];
for (const ano of [2026, 2027, 2028]) {
  for (let mes = 1; mes <= 12; mes += 1) {
    MESES.push(`${ano}-${String(mes).padStart(2, '0')}`);
  }
}

describe('ultimoDiaHabilDelMes', () => {
  it('un mes que termina ENTRE SEMANA cierra su último día', () => {
    // 30 de septiembre de 2026 es miércoles. No hay nada que retroceder.
    expect(ultimoDiaHabilDelMes('2026-09-13')).toBe('2026-09-30');
    // 31 de agosto de 2026 es lunes.
    expect(ultimoDiaHabilDelMes('2026-08-01')).toBe('2026-08-31');
    // 31 de diciembre de 2026 es jueves.
    expect(ultimoDiaHabilDelMes('2026-12-25')).toBe('2026-12-31');
  });

  it('un mes que termina en SÁBADO cierra el viernes anterior', () => {
    // 31 de enero de 2026 es sábado. Es el caso de UI-SPEC §11.3: el periodo de
    // enero de 2026 es "Del 1 al 30", y esa es exactamente la razón por la que
    // la etiqueta lleva SIEMPRE las dos fechas y nunca solo el nombre del mes.
    expect(ultimoDiaHabilDelMes('2026-01-15')).toBe('2026-01-30');
    // 31 de octubre de 2026 es sábado.
    expect(ultimoDiaHabilDelMes('2026-10-01')).toBe('2026-10-30');
    // 28 de febrero de 2026 es sábado. Febrero, además, sin año bisiesto.
    expect(ultimoDiaHabilDelMes('2026-02-14')).toBe('2026-02-27');
  });

  it('un mes que termina en DOMINGO cierra el viernes anterior, retrocediendo DOS días', () => {
    // 31 de mayo de 2026 es domingo. Es el caso donde una implementación que
    // reste un día fijo se equivoca: devolvería el sábado 30.
    expect(ultimoDiaHabilDelMes('2026-05-20')).toBe('2026-05-29');
    // 31 de enero de 2027 es domingo.
    expect(ultimoDiaHabilDelMes('2027-01-10')).toBe('2027-01-29');
    // 31 de diciembre de 2028 es domingo. Cierre de año, además.
    expect(ultimoDiaHabilDelMes('2028-12-05')).toBe('2028-12-29');
  });

  it('acepta CUALQUIER día del mes, incluido el propio día de cierre', () => {
    // La firma recibe un día, no un mes: el llamante casi nunca tiene el primero
    // a mano. Los tres días de abajo son del mismo mes y tienen que dar lo mismo.
    expect(ultimoDiaHabilDelMes('2026-01-01')).toBe('2026-01-30');
    expect(ultimoDiaHabilDelMes('2026-01-30')).toBe('2026-01-30');
    expect(ultimoDiaHabilDelMes('2026-01-31')).toBe('2026-01-30');
  });

  it('EL AÑO BISIESTO no desplaza el cierre de febrero', () => {
    // 29 de febrero de 2028 es martes: cierra ahí mismo. Es el caso donde una
    // implementación con una tabla de longitudes de mes escrita a mano falla.
    expect(ultimoDiaHabilDelMes('2028-02-10')).toBe('2028-02-29');
  });

  it('UN FESTIVO COLOMBIANO NO MUEVE EL CIERRE, y es decisión explícita', () => {
    // El 30 de junio de 2025 es lunes Y es festivo en Colombia: San Pedro y San
    // Pablo cae en domingo 29 y la ley Emiliani lo traslada al lunes siguiente.
    // Aun así, el mes cierra ese día.
    //
    // Está escrito con fecha real y no como comentario suelto porque es la
    // aserción que impide que alguien "arregle" esta función metiéndole una
    // librería de días hábiles. Esa librería introduciría el defecto, no lo
    // evitaría: el ROADMAP excluye los festivos expresamente, y la base hace lo
    // mismo. Si un día el dueño cambia de opinión, se cambian LAS DOS
    // implementaciones a la vez y este test es el que obliga a acordarse.
    expect(ultimoDiaHabilDelMes('2025-06-15')).toBe('2025-06-30');
    expect(diaDeLaSemana('2025-06-30')).toBe(1);
  });

  it('sobre los 36 meses de 2026 a 2028, el cierre NUNCA cae en fin de semana', () => {
    // Propiedad, no caso. Una entrada nueva mal calculada la pone en rojo sola,
    // sin que nadie tenga que acordarse de añadir un caso.
    for (const mes of MESES) {
      const cierre = ultimoDiaHabilDelMes(`${mes}-15`);
      const dia = diaDeLaSemana(cierre);
      expect(dia, `${mes} cierra el ${cierre}, que es fin de semana`).not.toBe(0);
      expect(dia, `${mes} cierra el ${cierre}, que es fin de semana`).not.toBe(6);
    }
  });

  it('sobre los 36 meses, el cierre siempre pertenece a SU mes y está en los últimos tres días', () => {
    // La segunda mitad de la propiedad: no basta con que sea un día hábil, tiene
    // que ser EL ÚLTIMO. Retroceder de más se va como mucho al día 29 de un mes
    // de 31, así que la ventana de tres días es estrecha y aun así siempre
    // cierta.
    for (const mes of MESES) {
      const cierre = ultimoDiaHabilDelMes(`${mes}-15`);
      expect(cierre.slice(0, 7), `el cierre de ${mes} se salió de su mes`).toBe(mes);

      // El día siguiente al cierre, o es de otro mes, o es fin de semana. No hay
      // tercera opción: si fuera un día hábil del mismo mes, el cierre estaría
      // mal calculado.
      const siguiente = sumarDias(cierre, 1);
      const esDeOtroMes = siguiente.slice(0, 7) !== mes;
      const esFinDeSemana = diaDeLaSemana(siguiente) === 0 || diaDeLaSemana(siguiente) === 6;
      expect(
        esDeOtroMes || esFinDeSemana,
        `${mes} cierra el ${cierre} y el ${siguiente} todavía es un día hábil del mismo mes`,
      ).toBe(true);
    }
  });
});

describe('periodoDeCierre', () => {
  it('el periodo de un día va del día siguiente al cierre anterior hasta el cierre de su mes', () => {
    // Diciembre de 2025 cierra el miércoles 31, así que enero de 2026 empieza el
    // 1. Y enero cierra el viernes 30, porque el 31 es sábado. Es literalmente
    // el "Del 1 al 30 de enero de 2026" de UI-SPEC §11.3.
    expect(periodoDeCierre('2026-01-15')).toEqual({
      desde: '2026-01-01',
      hasta: '2026-01-30',
    });
  });

  it('el periodo ARRASTRA los días que el mes anterior dejó fuera', () => {
    // Enero cerró el 30, así que el 31 de enero es del periodo de febrero. El
    // periodo de febrero de 2026 no empieza el 1 de febrero: empieza el 31 de
    // enero. Es la mitad del valor de D7-5 y la razón por la que la cabecera del
    // snapshot necesita dos columnas de fecha reales y no una etiqueta de mes.
    expect(periodoDeCierre('2026-02-10')).toEqual({
      desde: '2026-01-31',
      hasta: '2026-02-27',
    });
  });

  it('UN DÍA POSTERIOR AL CIERRE DE SU MES PERTENECE AL PERIODO DEL MES SIGUIENTE', () => {
    // D7-5 y D7-8 juntos, y lo que elimina los días huérfanos. El 31 de enero de
    // 2026 es sábado y cae después del cierre del 30: un aseo terminado ese día
    // se paga en febrero, no en enero.
    expect(periodoDeCierre('2026-01-31')).toEqual({
      desde: '2026-01-31',
      hasta: '2026-02-27',
    });

    // Y no es un caso de un solo día: mayo de 2026 cierra el viernes 29, así que
    // el sábado 30 y el domingo 31 son los dos del periodo de junio.
    expect(periodoDeCierre('2026-05-30')).toEqual({ desde: '2026-05-30', hasta: '2026-06-30' });
    expect(periodoDeCierre('2026-05-31')).toEqual({ desde: '2026-05-30', hasta: '2026-06-30' });
  });

  it('el DÍA DE CIERRE pertenece a su propio periodo, no al siguiente', () => {
    // El extremo inclusivo, y el que decide el aseo de las 23:30. Una
    // comparación estricta aquí manda el trabajo del último día al periodo
    // siguiente y una persona cobra de menos.
    expect(periodoDeCierre('2026-01-30')).toEqual({
      desde: '2026-01-01',
      hasta: '2026-01-30',
    });
  });

  it('el PRIMER DÍA del periodo pertenece al periodo, no al anterior', () => {
    // El otro extremo. Los dos son inclusivos.
    expect(periodoDeCierre('2026-02-27')).toEqual({ desde: '2026-01-31', hasta: '2026-02-27' });
    expect(periodoDeCierre('2026-01-31')).toEqual({ desde: '2026-01-31', hasta: '2026-02-27' });
  });

  it('CRUZA EL AÑO sin desviarse: de diciembre a enero', () => {
    // Diciembre de 2026 termina en jueves, así que cierra el 31 y el periodo de
    // enero de 2027 empieza limpio el día 1. Enero de 2027 termina en domingo:
    // cierra el viernes 29.
    expect(periodoDeCierre('2026-12-15')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
    expect(periodoDeCierre('2027-01-15')).toEqual({ desde: '2027-01-01', hasta: '2027-01-29' });
  });

  it('CRUZA EL AÑO también cuando diciembre deja días huérfanos', () => {
    // El 31 de diciembre de 2028 es domingo: diciembre cierra el viernes 29 y
    // los días 30 y 31 son del periodo de ENERO DE 2029. El cambio de año no es
    // una frontera del periodo de pago, y quien lo trate como tal deja dos días
    // de trabajo sin pagar en el peor momento posible del calendario.
    expect(periodoDeCierre('2028-12-30')).toEqual({ desde: '2028-12-30', hasta: '2029-01-31' });
    expect(periodoDeCierre('2028-12-31')).toEqual({ desde: '2028-12-30', hasta: '2029-01-31' });
    expect(periodoDeCierre('2028-12-29')).toEqual({ desde: '2028-12-01', hasta: '2028-12-29' });
  });

  it('el periodo siempre CONTIENE el día que se le pregunta', () => {
    // Propiedad elemental y la que ninguna otra aserción cubre entera: si
    // `periodoDeCierre` devolviera un rango que no contiene su argumento, todos
    // los casos concretos de arriba podrían seguir pasando.
    for (const mes of MESES) {
      for (const dia of ['01', '15', '28']) {
        const iso = `${mes}-${dia}`;
        const { desde, hasta } = periodoDeCierre(iso);
        expect(desde <= iso, `${iso} queda antes de su periodo (${desde} .. ${hasta})`).toBe(true);
        expect(iso <= hasta, `${iso} queda después de su periodo (${desde} .. ${hasta})`).toBe(
          true,
        );
      }
    }
  });

  it('DOS PERIODOS CONSECUTIVOS SON CONTIGUOS Y NO SE SOLAPAN, sobre los 36 meses', () => {
    // LA ASERCIÓN QUE ELIMINA LOS DÍAS HUÉRFANOS, y la única que los detecta.
    //
    // Un hueco de un día entre dos periodos es trabajo que nadie paga. Un día
    // solapado es trabajo que se paga dos veces. Los dos son invisibles en una
    // pantalla y los dos cuestan dinero real.
    //
    // Se recorren los meses GENERADOS y no una lista escrita a mano: una lista
    // literal se queda corta el día que alguien amplíe el rango, y el mes que
    // falte va a ser justo el raro.
    for (let i = 0; i < MESES.length - 1; i += 1) {
      const actual = periodoDeCierre(`${MESES[i]}-15`);
      const siguiente = periodoDeCierre(`${MESES[i + 1]}-15`);

      // Contiguos: el siguiente empieza el día después de que acaba el actual.
      expect(
        siguiente.desde,
        `hueco o solape entre ${MESES[i]} (termina ${actual.hasta}) y ${MESES[i + 1]} (empieza ${siguiente.desde})`,
      ).toBe(sumarDias(actual.hasta, 1));

      // Y no degenerados: un periodo de pago dura del orden de un mes.
      expect(actual.desde < actual.hasta, `el periodo de ${MESES[i]} está invertido`).toBe(true);
    }
  });
});

describe('etiquetaDePeriodoDePago', () => {
  it('lleva SIEMPRE las dos fechas, con el copy exacto de UI-SPEC §11.3', () => {
    expect(etiquetaDePeriodoDePago('2026-01-01', '2026-01-30')).toBe(
      'Del 1 al 30 de enero de 2026',
    );
  });

  it('lleva las dos fechas TAMBIÉN cuando el periodo coincide con el mes calendario completo', () => {
    // Diciembre de 2026 cierra el 31, así que su periodo es el mes entero. Y aun
    // así se escribe igual.
    //
    // Un formato que cambia según el caso obliga a leer con atención justo el
    // día en que no coincide, que es el día en que importa. Es la regla de
    // UI-SPEC §11.3, literal.
    expect(etiquetaDePeriodoDePago('2026-12-01', '2026-12-31')).toBe(
      'Del 1 al 31 de diciembre de 2026',
    );
  });

  it('nombra LOS DOS MESES cuando el periodo los cruza, que es el caso normal', () => {
    // Con D7-5, un periodo que cruza el mes no es la excepción: ocurre cada vez
    // que el mes anterior termina en fin de semana. "Del 31 al 27 de febrero" no
    // significa nada.
    expect(etiquetaDePeriodoDePago('2026-01-31', '2026-02-27')).toBe(
      'Del 31 de enero al 27 de febrero de 2026',
    );
  });

  it('nombra LOS DOS AÑOS cuando el periodo los cruza', () => {
    // Diciembre de 2028 deja dos días huérfanos que se pagan en enero de 2029.
    // Sin el primer año, el recibo dice "Del 30 de diciembre al 31 de enero de
    // 2029", que sitúa diciembre en el año equivocado.
    expect(etiquetaDePeriodoDePago('2028-12-30', '2029-01-31')).toBe(
      'Del 30 de diciembre de 2028 al 31 de enero de 2029',
    );
  });

  it('omite el año cuando se le pide, que es la forma de la tarjeta del aseador', () => {
    // UI-SPEC §11.3: en el teléfono la tarjeta va sin año, salvo que el periodo
    // sea de otro año. QUIÉN decide eso es el llamante, no este módulo: saberlo
    // exige conocer el día de hoy, y un módulo de formato que lee el reloj es
    // una dependencia oculta como la que `lib/domain/dates.ts` existe para
    // evitar.
    expect(etiquetaDePeriodoDePago('2026-01-01', '2026-01-30', false)).toBe(
      'Del 1 al 30 de enero',
    );
    expect(etiquetaDePeriodoDePago('2026-01-31', '2026-02-27', false)).toBe(
      'Del 31 de enero al 27 de febrero',
    );
  });

  it('por defecto SÍ lleva el año: la superficie por defecto es la del admin', () => {
    // El admin transfiere plata mirando esta etiqueta. Si el default fuera sin
    // año, un olvido del tercer argumento produciría un recibo ambiguo en la
    // pantalla donde más caro sale.
    expect(etiquetaDePeriodoDePago('2026-01-01', '2026-01-30')).toBe(
      etiquetaDePeriodoDePago('2026-01-01', '2026-01-30', true),
    );
  });

  it('NUNCA es solo el nombre del mes', () => {
    // La regla dura de UI-SPEC §6.2.1, punto 3, convertida en aserción: un
    // recibo rotulado "enero" que cubre del 1 al 30 sin decirlo es una discusión
    // esperando a ocurrir. Se comprueba sobre los 36 periodos.
    for (const mes of MESES) {
      const { desde, hasta } = periodoDeCierre(`${mes}-15`);
      const etiqueta = etiquetaDePeriodoDePago(desde, hasta);

      // Los dos números de día, presentes.
      expect(etiqueta, `la etiqueta de ${mes} no trae el día inicial`).toContain(
        String(Number(desde.slice(8, 10))),
      );
      expect(etiqueta, `la etiqueta de ${mes} no trae el día final`).toContain(
        String(Number(hasta.slice(8, 10))),
      );
      expect(etiqueta.startsWith('Del ')).toBe(true);
    }
  });
});
