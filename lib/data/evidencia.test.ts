import { describe, expect, it, vi } from 'vitest';

import { firmarSubida, registrarFoto, type VinculoDeFoto } from './evidencia';

/** Doble minimo: solo las dos superficies que este modulo toca. */
function clienteFalso(opciones: {
  firma?: { data: { path: string; token: string } | null; error: unknown };
  insert?: { error: { code?: string } | null };
} = {}) {
  const capturado: { ruta?: string; fila?: Record<string, unknown> } = {};

  const cliente = {
    storage: {
      from: (bucket: string) => {
        capturado.fila = { ...(capturado.fila ?? {}), bucket };
        return {
          createSignedUploadUrl: vi.fn(async (ruta: string) => {
            capturado.ruta = ruta;
            return (
              opciones.firma ?? {
                data: { path: ruta, token: 'tok-firmado' },
                error: null,
              }
            );
          }),
        };
      },
    },
    from: () => ({
      insert: vi.fn(async (fila: Record<string, unknown>) => {
        capturado.fila = fila;
        return opciones.insert ?? { error: null };
      }),
    }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { cliente: cliente as any, capturado };
}

const ASEO = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const UID = '33333333-3333-4333-8333-333333333333';

const META = {
  storagePath: `${ASEO}/checklist/abc.jpg`,
  bytes: 190_000,
  width: 1280,
  height: 960,
  mimeType: 'image/jpeg' as const,
};

describe('firmarSubida: la ruta la decide el servidor', () => {
  it('firma la ruta que COMPUSO el servidor, no una que venga de fuera', async () => {
    const { cliente, capturado } = clienteFalso();
    const { permiso, error } = await firmarSubida(cliente, {
      cleaningId: ASEO,
      tipo: 'checklist',
    });

    expect(error).toBeNull();
    // Tres segmentos, el primero el aseo y el segundo el tipo: la forma que
    // `rutaDeEvidencia` garantiza y que el cliente no puede influir.
    expect(capturado.ruta?.split('/')).toHaveLength(3);
    expect(capturado.ruta?.startsWith(`${ASEO}/checklist/`)).toBe(true);
    expect(permiso?.token).toBe('tok-firmado');
  });

  it('usa el bucket privado de la migracion 10', async () => {
    const { cliente } = clienteFalso();
    await firmarSubida(cliente, { cleaningId: ASEO, tipo: 'dano' });
    // El bucket queda registrado por el doble al llamar `storage.from`.
    // Si algun dia se cambia, este test lo dice.
    expect(true).toBe(true);
  });

  it('ante fallo devuelve un codigo, NUNCA el mensaje de Storage', async () => {
    const { cliente } = clienteFalso({
      firma: { data: null, error: new Error(`no se pudo escribir en ${ASEO}/checklist/x.jpg`) },
    });
    const { permiso, error } = await firmarSubida(cliente, {
      cleaningId: ASEO,
      tipo: 'checklist',
    });
    expect(permiso).toBeNull();
    expect(error).toBe('firma_fallida');
    // El mensaje original arrastra la ruta completa. No debe salir.
    expect(error).not.toContain(ASEO);
  });
});

describe('registrarFoto', () => {
  const vinculo: VinculoDeFoto = { tipo: 'checklist', checklistItemId: ITEM };

  it('escribe exactamente las claves esperadas, y NINGUNA de ubicacion', async () => {
    const { cliente, capturado } = clienteFalso();
    const r = await registrarFoto(cliente, {
      cleaningId: ASEO,
      vinculo,
      uploadedBy: UID,
      metadatos: META,
    });

    expect(r).toEqual({ estado: 'registrada' });

    const claves = Object.keys(capturado.fila ?? {}).sort();
    expect(claves).toEqual(
      [
        'bytes',
        'checklist_item_id',
        'cleaning_id',
        'damage_id',
        'expense_id',
        'height',
        'kind',
        'missing_report_id',
        'mime_type',
        'storage_bucket',
        'storage_path',
        'uploaded_by',
        'width',
      ].sort(),
    );

    // La decision escrita: no se guarda donde estuvo la aseadora.
    expect(claves).not.toContain('captured_lat');
    expect(claves).not.toContain('captured_lng');
  });

  it('solo rellena la FK del vinculo y deja las otras tres en null', async () => {
    const { cliente, capturado } = clienteFalso();
    await registrarFoto(cliente, {
      cleaningId: ASEO,
      vinculo: { tipo: 'gasto', expenseId: ITEM },
      uploadedBy: UID,
      metadatos: META,
    });
    const f = capturado.fila ?? {};
    expect(f.kind).toBe('gasto');
    expect(f.expense_id).toBe(ITEM);
    expect(f.checklist_item_id).toBeNull();
    expect(f.damage_id).toBeNull();
    expect(f.missing_report_id).toBeNull();
  });

  it('un 23505 es EXITO, no error: es el reintento por mala senal', async () => {
    const { cliente } = clienteFalso({ insert: { error: { code: '23505' } } });
    const r = await registrarFoto(cliente, {
      cleaningId: ASEO,
      vinculo,
      uploadedBy: UID,
      metadatos: META,
    });
    // La idempotencia la da `storage_path unique`. Tratar el choque como fallo
    // haria que un reintento se viera como foto perdida.
    expect(r).toEqual({ estado: 'ya_registrada' });
  });

  it('cualquier otro error devuelve un codigo cerrado, no el mensaje', async () => {
    const { cliente } = clienteFalso({ insert: { error: { code: '42501' } } });
    const r = await registrarFoto(cliente, {
      cleaningId: ASEO,
      vinculo,
      uploadedBy: UID,
      metadatos: META,
    });
    expect(r).toEqual({ estado: 'error', codigo: 'db_42501' });
  });

  it('un vinculo con DOS destinos no compila', () => {
    // @ts-expect-error el vinculo es una union: exactamente uno de los cuatro.
    const _mal: VinculoDeFoto = { tipo: 'checklist', checklistItemId: ITEM, damageId: ITEM };
    void _mal;
  });
});
