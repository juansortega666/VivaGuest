import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PRESENTACION_AVISOS,
  PRESENTACION_AVISOS_ASEADOR,
  estadoDeAvisos,
  estadoDeAvisosDeAseador,
  tituloDeEstadoDeAvisos,
  type EntradaEstadoAvisos,
  type EntradaEstadoAvisosAseador,
} from './avisos';

/**
 * El camino feliz completo: instalada, todo soportado, permiso concedido y una
 * suscripcion viva que coincide con la registrada. Cada caso muta SOLO lo que
 * prueba, que es como se lee de un vistazo que la entrada produce el estado.
 */
const sano: EntradaEstadoAvisos = {
  instalada: true,
  soportaServiceWorker: true,
  soportaPushManager: true,
  soportaNotification: true,
  permiso: 'granted',
  haySuscripcion: true,
  endpointCoincide: true,
  reparacionFallida: false,
};

describe('estadoDeAvisos', () => {
  it('S0 no_soportado: instalada pero sin serviceWorker en navigator', () => {
    const estado = estadoDeAvisos({ ...sano, soportaServiceWorker: false });

    expect(estado.clave).toBe('no_soportado');
    expect(estado.banner).toBe(true);
    // §7.6: gris y sin boton primario. No es ambar, porque ambar promete una
    // accion que aqui no existe.
    expect(estado).toMatchObject({ icono: 'CircleAlert', clase: 'text-muted-foreground' });
  });

  it('S0 no_soportado: instalada pero sin PushManager en window', () => {
    const estado = estadoDeAvisos({ ...sano, soportaPushManager: false });

    expect(estado.clave).toBe('no_soportado');
  });

  it('S1 sin_instalar: no esta en standalone y falta Notification en window', () => {
    const estado = estadoDeAvisos({
      ...sano,
      instalada: false,
      soportaNotification: false,
      permiso: 'default',
    });

    expect(estado.clave).toBe('sin_instalar');
    expect(estado).toMatchObject({ icono: 'Smartphone' });
  });

  it('S1 y S0 NO se confunden: misma ausencia de Notification, distinto `instalada`', () => {
    // Es la distincion que §5.1 marca como consecuencia de producto: en una
    // pestana de Safari iOS `window.Notification` es undefined porque falta la
    // instalacion, no porque el iPhone no pueda. Confundirlos manda a alguien a
    // hablar con el administrador cuando lo unico que falta es anadir un icono.
    const sinNotification = { ...sano, soportaNotification: false, permiso: 'default' as const };

    expect(estadoDeAvisos({ ...sinNotification, instalada: false }).clave).toBe('sin_instalar');
    expect(estadoDeAvisos({ ...sinNotification, instalada: true }).clave).toBe('no_soportado');
  });

  it('S2 nunca_pedido: el permiso vale default', () => {
    const estado = estadoDeAvisos({
      ...sano,
      permiso: 'default',
      haySuscripcion: false,
      endpointCoincide: false,
    });

    expect(estado.clave).toBe('nunca_pedido');
    expect(estado).toMatchObject({ icono: 'Bell' });
  });

  it('S3 negado: el permiso vale denied', () => {
    const estado = estadoDeAvisos({
      ...sano,
      permiso: 'denied',
      haySuscripcion: false,
      endpointCoincide: false,
    });

    expect(estado.clave).toBe('negado');
    expect(estado).toMatchObject({ icono: 'BellOff' });
  });

  it('S4 roto: concedido, sin suscripcion, y la reparacion silenciosa ya fallo', () => {
    const estado = estadoDeAvisos({
      ...sano,
      haySuscripcion: false,
      endpointCoincide: false,
      reparacionFallida: true,
    });

    expect(estado.clave).toBe('roto');
    // §7.5: `TriangleAlert` y no `BellOff`, porque es una falla, no un estado
    // de permiso.
    expect(estado).toMatchObject({ icono: 'TriangleAlert' });
  });

  it('S4 roto: concedido, con suscripcion, pero el endpoint no coincide con el registrado', () => {
    const estado = estadoDeAvisos({ ...sano, endpointCoincide: false, reparacionFallida: true });

    expect(estado.clave).toBe('roto');
  });

  it('S4 NO aparece de entrada: con la reparacion todavia pendiente el estado no es roto', () => {
    // §5.1: al montar, la app intenta reparar en silencio y el banner sale solo
    // si esa reparacion fallo. Un banner que sale y desaparece solo, sin que
    // nadie lo toque, ensena a ignorar los banners.
    const pendiente = estadoDeAvisos({
      ...sano,
      haySuscripcion: false,
      endpointCoincide: false,
      reparacionFallida: false,
    });

    expect(pendiente.clave).not.toBe('roto');
    expect(pendiente.banner).toBe(false);
  });

  it('S5 activo: concedido, suscripcion viva y coincidente', () => {
    expect(estadoDeAvisos(sano).clave).toBe('activo');
  });

  it('S5 NO produce banner: el discriminante de activo no trae presentacion', () => {
    const estado = estadoDeAvisos(sano);

    expect(estado.banner).toBe(false);
    // El discriminante es lo que impide que un componente pinte una caja vacia:
    // en la rama `activo` no hay ni icono ni titulo QUE PINTAR, y `tsc` lo sabe.
    expect('icono' in estado).toBe(false);
    expect('titulo' in estado).toBe(false);
    expect('clase' in estado).toBe(false);
  });

  it('el mapa de presentacion tiene EXACTAMENTE seis claves', () => {
    const claves = Object.keys(PRESENTACION_AVISOS);

    expect(claves).toHaveLength(6);
    expect(claves.sort()).toEqual(
      ['activo', 'negado', 'no_soportado', 'nunca_pedido', 'roto', 'sin_instalar'].sort(),
    );
  });

  it('los cinco estados con banner traen icono, titulo y clase, y ningun titulo se repite', () => {
    const conBanner = Object.values(PRESENTACION_AVISOS).filter((p) => p.banner);

    expect(conBanner).toHaveLength(5);
    for (const p of conBanner) {
      expect(p.banner && p.icono.length).toBeGreaterThan(0);
      expect(p.banner && p.titulo.length).toBeGreaterThan(0);
      expect(p.banner && p.clase.length).toBeGreaterThan(0);
    }

    const titulos = conBanner.map((p) => (p.banner ? p.titulo : ''));
    expect(new Set(titulos).size).toBe(5);
  });

  it('PUREZA: el modulo no importa React, ni lucide, ni nada de app/', () => {
    // Misma regla que la cabecera de `lib/domain/alertas.ts`. Se comprueba
    // leyendo los imports del archivo porque un import impuro compila perfecto
    // y solo revienta el dia que alguien renderice esto en el servidor.
    const fuente = readFileSync(
      fileURLToPath(new URL('./avisos.ts', import.meta.url)),
      'utf8',
    );
    const lineas = fuente.split('\n');

    const imports = lineas.filter((linea) => linea.startsWith('import ')).join('\n');
    expect(imports).not.toMatch(/'react'/);
    expect(imports).not.toMatch(/lucide/);
    expect(imports).not.toMatch(/@\/app\//);

    // Y tampoco LEE el navegador: eso es trabajo de `lib/push/plataforma.ts`.
    //
    // Se filtran las lineas de comentario, misma distincion que implementa
    // `scripts/ci/check-max-w-tallas.sh`: NOMBRAR los globales del navegador en
    // prosa es legitimo y de hecho obligatorio (la cabecera del modulo explica
    // por que no los toca), USARLOS es el fallo. Sin este filtro, la cabecera
    // que documenta la regla seria la que la rompe.
    const codigo = lineas
      .filter((linea) => !/^\s*(\/\/|\/\*|\*)/.test(linea))
      .join('\n');
    for (const global of ['win' + 'dow', 'navi' + 'gator', 'Notifi' + 'cation']) {
      expect(codigo).not.toMatch(new RegExp(`\\b${global}\\b`));
    }
  });
});

/** Aseadora activa con un telefono vivo y la prueba confirmada por toque. */
const aseadoraSana: EntradaEstadoAvisosAseador = {
  is_active: true,
  suscripciones_vivas: 1,
  verificado_por_toque: true,
  primera_suscripcion_at: '2026-09-08T15:00:00+00:00',
  ultima_verificacion: '2026-09-08T15:04:00+00:00',
  ultimo_visto: '2026-09-08T15:04:00+00:00',
  ultimo_exito: '2026-09-08T15:04:00+00:00',
};

describe('estadoDeAvisosDeAseador', () => {
  it('Activos: al menos una suscripcion viva Y verificacion por toque', () => {
    const estado = estadoDeAvisosDeAseador(aseadoraSana);

    expect(estado.clave).toBe('activos');
    expect(estado).toMatchObject({
      icono: 'BellRing',
      etiqueta: 'Activos',
      clase: 'text-status-ok',
    });
  });

  it('Sin probar: hay suscripcion viva pero la prueba nunca se confirmo', () => {
    const estado = estadoDeAvisosDeAseador({
      ...aseadoraSana,
      verificado_por_toque: false,
      ultima_verificacion: null,
    });

    expect(estado.clave).toBe('sin_probar');
    expect(estado).toMatchObject({
      icono: 'Bell',
      etiqueta: 'Sin probar',
      // §5.2: `Sin probar` NO es un error y no se pinta como uno. Es "hay a
      // donde enviar, pero nadie comprobo que llegue".
      clase: 'text-status-idle',
    });
  });

  it('una verificacion A MANO no cuenta como Activos: se queda en Sin probar', () => {
    // §8.6: si no se distinguieran, el boton "Ya sono, no alcance a tocarlo"
    // seria un atajo para saltarse la unica verificacion de la fase. La otra
    // mitad la impone la migracion 16 por grants de columna.
    const aMano = estadoDeAvisosDeAseador({
      ...aseadoraSana,
      verificado_por_toque: false,
      ultima_verificacion: '2026-09-08T15:04:00+00:00',
    });

    expect(aMano.clave).toBe('sin_probar');
    expect(aMano.clave).not.toBe('activos');
  });

  it('Sin avisos: cero suscripciones vivas', () => {
    const estado = estadoDeAvisosDeAseador({
      ...aseadoraSana,
      suscripciones_vivas: 0,
      verificado_por_toque: false,
      primera_suscripcion_at: null,
      ultima_verificacion: null,
      ultimo_visto: null,
      ultimo_exito: null,
    });

    expect(estado.clave).toBe('sin_avisos');
    expect(estado).toMatchObject({
      icono: 'BellOff',
      etiqueta: 'Sin avisos',
      clase: 'text-status-warn',
    });
  });

  it('un aseador INACTIVO no muestra estado: devuelve el caso sin estado, no uno de los tres', () => {
    const estado = estadoDeAvisosDeAseador({ ...aseadoraSana, is_active: false });

    expect(estado.clave).toBe('sin_estado');
    expect(['activos', 'sin_probar', 'sin_avisos']).not.toContain(estado.clave);
    // La celda va con una raya (§15.1), asi que no hay ni icono ni etiqueta.
    expect('icono' in estado).toBe(false);
    expect('etiqueta' in estado).toBe(false);
  });

  it('el mapa de presentacion del admin tiene EXACTAMENTE tres claves', () => {
    const claves = Object.keys(PRESENTACION_AVISOS_ASEADOR);

    expect(claves).toHaveLength(3);
    expect(claves.sort()).toEqual(['activos', 'sin_avisos', 'sin_probar'].sort());
  });

  it('los tres iconos y las tres etiquetas son distintos entre si', () => {
    const entradas = Object.values(PRESENTACION_AVISOS_ASEADOR);

    expect(new Set(entradas.map((p) => p.icono)).size).toBe(3);
    expect(new Set(entradas.map((p) => p.etiqueta)).size).toBe(3);
    expect(new Set(entradas.map((p) => p.clase)).size).toBe(3);
  });

  it('un conteo negativo de suscripciones LANZA en vez de inventar una clave', () => {
    // Misma regla heredada de `estadoDeAseo()`: un badge que miente sobre el
    // canal de un aseador es peor que una pantalla que se cae.
    expect(() =>
      estadoDeAvisosDeAseador({ ...aseadoraSana, suscripciones_vivas: -1 }),
    ).toThrow(/suscripciones_vivas/);
  });
});

describe('tituloDeEstadoDeAvisos', () => {
  /** 8 de septiembre de 2026, 18:04 en Bogota. */
  const ahora = Date.parse('2026-09-08T23:04:00+00:00');

  it('Activos: fecha de alta mas la ultima vez que abrio la app', () => {
    const titulo = tituloDeEstadoDeAvisos(aseadoraSana, ahora);

    expect(titulo).toMatch(/^Activos desde el /);
    expect(titulo).toContain('8 de septiembre');
    expect(titulo).toContain('Última vez que abrió la app:');
  });

  it('Sin probar: dice que el telefono se registro y que la prueba nunca llego', () => {
    const titulo = tituloDeEstadoDeAvisos(
      { ...aseadoraSana, verificado_por_toque: false, ultima_verificacion: null },
      ahora,
    );

    expect(titulo).toBe('Se registró el teléfono el 8 de septiembre, pero la prueba nunca llegó.');
  });

  it('Sin avisos: el copy literal de §5.2, sin fechas que interpolar', () => {
    const titulo = tituloDeEstadoDeAvisos(
      {
        ...aseadoraSana,
        suscripciones_vivas: 0,
        verificado_por_toque: false,
        primera_suscripcion_at: null,
        ultimo_visto: null,
      },
      ahora,
    );

    expect(titulo).toBe('No hay ningún teléfono registrado.');
  });

  it('un aseador inactivo no tiene titulo', () => {
    expect(tituloDeEstadoDeAvisos({ ...aseadoraSana, is_active: false }, ahora)).toBeNull();
  });

  it('sin fecha de alta NO se inventa un titulo: devuelve null', () => {
    // Misma regla que `tiempoRelativo()`: inventar un valor seria peor que no
    // decir nada. Con suscripciones vivas la RPC siempre trae la fecha (es un
    // `min(created_at)`), asi que esto es la rama defensiva.
    const titulo = tituloDeEstadoDeAvisos({ ...aseadoraSana, primera_suscripcion_at: null }, ahora);

    expect(titulo).toBeNull();
  });

  it('sin ultima visita se omite la segunda frase, no se rellena con nada', () => {
    const titulo = tituloDeEstadoDeAvisos({ ...aseadoraSana, ultimo_visto: null }, ahora);

    expect(titulo).toMatch(/^Activos desde el /);
    expect(titulo).not.toContain('Última vez');
  });
});
