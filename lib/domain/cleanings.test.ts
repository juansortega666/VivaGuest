import { describe, expect, it } from 'vitest';

import {
  copyDeCancelReason,
  copyDeReviewReason,
  estadoDeAseo,
  type EntradaEstadoAseo,
} from './cleanings';

/** Fila gestionada, pendiente y ya confirmada. Cada caso muta solo lo que prueba. */
const base: EntradaEstadoAseo = {
  is_managed: true,
  state: 'pendiente',
  confirmado_at: '2026-09-02T14:00:00+00:00',
};

describe('estadoDeAseo', () => {
  it('externa: is_managed=false gana sobre todo lo demas', () => {
    const estado = estadoDeAseo({
      is_managed: false,
      // `cl_unmanaged_is_inert` obliga a que una unidad externa tenga `state` nulo.
      state: null,
      confirmado_at: null,
    });

    expect(estado.clave).toBe('externa');
    expect(estado.icono).toBe('CircleDashed');
    expect(estado.etiqueta).toBe('Gestión externa');
    expect(estado.clase).toBe('text-status-info');
  });

  it('sin_confirmar: gestionada, pendiente y sin confirmado_at', () => {
    const estado = estadoDeAseo({ ...base, confirmado_at: null });

    expect(estado.clave).toBe('sin_confirmar');
    expect(estado.icono).toBe('Inbox');
    expect(estado.etiqueta).toBe('Sin confirmar');
    expect(estado.clase).toBe('text-status-warn');
  });

  it('pendiente: gestionada, pendiente y con confirmado_at', () => {
    const estado = estadoDeAseo(base);

    expect(estado.clave).toBe('pendiente');
    expect(estado.icono).toBe('Clock');
    expect(estado.etiqueta).toBe('Pendiente');
    expect(estado.clase).toBe('text-status-idle');
  });

  it('en_curso', () => {
    const estado = estadoDeAseo({ ...base, state: 'en_curso' });

    expect(estado.clave).toBe('en_curso');
    expect(estado.icono).toBe('Play');
    expect(estado.etiqueta).toBe('En curso');
    expect(estado.clase).toBe('text-status-progress');
  });

  it('terminado: el estado se llama completada en la base y terminado en pantalla', () => {
    const estado = estadoDeAseo({ ...base, state: 'completada' });

    expect(estado.clave).toBe('terminado');
    expect(estado.icono).toBe('CircleCheck');
    // UI-SPEC §18.4: terminado, nunca completado ni finalizado.
    expect(estado.etiqueta).toBe('Terminado');
    expect(estado.clase).toBe('text-status-ok');
  });

  it('cancelado', () => {
    const estado = estadoDeAseo({ ...base, state: 'cancelada' });

    expect(estado.clave).toBe('cancelado');
    expect(estado.icono).toBe('CircleSlash');
    expect(estado.etiqueta).toBe('Cancelado');
    expect(estado.clase).toBe('text-muted-foreground');
  });

  /**
   * SEÑUELO DEL ORDEN DE EVALUACION.
   *
   * La regla de UI-SPEC §5 no es solo "seis casos": es que `is_managed` se mire
   * PRIMERO. Una fila externa llega con `state` nulo por `cl_unmanaged_is_inert`, asi
   * que un `switch` que conmute sobre `state` antes de mirar `is_managed` no tiene
   * ninguna rama honesta a la que ir.
   *
   * Este caso existe para que mover la guarda de `is_managed` DESPUES del switch ponga
   * en rojo la fila de gestion externa, y no para volver a comprobar la clave.
   */
  it('senuelo: una fila externa nunca cae en una rama de state', () => {
    const externa: EntradaEstadoAseo = {
      is_managed: false,
      state: null,
      confirmado_at: null,
    };

    expect(() => estadoDeAseo(externa)).not.toThrow();
    expect(estadoDeAseo(externa).clave).toBe('externa');
  });

  it('las seis claves son distintas entre si', () => {
    const claves = [
      estadoDeAseo({ is_managed: false, state: null, confirmado_at: null }).clave,
      estadoDeAseo({ ...base, confirmado_at: null }).clave,
      estadoDeAseo(base).clave,
      estadoDeAseo({ ...base, state: 'en_curso' }).clave,
      estadoDeAseo({ ...base, state: 'completada' }).clave,
      estadoDeAseo({ ...base, state: 'cancelada' }).clave,
    ];

    expect(new Set(claves).size).toBe(6);
  });

  it('acepta un Pick parcial, no la fila entera de PostgREST', () => {
    // Es lo que permite llamarla con la fila embebida de una alerta, que no trae
    // las 29 columnas de `cleanings`.
    const parcial: EntradaEstadoAseo = {
      is_managed: true,
      state: 'en_curso',
      confirmado_at: '2026-09-02T14:00:00+00:00',
    };

    expect(estadoDeAseo(parcial).clave).toBe('en_curso');
  });
});

describe('copyDeCancelReason', () => {
  it('traduce los tres slugs conocidos con el copy literal de UI-SPEC §18.2', () => {
    expect(copyDeCancelReason('reserva_desaparecida')).toBe(
      'La reserva desapareció del calendario.',
    );
    expect(copyDeCancelReason('reserva_movida')).toBe('La reserva cambió de fecha.');
    expect(copyDeCancelReason('cancelado_por_admin')).toBe('Lo cancelaste tú.');
  });

  it('un slug desconocido cae en el copy generico, NUNCA en el slug crudo', () => {
    expect(copyDeCancelReason('motivo_que_no_existe')).toBe('Cancelado.');
    expect(copyDeCancelReason('motivo_que_no_existe')).not.toContain('motivo_que_no_existe');
  });

  it('null, undefined y cadena vacia tambien dan el copy generico', () => {
    expect(copyDeCancelReason(null)).toBe('Cancelado.');
    expect(copyDeCancelReason(undefined)).toBe('Cancelado.');
    expect(copyDeCancelReason('')).toBe('Cancelado.');
  });

  it('T-04-12: ningun slug de entrada puede aparecer dentro de la salida', () => {
    // Un slug es informacion interna del sync. Si alguna vez se filtrara a pantalla,
    // seria por un respaldo del tipo `MAPA[slug] ?? slug`. Este caso lo prohibe.
    for (const slug of ['reserva_desaparecida', 'x_inventado', '<script>alert(1)</script>']) {
      expect(copyDeCancelReason(slug)).not.toContain(slug);
    }
  });
});

describe('copyDeReviewReason', () => {
  it('traduce los seis slugs conocidos con el copy literal de UI-SPEC §18.3', () => {
    expect(copyDeReviewReason('reserva_desaparecida_aseo_iniciado')).toBe(
      'La reserva desapareció, pero el aseo ya había empezado.',
    );
    expect(copyDeReviewReason('reserva_desaparecida_ventana_protegida')).toBe(
      'La reserva desapareció, pero el aseo es de hoy o de mañana.',
    );
    expect(copyDeReviewReason('reserva_desaparecida_bajo_piso')).toBe(
      'La reserva desapareció, pero quedó por detrás de la ventana del calendario.',
    );
    expect(copyDeReviewReason('reserva_movida_aseo_iniciado')).toBe(
      'La reserva cambió de fecha, pero el aseo ya había empezado.',
    );
    expect(copyDeReviewReason('reserva_movida_ventana_protegida')).toBe(
      'La reserva cambió de fecha, pero el aseo es de hoy o de mañana.',
    );
    expect(copyDeReviewReason('extension_sospechosa')).toBe(
      'Parece una extensión de estadía mal creada.',
    );
  });

  it('un slug desconocido cae en el copy generico, NUNCA en el slug crudo', () => {
    expect(copyDeReviewReason('motivo_que_no_existe')).toBe(
      'Este aseo necesita revisión.',
    );
    expect(copyDeReviewReason('motivo_que_no_existe')).not.toContain(
      'motivo_que_no_existe',
    );
  });

  it('null, undefined y cadena vacia tambien dan el copy generico', () => {
    expect(copyDeReviewReason(null)).toBe('Este aseo necesita revisión.');
    expect(copyDeReviewReason(undefined)).toBe('Este aseo necesita revisión.');
    expect(copyDeReviewReason('')).toBe('Este aseo necesita revisión.');
  });

  it('los seis copys son distintos entre si y ninguno repite el generico', () => {
    const copys = [
      'reserva_desaparecida_aseo_iniciado',
      'reserva_desaparecida_ventana_protegida',
      'reserva_desaparecida_bajo_piso',
      'reserva_movida_aseo_iniciado',
      'reserva_movida_ventana_protegida',
      'extension_sospechosa',
    ].map(copyDeReviewReason);

    expect(new Set(copys).size).toBe(6);
    expect(copys).not.toContain('Este aseo necesita revisión.');
  });

  it('T-04-12: ningun slug de entrada puede aparecer dentro de la salida', () => {
    for (const slug of ['extension_sospechosa', 'x_inventado', '<img onerror=1>']) {
      expect(copyDeReviewReason(slug)).not.toContain(slug);
    }
  });
});
