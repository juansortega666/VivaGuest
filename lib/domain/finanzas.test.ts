import { describe, expect, it } from 'vitest';

import {
  armarDesglose,
  costoPorAseadora,
  gananciaDelPeriodo,
  margenPromedioPorAseo,
  type AseadoraDelPeriodo,
} from './finanzas';

/**
 * EL CONTRATO DE LA AGREGACIÓN DE PRESENTACIÓN. ESCRITO ANTES QUE SU CÓDIGO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NACE EN ROJO A PROPÓSITO. `lib/domain/finanzas.ts` todavía no
 * existe; lo escribe el plan 07-06 contra estas aserciones.
 *
 * ── QUÉ ES Y QUÉ NO ES ESTE MÓDULO ────────────────────────────────────────
 *
 * Es agregación de PRESENTACIÓN. No decide nada de negocio: quién entra en el
 * periodo, qué se paga y a quién lo decide Postgres, y su paridad se mide
 * aparte. Lo que este módulo calcula es lo que la pantalla necesita y la base no
 * tiene por qué devolver: la porción de la nómina que es cada persona, el margen
 * promedio, y el orden en que se leen.
 *
 * ── LAS TRES REGLAS QUE ESTE ARCHIVO EXISTE PARA FIJAR ────────────────────
 *
 *   1. **El denominador de la barra es el TOTAL del periodo, no el máximo del
 *      grupo.** Con denominador igual al máximo, la primera persona llena
 *      siempre la barra y el bloque se convierte en un podio: la forma
 *      dependería de quién quedó primero, no de los datos.
 *   2. **El orden por defecto es alfabético.** Una lista de PERSONAS ordenada de
 *      mayor a menor se lee como un ranking aunque no lleve números ni medallas,
 *      y este tema ya demostró ser sensible: es la razón por la que el dueño
 *      descartó el revenue por persona.
 *   3. **Un total que llega como texto se rechaza.** Es el fallo que el
 *      formateador de moneda NO delata, porque funciona igual sobre texto y
 *      sobre número.
 *
 * ── LA FRONTERA, QUE ES LA REGLA MÁS IMPORTANTE DE LA FASE ────────────────
 *
 * "El aseador ve lo que le llega. Nunca lo que cobramos, ni la diferencia, ni el
 * margen de nadie." Los tipos del desglose del admin y del aseador son EL MISMO
 * DOCUMENTO: si el admin viera una columna de más, cuando alguien reclame
 * estarían comparando dos papeles distintos. Hay dos aserciones abajo que
 * recorren las claves del resultado y lo obligan.
 *
 * Esta es la TERCERA capa de esa frontera. La de verdad está en Postgres, y
 * pgTAP la mide impersonando a un aseador. Un tipo no es un control de acceso.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Tres personas con costos distintos y nombres que el orden ingenuo destroza.
 *
 * 'Ana' empieza por mayúscula, 'ángela' por minúscula acentuada, 'Zulema' por Z.
 * En orden de punto de código: A(65) < Z(90) < Ó(211) < á(225), así que un `<`
 * a pelo devuelve Ana, Zulema, Óscar, ángela. Con comparación de idioma es Ana,
 * ángela, Óscar, Zulema. Los dos órdenes no comparten ni una sola posición
 * después de la primera, así que el test discrimina de verdad.
 */
const EQUIPO: AseadoraDelPeriodo[] = [
  { aseadoraId: 'u-zulema', nombre: 'Zulema Ríos', aseos: 4, pago: 160_000, gastos: 0 },
  { aseadoraId: 'u-angela', nombre: 'ángela Muñoz', aseos: 12, pago: 480_000, gastos: 60_000 },
  { aseadoraId: 'u-ana', nombre: 'Ana Rodríguez', aseos: 10, pago: 400_000, gastos: 0 },
  { aseadoraId: 'u-oscar', nombre: 'Óscar Peña', aseos: 9, pago: 360_000, gastos: 0 },
];

/** Costos derivados: pago más gastos reembolsados (D7-2). Total del periodo: 1.460.000. */
const COSTO_ANGELA = 540_000;
const COSTO_ANA = 400_000;
const COSTO_OSCAR = 360_000;
const COSTO_ZULEMA = 160_000;
const TOTAL_DEL_PERIODO = COSTO_ANGELA + COSTO_ANA + COSTO_OSCAR + COSTO_ZULEMA;

describe('costoPorAseadora, el costo de cada persona', () => {
  it('el costo es SU PAGO MÁS SUS GASTOS REEMBOLSADOS, que es lo que D7-2 define como lo que cuesta', () => {
    const filas = costoPorAseadora(EQUIPO);
    const angela = filas.find((f) => f.aseadoraId === 'u-angela');

    expect(angela?.pago).toBe(480_000);
    expect(angela?.gastos).toBe(60_000);
    expect(angela?.costo).toBe(COSTO_ANGELA);

    // Sin gastos, el costo es el pago a secas. No es un caso trivial: es la
    // mayoría de las filas, y una implementación que exigiera la partida de
    // gastos produciría ausencias donde hay ceros.
    const ana = filas.find((f) => f.aseadoraId === 'u-ana');
    expect(ana?.gastos).toBe(0);
    expect(ana?.costo).toBe(COSTO_ANA);
  });

  it('devuelve una fila por persona, sin perder ni duplicar a nadie', () => {
    const filas = costoPorAseadora(EQUIPO);
    expect(filas).toHaveLength(4);
    expect(new Set(filas.map((f) => f.aseadoraId)).size).toBe(4);
  });

  it('con la lista vacía devuelve una lista vacía, no un fallo', () => {
    expect(costoPorAseadora([])).toEqual([]);
  });
});

describe('la proporción: el denominador es el TOTAL del periodo, nunca el máximo', () => {
  it('cada barra dice qué porción de la nómina del periodo es esa persona', () => {
    const filas = costoPorAseadora(EQUIPO);
    const porId = new Map(filas.map((f) => [f.aseadoraId, f]));

    expect(porId.get('u-angela')!.proporcion).toBeCloseTo(COSTO_ANGELA / TOTAL_DEL_PERIODO, 10);
    expect(porId.get('u-ana')!.proporcion).toBeCloseTo(COSTO_ANA / TOTAL_DEL_PERIODO, 10);
    expect(porId.get('u-oscar')!.proporcion).toBeCloseTo(COSTO_OSCAR / TOTAL_DEL_PERIODO, 10);
    expect(porId.get('u-zulema')!.proporcion).toBeCloseTo(COSTO_ZULEMA / TOTAL_DEL_PERIODO, 10);
  });

  it('LA MÁS CARA NO LLENA LA BARRA: es la aserción que distingue el total del máximo', () => {
    // EL PUNTO ENTERO DE LA REGLA.
    //
    // Con denominador igual al máximo del grupo, la primera persona daría
    // exactamente 1 y el bloque se leería como un podio: la forma no dependería
    // de los datos, dependería de quién quedó primero. Con denominador igual al
    // total, la más cara del equipo de ejemplo es el 37% de la nómina, y eso sí
    // es información que el número no da.
    const filas = costoPorAseadora(EQUIPO);
    const maxima = Math.max(...filas.map((f) => f.proporcion));

    expect(maxima).toBeLessThan(1);
    expect(maxima).toBeCloseTo(COSTO_ANGELA / TOTAL_DEL_PERIODO, 10);
  });

  it('LAS PROPORCIONES SUMAN UNO: las barras juntas son el ancho de la card', () => {
    // Propiedad, y la más fuerte de todas: solo se cumple si el denominador es
    // la suma. Cualquier otro denominador la rompe.
    const suma = costoPorAseadora(EQUIPO).reduce((acc, f) => acc + f.proporcion, 0);
    expect(suma).toBeCloseTo(1, 10);
  });

  it('con el total en CERO la proporción es cero, no un fallo de división', () => {
    // Un periodo sin trabajo es un hecho, no un dato ausente. Una división por
    // cero aquí devuelve NaN, y un NaN en el ancho de la barra se renderiza como
    // una barra vacía sin que nada diga por qué.
    const sinTrabajo: AseadoraDelPeriodo[] = [
      { aseadoraId: 'u-a', nombre: 'Ana Rodríguez', aseos: 0, pago: 0, gastos: 0 },
      { aseadoraId: 'u-b', nombre: 'Bernarda Gil', aseos: 0, pago: 0, gastos: 0 },
    ];

    for (const fila of costoPorAseadora(sinTrabajo)) {
      expect(Number.isNaN(fila.proporcion)).toBe(false);
      expect(fila.proporcion).toBe(0);
      expect(fila.costo).toBe(0);
    }
  });

  it('la proporción va entre cero y uno, nunca en porcentaje', () => {
    // Se fija la escala aquí y no en el componente: dos consumidores que
    // multipliquen por cien cada uno por su cuenta es como una barra acaba al
    // 4000% de ancho.
    for (const fila of costoPorAseadora(EQUIPO)) {
      expect(fila.proporcion).toBeGreaterThanOrEqual(0);
      expect(fila.proporcion).toBeLessThanOrEqual(1);
    }
  });
});

describe('el buscador NO cambia la escala de la barra', () => {
  it('FILTRAR LA LISTA NO CAMBIA EL DENOMINADOR DE LA PROPORCIÓN', () => {
    // Si la escala cambiara al filtrar, la barra mentiría: buscar a una persona
    // la dejaría al 100% del ancho por el mero hecho de haberla buscado, que es
    // justo la lectura de podio que la regla anti ranking prohíbe.
    //
    // La comparación es contra la fila SIN filtrar, no contra un número escrito
    // a mano: así el test sigue siendo cierto si alguien cambia los datos de
    // ejemplo.
    const completa = costoPorAseadora(EQUIPO);
    const filtrada = costoPorAseadora(EQUIPO, { busqueda: 'ángela' });

    expect(filtrada).toHaveLength(1);
    expect(filtrada[0].aseadoraId).toBe('u-angela');
    expect(filtrada[0].proporcion).toBe(
      completa.find((f) => f.aseadoraId === 'u-angela')!.proporcion,
    );

    // Y lo que NO puede pasar: que la única fila visible sume uno.
    expect(filtrada[0].proporcion).toBeLessThan(1);
  });

  it('el buscador ignora acentos y mayúsculas', () => {
    // `includes` sobre el nombre normalizado. Quien escribe en un teclado de
    // móvil no pone la tilde.
    expect(costoPorAseadora(EQUIPO, { busqueda: 'ANGELA' })).toHaveLength(1);
    expect(costoPorAseadora(EQUIPO, { busqueda: 'rios' })).toHaveLength(1);
    expect(costoPorAseadora(EQUIPO, { busqueda: 'Ríos' })).toHaveLength(1);
  });

  it('busca por cualquier parte del nombre, no solo por el principio', () => {
    expect(costoPorAseadora(EQUIPO, { busqueda: 'rodriguez' })).toHaveLength(1);
  });

  it('sin coincidencias devuelve una lista vacía, y una búsqueda en blanco no filtra', () => {
    expect(costoPorAseadora(EQUIPO, { busqueda: 'nadie' })).toEqual([]);
    expect(costoPorAseadora(EQUIPO, { busqueda: '' })).toHaveLength(4);
    expect(costoPorAseadora(EQUIPO, { busqueda: '   ' })).toHaveLength(4);
  });
});

describe('el orden: alfabético por defecto, por monto solo si alguien lo pide', () => {
  it('EL ORDEN POR DEFECTO ES ALFABÉTICO, ignorando acentos y mayúsculas', () => {
    // La regla anti ranking, convertida en aserción. Alfabético elimina la
    // lectura de podio sin perder nada: quien necesite ver los compromisos
    // grandes primero toca el selector, y entonces ES UNA PREGUNTA QUE ALGUIEN
    // HIZO, no una jerarquía que la pantalla afirma sola.
    expect(costoPorAseadora(EQUIPO).map((f) => f.nombre)).toEqual([
      'Ana Rodríguez',
      'ángela Muñoz',
      'Óscar Peña',
      'Zulema Ríos',
    ]);
  });

  it('el orden por defecto NO es por monto: se comprueba que los dos difieren', () => {
    // Control. Sin esto, unos datos de ejemplo en los que el orden alfabético
    // coincidiera con el descendente por monto dejarían pasar una
    // implementación que ordenara por plata.
    const porDefecto = costoPorAseadora(EQUIPO).map((f) => f.aseadoraId);
    const porMonto = costoPorAseadora(EQUIPO, { orden: 'monto' }).map((f) => f.aseadoraId);

    expect(porDefecto).not.toEqual(porMonto);
  });

  it('el orden por monto va de MAYOR A MENOR, y es una elección explícita', () => {
    expect(costoPorAseadora(EQUIPO, { orden: 'monto' }).map((f) => f.costo)).toEqual([
      COSTO_ANGELA,
      COSTO_ANA,
      COSTO_OSCAR,
      COSTO_ZULEMA,
    ]);
  });

  it('pedir el orden alfabético explícitamente da lo mismo que el defecto', () => {
    expect(costoPorAseadora(EQUIPO, { orden: 'nombre' })).toEqual(costoPorAseadora(EQUIPO));
  });

  it('NINGUNA FILA LLEVA POSICIÓN, PUESTO NI NADA QUE SE LEA COMO UN RANKING', () => {
    // La regla anti ranking también en la forma del dato: si el módulo
    // devolviera un número de posición, el componente acabaría pintándolo tarde
    // o temprano. Lo que no existe no se puede renderizar.
    const prohibidas = /posicion|posición|rank|ranking|puesto|top|medalla|orden/i;

    for (const fila of costoPorAseadora(EQUIPO, { orden: 'monto' })) {
      for (const clave of Object.keys(fila)) {
        expect(prohibidas.test(clave), `la fila expone la clave "${clave}"`).toBe(false);
      }
    }
  });
});

describe('margenPromedioPorAseo', () => {
  it('divide el margen del periodo entre los aseos hechos, en pesos enteros', () => {
    // Las cifras son las del mockup de UI-SPEC §6.1: 1.976.000 de margen sobre
    // 48 aseos se pinta como "$ 41.167". La división da 41.166,66, así que el
    // redondeo tiene que ser al entero más cercano y no un truncamiento.
    expect(margenPromedioPorAseo(1_976_000, 48)).toBe(41_167);
    expect(Number.isInteger(margenPromedioPorAseo(1_976_000, 48))).toBe(true);
  });

  it('CON CERO ASEOS ES AUSENCIA, NO CERO', () => {
    // Un promedio de cero afirma que cada aseo dejó cero de margen. Con cero
    // aseos no hubo ningún aseo que dejara nada, que es otra cosa, y la pantalla
    // lo pinta con em dash en vez de con "$ 0".
    //
    // Es la excepción declarada a la regla de dinero de UI-SPEC §11.1, donde el
    // cero SÍ es un hecho: allí se habla de sumas, y una suma vacía es cero. Un
    // promedio vacío no existe.
    expect(margenPromedioPorAseo(0, 0)).toBeNull();
    expect(margenPromedioPorAseo(1_976_000, 0)).toBeNull();
  });

  it('un margen negativo produce un promedio negativo, sin recortar a cero', () => {
    // Recortar a cero escondería el único caso en el que esta cifra dice algo
    // urgente: un periodo en el que los aseos costaron más de lo que dejaron.
    // Que no se pinte en rojo (UI-SPEC §4.4) es otra decisión, y es de la
    // pantalla.
    expect(margenPromedioPorAseo(-12_000, 3)).toBe(-4_000);
  });

  it('con margen cero y aseos hechos SÍ es cero, no ausencia', () => {
    // El otro lado de la moneda: aquí sí hubo aseos, y dejaron cero. Es un
    // hecho del periodo.
    expect(margenPromedioPorAseo(0, 12)).toBe(0);
  });
});

describe('gananciaDelPeriodo', () => {
  it('es lo cobrado menos lo pagado menos los gastos, con las cifras de UI-SPEC §6.1', () => {
    expect(
      gananciaDelPeriodo({ cobrado: 4_320_000, pagado: 2_160_000, gastos: 184_000 }),
    ).toBe(1_976_000);
  });

  it('un periodo sin nada da cero, no ausencia', () => {
    // Los cuatro KPIs muestran "$ 0" con el filtro en día y sin aseos: cero
    // cobrado es un hecho del día, no un campo sin llenar.
    expect(gananciaDelPeriodo({ cobrado: 0, pagado: 0, gastos: 0 })).toBe(0);
  });

  it('puede ser negativa, y se devuelve tal cual', () => {
    expect(gananciaDelPeriodo({ cobrado: 100_000, pagado: 90_000, gastos: 30_000 })).toBe(
      -20_000,
    );
  });
});

describe('EL TOTAL QUE LLEGA COMO TEXTO SE RECHAZA', () => {
  it('demuestra primero POR QUÉ hace falta rechazarlo', () => {
    // La suma sobre enteros anchos devuelve en Postgres el tipo de precisión
    // arbitraria, y el cliente lo entrega como CADENA para no perder precisión.
    // Dos cadenas con el operador de suma se CONCATENAN, y el resultado sigue
    // siendo un número perfectamente formateable.
    const pago = '480000';
    const gastos = '60000';

    // Debería ser 540.000. Es 480.000.060.000.
    expect(pago + gastos).toBe('48000060000');
    expect(Number(pago + gastos)).toBe(48_000_060_000);

    // Y el formateador de moneda no delata nada, porque funciona igual sobre
    // texto y sobre número. Por eso el rechazo tiene que estar aquí, en la
    // agregación, y no en la capa que pinta: si un total aparece con miles de
    // millones donde debería haber cientos de miles, es exactamente esto.
    expect(String(48_000_060_000).length).toBeGreaterThan(String(540_000).length);
  });

  it('costoPorAseadora LANZA si un pago llega como texto', () => {
    const contaminado = [
      { aseadoraId: 'u-a', nombre: 'Ana Rodríguez', aseos: 10, pago: '400000', gastos: 0 },
    ] as unknown as AseadoraDelPeriodo[];

    // Lanza, no devuelve un valor de respaldo. Un cero silencioso aquí le
    // borraría el pago a una persona y nadie se enteraría hasta que reclamara.
    expect(() => costoPorAseadora(contaminado)).toThrow();
  });

  it('costoPorAseadora LANZA si los gastos llegan como texto', () => {
    const contaminado = [
      { aseadoraId: 'u-a', nombre: 'Ana Rodríguez', aseos: 10, pago: 400_000, gastos: '60000' },
    ] as unknown as AseadoraDelPeriodo[];

    expect(() => costoPorAseadora(contaminado)).toThrow();
  });

  it('gananciaDelPeriodo LANZA si cualquiera de los tres totales llega como texto', () => {
    // Los tres, uno por uno: un guard que mirara solo el primer argumento
    // pasaría dos de estos tres casos.
    expect(() =>
      gananciaDelPeriodo({ cobrado: '4320000', pagado: 2_160_000, gastos: 184_000 } as never),
    ).toThrow();
    expect(() =>
      gananciaDelPeriodo({ cobrado: 4_320_000, pagado: '2160000', gastos: 184_000 } as never),
    ).toThrow();
    expect(() =>
      gananciaDelPeriodo({ cobrado: 4_320_000, pagado: 2_160_000, gastos: '184000' } as never),
    ).toThrow();
  });

  it('el mensaje del fallo NOMBRA EL CAMPO contaminado', () => {
    // Sin el nombre, el diagnóstico obliga a recorrer la consulta entera
    // buscando cuál de las agregaciones se quedó sin el cast a entero.
    const contaminado = [
      { aseadoraId: 'u-a', nombre: 'Ana Rodríguez', aseos: 10, pago: '400000', gastos: 0 },
    ] as unknown as AseadoraDelPeriodo[];

    expect(() => costoPorAseadora(contaminado)).toThrow(/pago/i);
  });

  it('rechaza también lo que no es texto pero tampoco es un entero utilizable', () => {
    // Un nulo llega cuando la agregación no usó coalesce. Un no-numérico llega
    // cuando alguien restó dos cadenas. Los dos producen una barra invisible y
    // un total mudo, así que los dos se rechazan igual.
    for (const roto of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const contaminado = [
        { aseadoraId: 'u-a', nombre: 'Ana Rodríguez', aseos: 10, pago: roto, gastos: 0 },
      ] as unknown as AseadoraDelPeriodo[];

      expect(() => costoPorAseadora(contaminado), `no rechazó ${String(roto)}`).toThrow();
    }
  });
});

describe('armarDesglose, y la frontera del aseador', () => {
  const DESGLOSE = {
    aseadoraId: 'u-angela',
    nombre: 'ángela Muñoz',
    periodo: { desde: '2026-01-01', hasta: '2026-01-30' },
    aseos: [
      {
        aseoId: 'c-1',
        apartamento: 'Apto 07',
        programado: '2026-01-28',
        ejecutado: '2026-02-02',
        pago: 45_000,
      },
      {
        aseoId: 'c-2',
        apartamento: 'Apto 12',
        programado: '2026-01-15',
        ejecutado: '2026-01-15',
        pago: 55_000,
      },
    ],
    gastos: [
      { gastoId: 'g-1', concepto: 'Bolsas de basura', monto: 23_400, tieneRecibo: true },
      { gastoId: 'g-2', concepto: 'Desinfectante', monto: 12_000, tieneRecibo: false },
    ],
  };

  it('el total es la suma de los aseos MÁS la de los gastos, y las dos partidas van por separado', () => {
    // Por separado y no como un total plano: D7-2 exige el desglose, y el
    // snapshot mensual tiene que guardar las dos partidas o el desglose no
    // sobrevive al borrado de los aseos por antigüedad (FIN-04).
    const desglose = armarDesglose(DESGLOSE);

    expect(desglose.totalAseos).toBe(100_000);
    expect(desglose.totalGastos).toBe(35_400);
    expect(desglose.total).toBe(135_400);
  });

  it('CADA LÍNEA CONSERVA LAS DOS FECHAS: la programada y la de ejecución', () => {
    // D7-8. El primer aseo se programó el 28 de enero y se hizo el 2 de febrero.
    // Sin las dos fechas, un aseo de enero en el recibo de febrero parece un
    // error y genera exactamente la discusión que el desglose existe para
    // evitar.
    const linea = armarDesglose(DESGLOSE).aseos[0];

    expect(linea.programado).toBe('2026-01-28');
    expect(linea.ejecutado).toBe('2026-02-02');
    expect(linea.programado).not.toBe(linea.ejecutado);
  });

  it('conserva si el gasto tiene recibo, porque su ausencia es un estado declarado', () => {
    // "Sin recibo" no es un fallo de la pantalla: es un dato del gasto, y la
    // interfaz tiene un estado para él. Inventar un enlace roto sería peor.
    const gastos = armarDesglose(DESGLOSE).gastos;
    expect(gastos.map((g) => g.tieneRecibo)).toEqual([true, false]);
  });

  it('un desglose sin aseos y sin gastos totaliza cero, no lanza', () => {
    const vacio = armarDesglose({ ...DESGLOSE, aseos: [], gastos: [] });
    expect(vacio.total).toBe(0);
    expect(vacio.totalAseos).toBe(0);
    expect(vacio.totalGastos).toBe(0);
  });

  it('NINGUNA CIFRA DE HUÉSPED VIAJA EN EL DESGLOSE. NI UNA.', () => {
    // "El aseador ve lo que le llega. Nunca lo que cobramos, ni la diferencia,
    // ni el margen de nadie." (D7-7, cita literal del dueño.)
    //
    // Se recorre el árbol ENTERO y no una lista de claves esperadas: una entrada
    // nueva mal puesta cae sola, sin que nadie tenga que acordarse de añadir un
    // caso. Y se afirma sobre el desglose del ADMIN, que es el mismo documento
    // que el del aseador: si el admin viera una columna de más, cuando alguien
    // reclame estarían comparando dos papeles distintos.
    //
    // Esto es la TERCERA capa. La frontera de verdad está en Postgres y la mide
    // pgTAP impersonando a un aseador: un tipo no es un control de acceso, y el
    // dato viaja aunque no se pinte.
    const prohibidas = /huesped|huésped|tarifa|cobrad|margen|ganancia|diferencia|utilidad/i;

    const claves = (valor: unknown): string[] => {
      if (Array.isArray(valor)) return valor.flatMap(claves);
      if (valor === null || typeof valor !== 'object') return [];
      return Object.entries(valor as Record<string, unknown>).flatMap(([k, v]) => [
        k,
        ...claves(v),
      ]);
    };

    for (const clave of claves(armarDesglose(DESGLOSE))) {
      expect(prohibidas.test(clave), `el desglose expone la clave "${clave}"`).toBe(false);
    }
  });

  it('la fila de costo por aseadora TAMPOCO lleva ninguna cifra de huésped', () => {
    // El bloque 3 del Resumen es del admin, pero su tipo es el mismo que
    // alimenta la ficha de la persona, y la ficha es la que está a un paso de la
    // pantalla del aseador. La regla se aplica a los dos por igual.
    const prohibidas = /huesped|huésped|tarifa|cobrad|margen|ganancia|diferencia|utilidad/i;

    for (const fila of costoPorAseadora(EQUIPO)) {
      for (const clave of Object.keys(fila)) {
        expect(prohibidas.test(clave), `la fila expone la clave "${clave}"`).toBe(false);
      }
    }
  });

  it('el desglose LANZA si un monto llega como texto, igual que la agregación', () => {
    // Mismo guard y misma razón. Aquí duele más: es el papel que una persona
    // tiene delante cuando reclama su pago.
    const contaminado = {
      ...DESGLOSE,
      gastos: [{ gastoId: 'g-1', concepto: 'Bolsas', monto: '23400', tieneRecibo: true }],
    } as unknown as typeof DESGLOSE;

    expect(() => armarDesglose(contaminado)).toThrow();
  });
});
