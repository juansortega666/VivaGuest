import { describe, expect, it } from 'vitest';

import type {
  Alerta,
  AseoParaAlertas,
  ClaveDeAlerta,
  NotificacionParaAlertas,
} from './alertas';
import {
  MAPA_DE_ALERTAS,
  ORDEN_DE_TIPOS,
  PRESENTACION_GENERICA,
  TIPOS_DE_NOTIFICACION,
  alertasComputadas,
  conteosPorTipo,
  mezclarAlertas,
  presentacionDeAlerta,
  venceEnMs,
} from './alertas';
import { UMBRAL_SYNC_CAIDA_MS } from './salud-sync';

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

// ───────────────────────────────────────────────────────────────────────────
// Las tres alertas computadas (UI-SPEC §11.2)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Instante de referencia de todo lo que sigue: las 18:00 UTC del 4 de
 * septiembre, que son las 13:00 de Bogotá del mismo día. Es un valor fijo y no
 * `Date.now()`, por la misma razón que en `salud-sync.test.ts`: un test que lee
 * el reloj mide algo distinto cada vez que corre y falla a las 3 de la mañana
 * en CI sin forma de reproducirlo.
 */
const AHORA = Date.parse('2026-09-04T18:00:00.000Z');
const HOY = '2026-09-04';

/** Molde de aseo. Cada caso sobrescribe solo lo que le importa. */
function aseo(over: Partial<AseoParaAlertas> & { id: string }): AseoParaAlertas {
  return {
    property_id: `prop-${over.id}`,
    apartamento: `Bogotá ${over.id}`,
    is_managed: true,
    state: 'pendiente',
    scheduled_date: HOY,
    hora_limite: '14:00:00',
    apartamentoHoraLimite: '14:00:00',
    is_urgent: false,
    created_at: '2026-09-04T09:00:00+00:00',
    ...over,
  };
}

function clavesDe(alertas: Alerta[], clave: ClaveDeAlerta): string[] {
  return alertas.filter((a) => a.clave === clave).map((a) => a.cleaningId ?? a.id);
}

describe('venceEnMs', () => {
  it('devuelve el instante de esa hora EN BOGOTÁ, no en UTC', () => {
    // 11:30 de Bogotá del 4 de septiembre son las 16:30 UTC del mismo día.
    // Colombia no tiene DST desde 1993, así que el desfase -05:00 fijo es
    // correcto y no hay ninguna fecha del año en que esto cambie.
    expect(venceEnMs('2026-09-04', '11:30:00')).toBe(
      Date.parse('2026-09-04T16:30:00.000Z'),
    );
    expect(venceEnMs('2026-09-04', '15:00:00')).toBe(
      Date.parse('2026-09-04T20:00:00.000Z'),
    );
  });

  it('bajo TZ=UTC y bajo TZ=America/Bogota devuelve EL MISMO número', () => {
    // `vitest.config.ts` fija TZ=UTC a propósito, así que un error de zona
    // sería SILENCIOSO en toda la suite. Cambiar la zona a mano es la única
    // forma de que aparezca.
    const original = process.env.TZ;

    try {
      process.env.TZ = 'UTC';
      const utc = venceEnMs('2026-09-04', '11:30:00');

      process.env.TZ = 'America/Bogota';
      const bog = venceEnMs('2026-09-04', '11:30:00');

      expect(utc).toBe(bog);
      expect(utc).toBe(Date.parse('2026-09-04T16:30:00.000Z'));
    } finally {
      process.env.TZ = original;
    }
  });

  it('ignora los segundos de la columna `time` de Postgres', () => {
    // PostgREST devuelve `'11:30:00'` para un `time`. La hora límite es
    // operativa: los segundos no significan nada y recortarlos evita depender
    // de que Postgres siempre emita los tres componentes.
    expect(venceEnMs('2026-09-04', '11:30:00')).toBe(venceEnMs('2026-09-04', '11:30:45'));
  });
});

describe('alertasComputadas · urgente', () => {
  it('produce la alerta solo con is_urgent, is_managed, estado vivo y fecha no pasada', () => {
    const alertas = alertasComputadas({
      aseos: [
        aseo({ id: 'ok-pendiente', is_urgent: true }),
        aseo({ id: 'ok-en-curso', is_urgent: true, state: 'en_curso' }),
        // Gestión externa como la escribe la base: inerte por el CHECK
        // `cl_unmanaged_is_inert`, o sea con `state` nulo.
        aseo({ id: 'externa', is_urgent: true, is_managed: false, state: null }),
        // LA FILA QUE ATRAPA EL SEÑUELO, y hace falta que sea DISTINTA de la de
        // arriba. Con `state: null`, `is_managed` es redundante: el filtro de
        // estado ya descarta la fila, y quitar `is_managed` del predicado sigue
        // en verde. Medido: el señuelo pasó la primera vez por eso.
        //
        // Esta fila tiene `is_managed = false` Y estado vivo a la vez, que es
        // una combinación que el CHECK de la base prohíbe. Se siembra a mano a
        // propósito: `is_managed` es la comprobación que expresa la REGLA DE
        // NEGOCIO ("VivaGuest no opera esta unidad"), y no puede depender de que
        // un CHECK en otra capa la mantenga verdadera por casualidad. El panel
        // también construye filas en memoria (estado optimista, Realtime), y ahí
        // no hay CHECK que valga.
        aseo({
          id: 'externa-con-estado-vivo',
          is_urgent: true,
          is_managed: false,
          state: 'pendiente',
        }),
        aseo({ id: 'terminado', is_urgent: true, state: 'completada' }),
        aseo({ id: 'cancelado', is_urgent: true, state: 'cancelada' }),
        aseo({ id: 'de-ayer', is_urgent: true, scheduled_date: '2026-09-03' }),
        aseo({ id: 'sin-urgencia', is_urgent: false }),
      ],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    });

    expect(clavesDe(alertas, 'urgente')).toEqual(['ok-pendiente', 'ok-en-curso']);
  });

  it('su instante para el orden es cleanings.created_at', () => {
    const [alerta] = alertasComputadas({
      aseos: [
        aseo({ id: 'a', is_urgent: true, created_at: '2026-09-04T09:15:00+00:00' }),
      ],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    }).filter((a) => a.clave === 'urgente');

    expect(alerta.ocurrioEnMs).toBe(Date.parse('2026-09-04T09:15:00.000Z'));
  });

  it('no es atendible: no tiene read_at y se apaga sola', () => {
    const [alerta] = alertasComputadas({
      aseos: [aseo({ id: 'a', is_urgent: true })],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    }).filter((a) => a.clave === 'urgente');

    expect(alerta.atendible).toBe(false);
    expect(alerta.cleaningId).toBe('a');
    expect(alerta.url).toBe('/operacion#aseo-a');
  });
});

describe('alertasComputadas · hora límite vencida', () => {
  it('la hora sale de cleanings.hora_limite, NO de properties.hora_limite', () => {
    // El UI-SPEC §11.2 dice `properties.hora_limite` y es un error del
    // contrato: APTO-05 permite pactar hora distinta para un aseo puntual, y el
    // `coalesce` del trigger de la migración 13 guarda esa hora pactada como
    // SNAPSHOT en `cleanings.hora_limite`.
    //
    // Las dos direcciones a la vez, que es lo que hace irrompible la aserción:
    // `pactada-temprano` vence por la del ASEO y no por la del apartamento;
    // `pactada-tarde` NO vence por la del aseo aunque la del apartamento sí.
    // Cambiar la fuente invierte exactamente estas dos filas.
    const alertas = alertasComputadas({
      aseos: [
        aseo({
          id: 'pactada-temprano',
          hora_limite: '10:00:00', // 15:00Z, ya pasó
          apartamentoHoraLimite: '23:00:00', // 04:00Z del día 5, no ha pasado
        }),
        aseo({
          id: 'pactada-tarde',
          hora_limite: '23:00:00', // no ha pasado
          apartamentoHoraLimite: '10:00:00', // ya pasó
        }),
      ],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    });

    expect(clavesDe(alertas, 'hora_limite_vencida')).toEqual(['pactada-temprano']);
  });

  it('el desfase -05:00 importa: un vencimiento dentro de la franja de cinco horas NO está vencido', () => {
    // LA FILA QUE ATRAPA EL SEÑUELO DE LA ZONA. Las 15:00 de Bogotá del 4 son
    // las 20:00 UTC, dos horas DESPUÉS de `AHORA`. Sustituir el `-05:00` por
    // una `Z` las convierte en las 15:00 UTC, tres horas ANTES, y el panel
    // inventa una hora límite vencida que no ocurrió.
    const alertas = alertasComputadas({
      aseos: [aseo({ id: 'dentro-de-la-franja', hora_limite: '15:00:00' })],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    });

    expect(clavesDe(alertas, 'hora_limite_vencida')).toEqual([]);
  });

  it('exige is_managed y estado vivo, igual que la urgente', () => {
    const alertas = alertasComputadas({
      aseos: [
        aseo({ id: 'vivo', hora_limite: '06:00:00' }),
        aseo({ id: 'externa', hora_limite: '06:00:00', is_managed: false, state: null }),
        // Igual que en la urgente: con `state` nulo, `is_managed` es redundante.
        // Esta fila lo aísla.
        aseo({
          id: 'externa-con-estado-vivo',
          hora_limite: '06:00:00',
          is_managed: false,
          state: 'pendiente',
        }),
        aseo({ id: 'terminado', hora_limite: '06:00:00', state: 'completada' }),
        aseo({ id: 'cancelado', hora_limite: '06:00:00', state: 'cancelada' }),
      ],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    });

    expect(clavesDe(alertas, 'hora_limite_vencida')).toEqual(['vivo']);
  });

  it('vencida HOY, el título dice LA HORA (05-UI-SPEC §12.6)', () => {
    const [alerta] = alertasComputadas({
      aseos: [aseo({ id: 'de-hoy', scheduled_date: HOY, hora_limite: '11:30:00' })],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    }).filter((a) => a.clave === 'hora_limite_vencida');

    // El copy del repo decía `La hora límite de las 11:30 pasó y el aseo no ha
    // terminado.`, que no es ninguna de las dos variantes del contrato. §12.6
    // reemplaza LAS DOS, así que el caso de hoy también cambia.
    expect(alerta.titulo).toBe('Se venció la hora límite de las 11:30 y el aseo sigue sin terminar.');
    expect(alerta.cuerpo).toBe(alerta.titulo);
  });

  it('vencida en un DÍA ANTERIOR, el título dice LA FECHA y no la hora', () => {
    const [alerta] = alertasComputadas({
      aseos: [aseo({ id: 'de-anteayer', scheduled_date: '2026-09-02', hora_limite: '11:30:00' })],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    }).filter((a) => a.clave === 'hora_limite_vencida');

    // `11:30` de un día que ya pasó no responde la pregunta que el admin tiene:
    // cuán viejo es esto. La fecha sí.
    expect(alerta.titulo).toBe('Se venció la hora límite del 2 de septiembre y el aseo sigue sin terminar.');
    expect(alerta.titulo).not.toContain('11:30');
    expect(alerta.cuerpo).toBe(alerta.titulo);
  });

  it('los dos casos comparten CLAVE y URL: ni tipo nuevo ni destino nuevo', () => {
    const alertas = alertasComputadas({
      aseos: [
        aseo({ id: 'hoy', scheduled_date: HOY, hora_limite: '11:30:00' }),
        aseo({ id: 'viejo', scheduled_date: '2026-09-01', hora_limite: '11:30:00' }),
      ],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    }).filter((a) => a.clave === 'hora_limite_vencida');

    // NINGÚN OCTAVO TIPO. §12.6: la distinción vive en el copy y en el orden
    // cronológico, nunca en color ni en jerarquía. Un tipo nuevo además pondría
    // en rojo el recorrido de homogeneidad del mapa, que es lo que el criterio 4
    // de la Fase 4 protege.
    expect(alertas.map((a) => a.clave)).toEqual(['hora_limite_vencida', 'hora_limite_vencida']);

    // Y LA URL SIGUE SIENDO EL ANCLA DEL ASEO, que es exactamente lo que hace
    // obligatorio el bloque `Atrasados`: sin él, la del día anterior se vería,
    // se podría tocar y no llevaría a ninguna parte (T-05-55, §12.1).
    expect(alertas.map((a) => a.url)).toEqual([
      '/operacion#aseo-hoy',
      '/operacion#aseo-viejo',
    ]);
  });

  it('la fecha del título sale del helper del proyecto, NO de un `new Date`', () => {
    // EL SEÑUELO DEL OFF-BY-ONE. `new Date('2026-09-01')` se parsea como
    // medianoche UTC y en Bogotá (UTC-5) renderiza el 31 de AGOSTO. El primero
    // de mes es donde ese error se ve, y además cruza el nombre del mes.
    const [alerta] = alertasComputadas({
      aseos: [aseo({ id: 'primero-de-mes', scheduled_date: '2026-09-01' })],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    }).filter((a) => a.clave === 'hora_limite_vencida');

    expect(alerta.titulo).toContain('1 de septiembre');
    expect(alerta.titulo).not.toContain('agosto');
  });

  it('vence también en días pasados, y su instante para el orden es el vencimiento', () => {
    // A diferencia de la urgente, esta NO se acota a `scheduled_date >= hoy`:
    // un aseo de anteayer sin terminar es precisamente el que no se puede
    // perder. Su instante es cuándo venció, no cuándo se creó el aseo.
    const [alerta] = alertasComputadas({
      aseos: [aseo({ id: 'de-anteayer', scheduled_date: '2026-09-02' })],
      maxUltimoExito: '2026-09-04T17:00:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    }).filter((a) => a.clave === 'hora_limite_vencida');

    expect(alerta.ocurrioEnMs).toBe(venceEnMs('2026-09-02', '14:00:00'));
    expect(alerta.ocurrioEnMs).toBe(Date.parse('2026-09-02T19:00:00.000Z'));
    expect(alerta.atendible).toBe(false);
  });
});

describe('alertasComputadas · calendario caído (global)', () => {
  it('con la sincronización sana no produce nada', () => {
    const alertas = alertasComputadas({
      aseos: [],
      maxUltimoExito: '2026-09-04T16:00:00+00:00', // hace 2 h
      ahoraMs: AHORA,
      hoy: HOY,
    });

    expect(alertas).toEqual([]);
  });

  it('con la sincronización caída produce UNA alerta global, sin apartamento', () => {
    const alertas = alertasComputadas({
      aseos: [],
      maxUltimoExito: '2026-09-04T13:00:00+00:00', // hace 5 h
      ahoraMs: AHORA,
      hoy: HOY,
    });

    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      clave: 'calendario_caido',
      apartamento: 'Todo el sistema',
      titulo: 'Ningún calendario ha sincronizado en las últimas 3 horas.',
      cleaningId: null,
      propertyId: null,
      atendible: false,
    });
  });

  it('su instante para el orden es max(last_success_at) + UMBRAL_SYNC_CAIDA_MS', () => {
    // Es el momento en que el sistema PASÓ a estar caído, no el momento en que
    // el admin abrió el panel. Usar `ahoraMs` haría que la alerta saltara al
    // tope de la lista en cada render, empujando hacia abajo hechos más
    // recientes que ella.
    const marca = '2026-09-04T13:00:00+00:00';

    const [alerta] = alertasComputadas({
      aseos: [],
      maxUltimoExito: marca,
      ahoraMs: AHORA,
      hoy: HOY,
    });

    expect(alerta.ocurrioEnMs).toBe(Date.parse(marca) + UMBRAL_SYNC_CAIDA_MS);
  });

  it('sin ninguna sincronización previa también alerta, y su instante es ahora', () => {
    // `max(last_success_at)` sobre cero filas devuelve NULL: es el despliegue
    // nuevo cuyo scheduler nunca corrió. No hay ningún instante del que partir,
    // así que el hecho es "ahora mismo". Sin este caso el instante sería `NaN`
    // y la alerta caería a un sitio arbitrario del orden.
    const [alerta] = alertasComputadas({
      aseos: [],
      maxUltimoExito: null,
      ahoraMs: AHORA,
      hoy: HOY,
    });

    expect(alerta.clave).toBe('calendario_caido');
    expect(alerta.ocurrioEnMs).toBe(AHORA);
    expect(Number.isNaN(alerta.ocurrioEnMs)).toBe(false);
  });

  it('usa estadoDeSincronizacion y su umbral, no un umbral propio', () => {
    // El borde exacto, en las dos direcciones. Si alguien reimplementa el
    // umbral aquí con otro número, esto se pone rojo.
    const justoDentro = new Date(AHORA - UMBRAL_SYNC_CAIDA_MS).toISOString();
    const justoFuera = new Date(AHORA - UMBRAL_SYNC_CAIDA_MS - 60_000).toISOString();
    const base = { aseos: [], ahoraMs: AHORA, hoy: HOY };

    expect(alertasComputadas({ ...base, maxUltimoExito: justoDentro })).toEqual([]);
    expect(alertasComputadas({ ...base, maxUltimoExito: justoFuera })).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Mezcla, orden, deduplicación y conteos (UI-SPEC §11.4)
// ───────────────────────────────────────────────────────────────────────────

/** Molde de notificación. Cada caso sobrescribe solo lo que le importa. */
function notif(
  over: Partial<NotificacionParaAlertas> & { id: string },
): NotificacionParaAlertas {
  return {
    type: 'dano_reportado',
    title: `Título de ${over.id}`,
    body: `Cuerpo de ${over.id}`,
    url: null,
    cleaning_id: null,
    property_id: null,
    created_at: '2026-09-04T12:00:00+00:00',
    apartamento: 'Bogotá 1',
    ...over,
  };
}

/** Las dos computadas del caso de orden: una urgente a las 09:00Z y una hora límite a las 15:00Z. */
function computadasDelCasoDeOrden(): Alerta[] {
  return alertasComputadas({
    aseos: [
      aseo({
        id: 'c1',
        is_urgent: true,
        hora_limite: '14:00:00', // 19:00Z, no ha vencido
        created_at: '2026-09-04T09:00:00+00:00',
      }),
      aseo({
        id: 'c2',
        is_urgent: false,
        hora_limite: '10:00:00', // 15:00Z, ya venció
      }),
    ],
    maxUltimoExito: '2026-09-04T17:30:00+00:00', // sana: no hay alerta global
    ahoraMs: AHORA,
    hoy: HOY,
  });
}

describe('mezclarAlertas · orden', () => {
  it('SALE CRONOLÓGICO DESCENDENTE, y se compara contra la secuencia EXACTA de ids', () => {
    // ESTE ES EL CRITERIO 4 DEL ROADMAP, NO UNA PREFERENCIA (D-06).
    //
    // La aserción compara la secuencia completa de ids y no un booleano tipo
    // "está ordenado", porque un booleano pasaría igual con CUALQUIER orden
    // total. Los instantes están entrelazados a propósito entre persistidas y
    // computadas: ordenar por tipo, por procedencia o por severidad produce una
    // secuencia distinta y esto se pone rojo.
    //
    // Instantes: n1 17:00Z · c2 15:00Z · n2 12:00Z · c1 09:00Z · n3 06:00Z
    const orden = mezclarAlertas(
      [
        notif({ id: 'n1', created_at: '2026-09-04T17:00:00+00:00' }),
        notif({
          id: 'n2',
          type: 'aseo_cancelado',
          created_at: '2026-09-04T12:00:00+00:00',
        }),
        notif({
          id: 'n3',
          type: 'extension_sospechosa',
          created_at: '2026-09-04T06:00:00+00:00',
        }),
      ],
      computadasDelCasoDeOrden(),
    );

    expect(orden.map((a) => a.id)).toEqual([
      'n1',
      'hora_limite_vencida:c2',
      'n2',
      'urgente:c1',
      'n3',
    ]);
  });

  it('a igual instante el orden es estable y determinista, no el del argumento', () => {
    // Dos hechos del mismo segundo existen (una corrida del sync inserta en
    // ráfaga). Sin desempate, el orden dependería del algoritmo de `sort` y la
    // lista bailaría entre renders sin que nada cambie.
    const mismoInstante = '2026-09-04T12:00:00+00:00';
    const directo = mezclarAlertas(
      [
        notif({ id: 'b', created_at: mismoInstante }),
        notif({ id: 'a', created_at: mismoInstante }),
        notif({ id: 'c', created_at: mismoInstante }),
      ],
      [],
    );
    const alReves = mezclarAlertas(
      [
        notif({ id: 'c', created_at: mismoInstante }),
        notif({ id: 'a', created_at: mismoInstante }),
        notif({ id: 'b', created_at: mismoInstante }),
      ],
      [],
    );

    expect(directo.map((a) => a.id)).toEqual(alReves.map((a) => a.id));
  });

  it('no muta los arrays que recibe', () => {
    const notificaciones = [
      notif({ id: 'n1', created_at: '2026-09-04T06:00:00+00:00' }),
      notif({ id: 'n2', created_at: '2026-09-04T17:00:00+00:00' }),
    ];
    const computadas = computadasDelCasoDeOrden();

    mezclarAlertas(notificaciones, computadas);

    expect(notificaciones.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(computadas.map((c) => c.id)).toEqual([
      'urgente:c1',
      'hora_limite_vencida:c2',
    ]);
  });
});

describe('mezclarAlertas · conversión de la fila de notificación', () => {
  it('una notificación sale atendible, con su título, su cuerpo y su url', () => {
    const [a] = mezclarAlertas(
      [
        notif({
          id: 'n1',
          type: 'dano_reportado',
          title: 'Rejilla del sifón rota',
          body: 'La rejilla del sifón del baño principal está rota.',
          url: '/operacion#aseo-xyz',
          cleaning_id: 'xyz',
          property_id: 'prop-1',
          apartamento: 'Bogotá 3',
        }),
      ],
      [],
    );

    expect(a).toMatchObject({
      id: 'n1',
      clave: 'dano_reportado',
      titulo: 'Rejilla del sifón rota',
      cuerpo: 'La rejilla del sifón del baño principal está rota.',
      apartamento: 'Bogotá 3',
      cleaningId: 'xyz',
      propertyId: 'prop-1',
      url: '/operacion#aseo-xyz',
      // SOLO las respaldadas por una fila de `notifications` se pueden atender:
      // son las únicas que tienen `read_at`.
      atendible: true,
    });
  });

  it('UNA FILA CON TIPO DESCONOCIDO SOBREVIVE LA MEZCLA, no se filtra', () => {
    // La regla del fallback, comprobada donde de verdad importa. Filtrar los
    // desconocidos en la mezcla es el bug: la fila desaparece del panel sin
    // dejar rastro y nadie se entera de que existió.
    const orden = mezclarAlertas(
      [
        notif({ id: 'conocida', created_at: '2026-09-04T17:00:00+00:00' }),
        notif({
          id: 'del-futuro',
          // Cast a propósito: simula un valor de enum que la base ya tiene y
          // este despliegue de la app todavía no conoce.
          type: 'tipo_que_no_existe_todavia' as NotificacionParaAlertas['type'],
          created_at: '2026-09-04T18:00:00+00:00',
        }),
      ],
      [],
    );

    expect(orden.map((a) => a.id)).toEqual(['del-futuro', 'conocida']);
    expect(presentacionDeAlerta(orden[0].clave).etiqueta).toBe('AVISO');
  });

  it('sin apartamento resuelto no inventa nombre: deja la cadena vacía', () => {
    const [a] = mezclarAlertas([notif({ id: 'n1', apartamento: null })], []);
    expect(a.apartamento).toBe('');
  });
});

describe('mezclarAlertas · deduplicación', () => {
  it('SUPRIME la computada si hay una notificación SEMBRADA A MANO del mismo tipo y mismo cleaning_id', () => {
    // EL NOMBRE DICE "SEMBRADA A MANO" A PROPÓSITO. Hoy NADIE produce
    // `hora_limite_vencida` en ninguna migración (grep exhaustivo,
    // 2026-09-03), así que esta deduplicación NO PUEDE ACTIVARSE en el sistema
    // real. Sin la siembra, el test pasaría sin probar absolutamente nada, que
    // es la trampa concreta que el research documenta como Pitfall 6.
    //
    // Se escribe igual porque es barata y porque la Fase 5 o la 9 pueden añadir
    // el productor.
    const computadas = alertasComputadas({
      aseos: [aseo({ id: 'c2', hora_limite: '10:00:00' })],
      maxUltimoExito: '2026-09-04T17:30:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    });
    expect(computadas.map((c) => c.id)).toEqual(['hora_limite_vencida:c2']);

    const orden = mezclarAlertas(
      [notif({ id: 'n1', type: 'hora_limite_vencida', cleaning_id: 'c2' })],
      computadas,
    );

    expect(orden.map((a) => a.id)).toEqual(['n1']);
  });

  it('no deduplica entre tipos distintos ni entre aseos distintos', () => {
    const computadas = alertasComputadas({
      aseos: [aseo({ id: 'c2', hora_limite: '10:00:00' })],
      maxUltimoExito: '2026-09-04T17:30:00+00:00',
      ahoraMs: AHORA,
      hoy: HOY,
    });

    // Mismo aseo pero otro tipo, y mismo tipo pero otro aseo. Ninguna suprime.
    const orden = mezclarAlertas(
      [
        notif({ id: 'otro-tipo', type: 'dano_reportado', cleaning_id: 'c2' }),
        notif({
          id: 'otro-aseo',
          type: 'hora_limite_vencida',
          cleaning_id: 'c9',
        }),
      ],
      computadas,
    );

    expect(orden.some((a) => a.id === 'hora_limite_vencida:c2')).toBe(true);
    expect(orden).toHaveLength(3);
  });

  it('NO deduplica la caída global, que no tiene cleaning_id', () => {
    // Las dos mitades de "calendario caído" COEXISTEN y el 04-CONTEXT lo pide
    // literalmente: la del watchdog dice QUÉ FEED falla, la global dice que NO
    // CORRE NADA. Son hechos distintos.
    //
    // Y la trampa concreta: si la deduplicación comparara `cleaning_id` sin
    // excluir el nulo, `null === null` suprimiría la global cada vez que el
    // watchdog escribe su notificación por feed, que es justo cuando ambas
    // pueden ser ciertas.
    const computadas = alertasComputadas({
      aseos: [],
      maxUltimoExito: '2026-09-04T13:00:00+00:00', // caída
      ahoraMs: AHORA,
      hoy: HOY,
    });
    expect(computadas.map((c) => c.id)).toEqual(['calendario_caido:sistema']);

    const orden = mezclarAlertas(
      [
        notif({
          id: 'del-watchdog',
          type: 'calendario_caido',
          cleaning_id: null,
          property_id: 'prop-7',
          created_at: '2026-09-04T17:00:00+00:00',
        }),
      ],
      computadas,
    );

    expect(orden).toHaveLength(2);
    expect(orden.map((a) => a.id)).toEqual([
      'del-watchdog',
      'calendario_caido:sistema',
    ]);
  });
});

describe('conteosPorTipo', () => {
  it('respeta el ORDEN FIJO de la tabla del UI-SPEC §11.1, NUNCA el conteo', () => {
    // Una lista de filtro que se reordena sola según los conteos es inusable:
    // la opción que buscas cambia de sitio cada vez que entra una alerta.
    //
    // La fixture está sembrada para que ordenar por conteo dé una secuencia
    // DISTINTA: `aseo_cancelado` tiene 3, que es el máximo, y va en el puesto
    // 8 del orden fijo. Si alguien mete un `sort` por conteo, se va al primero
    // y esto se pone rojo.
    const alertas = mezclarAlertas(
      [
        notif({ id: 'x1', type: 'aseo_cancelado' }),
        notif({ id: 'x2', type: 'aseo_cancelado' }),
        notif({ id: 'x3', type: 'aseo_cancelado' }),
        notif({ id: 'y1', type: 'dano_reportado' }),
      ],
      [],
    );

    const conteos = conteosPorTipo(alertas);

    expect(conteos.map((c) => c.clave)).toEqual([...ORDEN_DE_TIPOS]);
    expect(conteos[0].clave).toBe('urgente');
  });

  it('incluye los tipos con conteo CERO: la lista no cambia de longitud entre lecturas', () => {
    // Si los ceros se omitieran, el filtro tendría 2 opciones ahora y 5 dentro
    // de un minuto, y la que estabas a punto de tocar se movería debajo del
    // cursor.
    const conteos = conteosPorTipo(
      mezclarAlertas([notif({ id: 'y1', type: 'dano_reportado' })], []),
    );

    expect(conteos).toHaveLength(12);
    expect(conteos.filter((c) => c.conteo === 0)).toHaveLength(11);
    expect(conteosPorTipo([])).toHaveLength(12);
    expect(conteosPorTipo([]).every((c) => c.conteo === 0)).toBe(true);
  });

  it('cuenta bien, y cuenta juntas las persistidas y las computadas del mismo tipo', () => {
    const alertas = mezclarAlertas(
      [
        notif({ id: 'x1', type: 'aseo_cancelado' }),
        notif({ id: 'x2', type: 'aseo_cancelado' }),
        notif({ id: 'y1', type: 'dano_reportado' }),
      ],
      computadasDelCasoDeOrden(),
    );

    const porClave = Object.fromEntries(
      conteosPorTipo(alertas).map((c) => [c.clave, c.conteo]),
    );

    expect(porClave.aseo_cancelado).toBe(2);
    expect(porClave.dano_reportado).toBe(1);
    expect(porClave.urgente).toBe(1);
    expect(porClave.hora_limite_vencida).toBe(1);
    expect(porClave.no_puedo).toBe(0);
  });

  it('trae la etiqueta del mapa, para que el filtro diga `Daño (3)` y no `dano_reportado (3)`', () => {
    const conteos = conteosPorTipo([]);
    const porClave = Object.fromEntries(conteos.map((c) => [c.clave, c.etiqueta]));

    expect(porClave.dano_reportado).toBe(MAPA_DE_ALERTAS.dano_reportado.etiqueta);
    expect(porClave.urgente).toBe('URGENTE');
  });

  it('un tipo desconocido no rompe el conteo ni se cuela en la lista fija', () => {
    // La lista del filtro es de longitud fija por contrato. Una fila de tipo
    // desconocido tiene que seguir viéndose en el panel (eso ya está probado
    // arriba) sin añadir una opción de filtro que nadie sabe rotular.
    const alertas = mezclarAlertas(
      [
        notif({
          id: 'del-futuro',
          type: 'tipo_que_no_existe_todavia' as NotificacionParaAlertas['type'],
        }),
      ],
      [],
    );

    const conteos = conteosPorTipo(alertas);

    expect(conteos).toHaveLength(12);
    expect(conteos.every((c) => c.conteo === 0)).toBe(true);
  });
});
