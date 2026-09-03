import { describe, expect, it } from 'vitest';

import {
  MAPA_DE_ALERTAS,
  ORDEN_DE_TIPOS,
  PRESENTACION_GENERICA,
  TIPOS_DE_NOTIFICACION,
  presentacionDeAlerta,
} from './alertas';

/**
 * EL CRITERIO 4 DEL ROADMAP SE GANA O SE PIERDE EN ESTE ARCHIVO.
 *
 * "Un solo panel con la misma jerarquía visual para los siete tipos" no es una
 * preferencia de diseño: es un requisito, y es de los que se rompen sin que
 * nadie se dé cuenta. Basta con que alguien pinte de rojo el tipo urgente
 * "porque es el más importante" para que el panel vuelva al anti-patrón que el
 * requisito existe para atajar: lo urgente grande y arriba, lo demás en gris al
 * final, donde nadie lo lee.
 *
 * Por eso las aserciones de homogeneidad de abajo NO comprueban entradas
 * concretas: recorren el mapa ENTERO y afirman que el conjunto de valores
 * distintos de cada atributo visual tiene cardinalidad 1. Una entrada nueva mal
 * puesta las pone en rojo sola, sin que nadie tenga que acordarse de añadir un
 * caso.
 */

describe('MAPA_DE_ALERTAS', () => {
  it('cubre los ONCE valores del enum notification_type, no siete', () => {
    // El UI-SPEC §11.1 mapea siete tipos. El enum tiene once, y de los cuatro
    // que el contrato no lista, `aseo_cancelado` es HOY el que más filas
    // produce en el sistema: cuatro variantes en la migración 13. Sin entrada
    // en el mapa, esas filas o se caen del panel o salen sin rótulo, y las dos
    // cosas son bugs.
    for (const tipo of TIPOS_DE_NOTIFICACION) {
      expect(MAPA_DE_ALERTAS[tipo], `falta la entrada de ${tipo}`).toBeDefined();
    }

    expect(TIPOS_DE_NOTIFICACION).toHaveLength(11);
  });

  it('los siete tipos del UI-SPEC §11.1 llevan su icono y su etiqueta literales', () => {
    // Literales, no aproximados: la etiqueta es la que carga el significado
    // cuando el color no puede cargarlo (§4.3), y el icono es el ancla de
    // escaneo. Cambiar cualquiera de los catorce valores es una modificación
    // del contrato de diseño, y esta aserción es la que obliga a que se note.
    expect(MAPA_DE_ALERTAS.urgente).toMatchObject({
      icono: 'Zap',
      etiqueta: 'URGENTE',
    });
    expect(MAPA_DE_ALERTAS.extension_sospechosa).toMatchObject({
      icono: 'ArrowLeftRight',
      etiqueta: 'EXTENSIÓN MAL CREADA',
    });
    expect(MAPA_DE_ALERTAS.no_puedo).toMatchObject({
      icono: 'UserRoundX',
      etiqueta: 'NO PUEDO',
    });
    expect(MAPA_DE_ALERTAS.dano_reportado).toMatchObject({
      icono: 'Hammer',
      etiqueta: 'DAÑO',
    });
    expect(MAPA_DE_ALERTAS.faltantes_reportados).toMatchObject({
      icono: 'PackageOpen',
      etiqueta: 'FALTANTES',
    });
    expect(MAPA_DE_ALERTAS.calendario_caido).toMatchObject({
      icono: 'CalendarX',
      etiqueta: 'CALENDARIO CAÍDO',
    });
    expect(MAPA_DE_ALERTAS.hora_limite_vencida).toMatchObject({
      icono: 'Hourglass',
      etiqueta: 'HORA LÍMITE VENCIDA',
    });
  });

  it('aseo_cancelado tiene entrada propia, que es el tipo que el motor emite de verdad', () => {
    // No es un tipo teórico: `sync_feed_apply()` lo escribe en cuatro sitios
    // (migración 13, líneas 949, 971, 993 y 1015) en operación normal. Es el
    // hueco concreto que el UI-SPEC §11.1 dejaba abierto.
    expect(MAPA_DE_ALERTAS.aseo_cancelado.etiqueta).toBe('ASEO CANCELADO');
    expect(MAPA_DE_ALERTAS.aseo_cancelado.icono).toBe('CircleSlash');
  });

  it('los cuatro tipos sin superficie propia hoy también tienen entrada', () => {
    // `asignacion` y `aseo_completado` ya se escriben; `gasto_reportado` llega
    // en la Fase 6 y `retencion_proxima` en la Fase 9. Tener la entrada ahora
    // cuesta cuatro líneas y evita que el día que aparezca el productor el
    // panel se llene de filas sin rótulo.
    for (const tipo of [
      'asignacion',
      'aseo_completado',
      'gasto_reportado',
      'retencion_proxima',
    ] as const) {
      expect(MAPA_DE_ALERTAS[tipo].etiqueta.length, tipo).toBeGreaterThan(0);
      expect(MAPA_DE_ALERTAS[tipo].icono.length, tipo).toBeGreaterThan(0);
    }
  });

  it('LAS DOCE ENTRADAS COMPARTEN COLOR, TAMAÑO Y PESO: el mapa no puede expresar jerarquía', () => {
    // La aserción central del criterio 4. Recorre el mapa entero y afirma que
    // el conjunto de valores distintos de cada atributo visual es de
    // cardinalidad 1. Señuelo corrido: poner `text-destructive` en la entrada
    // `urgente` la pone en rojo de inmediato.
    const entradas = Object.values(MAPA_DE_ALERTAS);

    expect(new Set(entradas.map((e) => e.claseIcono)).size).toBe(1);
    expect(new Set(entradas.map((e) => e.claseEtiqueta)).size).toBe(1);
    expect(new Set(entradas.map((e) => e.tamanoIcono)).size).toBe(1);

    // Y los valores concretos, porque "todas iguales pero en rojo" también
    // rompería §4.3: el único color del panel es `--status-warn` uniforme.
    expect(entradas.every((e) => e.claseIcono === 'text-status-warn')).toBe(true);
    expect(entradas.every((e) => e.claseEtiqueta === 'text-muted-foreground')).toBe(true);
    expect(entradas.every((e) => e.tamanoIcono === 16)).toBe(true);
  });

  it('el fallback también es homogéneo: no se cuela por no estar en el mapa', () => {
    expect(PRESENTACION_GENERICA.claseIcono).toBe('text-status-warn');
    expect(PRESENTACION_GENERICA.claseEtiqueta).toBe('text-muted-foreground');
    expect(PRESENTACION_GENERICA.tamanoIcono).toBe(16);
  });

  it('NINGUNA entrada expone severidad, prioridad ni orden: la propiedad no existe', () => {
    // Si algún día alguien añade `severidad: 'alta'` al mapa, el siguiente paso
    // inevitable es ordenar o colorear por ella, y ahí se acabó el criterio 4.
    // La forma de impedirlo no es un comentario, es esta aserción.
    const prohibidas = ['severidad', 'prioridad', 'orden', 'peso', 'nivel', 'rank'];

    for (const [clave, entrada] of Object.entries(MAPA_DE_ALERTAS)) {
      for (const prohibida of prohibidas) {
        expect(
          Object.hasOwn(entrada, prohibida),
          `${clave} expone "${prohibida}"`,
        ).toBe(false);
      }
    }
  });
});

describe('presentacionDeAlerta', () => {
  it('un tipo desconocido cae en el fallback Bell/AVISO en vez de desaparecer', () => {
    // La regla dura: NUNCA se descarta una fila por tipo desconocido. Un enum
    // que crece en una migración futura sin que nadie toque este archivo tiene
    // que seguir renderizando algo legible, no un hueco.
    //
    // Señuelo corrido: cambiar el `??` por un filtro de tipos conocidos hace
    // que la fila desaparezca del panel y esta aserción lo atrapa.
    const p = presentacionDeAlerta('tipo_que_no_existe_todavia');

    expect(p.icono).toBe('Bell');
    expect(p.etiqueta).toBe('AVISO');
    expect(p).toBe(PRESENTACION_GENERICA);
  });

  it('nunca devuelve undefined, sea cual sea la cadena que reciba', () => {
    for (const basura of ['', '   ', 'ASEO_CANCELADO', 'null', 'undefined', '42']) {
      expect(presentacionDeAlerta(basura), basura).toBeDefined();
    }
  });

  it('para un tipo conocido devuelve su entrada, no el fallback', () => {
    expect(presentacionDeAlerta('dano_reportado')).toBe(MAPA_DE_ALERTAS.dano_reportado);
    expect(presentacionDeAlerta('urgente')).toBe(MAPA_DE_ALERTAS.urgente);
  });
});

describe('ORDEN_DE_TIPOS', () => {
  it('lista las doce claves y arranca con las siete del UI-SPEC §11.1 en su orden exacto', () => {
    // El orden del FILTRO es fijo y es el de la tabla del contrato. No es el
    // orden de la LISTA de alertas, que es cronológico: son dos cosas
    // distintas y confundirlas produce una lista de filtro que se reordena
    // sola, que es inusable.
    expect(ORDEN_DE_TIPOS.slice(0, 7)).toEqual([
      'urgente',
      'extension_sospechosa',
      'no_puedo',
      'dano_reportado',
      'faltantes_reportados',
      'calendario_caido',
      'hora_limite_vencida',
    ]);

    expect(ORDEN_DE_TIPOS).toHaveLength(12);
    expect(new Set(ORDEN_DE_TIPOS).size).toBe(12);
  });

  it('cada clave del orden tiene entrada en el mapa, y al revés', () => {
    expect([...ORDEN_DE_TIPOS].sort()).toEqual(Object.keys(MAPA_DE_ALERTAS).sort());
  });
});
