/**
 * Contrato de validación del alta de un aseador (ASEADOR-01, UI-SPEC §11.2).
 *
 * Se valida en el SERVIDOR, dentro de `crearAseador`, y no solo en el navegador:
 * una Server Action es un endpoint HTTP público y el `required` de un input no
 * viaja con la petición.
 */
import { z } from 'zod';

import { LONGITUD_MINIMA_PASSWORD } from './password';

/**
 * Un input de texto vacío llega desde `FormData` como `''`, no como `undefined`.
 * Sin esto, `phone` acabaría en la base como la cadena vacía, que NO es lo mismo
 * que "sin teléfono": la lista de aseadores (§11.1) pinta `sin definir` para
 * `null`, y un `''` se le colaría como un teléfono real que está en blanco.
 */
function vacioANulo(v: unknown): unknown {
  if (typeof v === 'string' && v.trim().length === 0) return null;
  if (v === undefined) return null;
  return v;
}

/**
 * El email se normaliza ANTES de validar: `FormData` trae lo que el admin tecleó,
 * espacios incluidos, y GoTrue guarda el email en minúsculas. Normalizar después
 * de validar dejaría pasar `" a@b.com"` sin recortar.
 */
function normalizarEmail(v: unknown): unknown {
  return typeof v === 'string' ? v.trim().toLowerCase() : v;
}

export const esquemaCrearAseador = z.object({
  full_name: z.string().trim().min(1, 'El nombre es obligatorio'),

  email: z.preprocess(
    normalizarEmail,
    z.email('Ese email no tiene un formato válido'),
  ),

  phone: z.preprocess(
    vacioANulo,
    z
      .string()
      .trim()
      .nullable(),
  ),

  /**
   * EL MÍNIMO DE 12 SE IMPONE AQUÍ Y EN NINGÚN OTRO SITIO DEL SISTEMA.
   *
   * Medido contra el stack local (02-RESEARCH §6.1): `auth.admin.createUser`
   * ACEPTA una contraseña de 8 caracteres pese a que `supabase/config.toml`
   * declara `minimum_password_length = 12`. Ese límite lo aplica el flujo de
   * *signup*, y el alta de un aseador no pasa por signup: pasa por la Admin API,
   * que no lo comprueba.
   *
   * Si este `.min()` se borra, la regla desaparece del sistema entero y nadie se
   * entera hasta que una cuenta con contraseña corta abre 39 apartamentos.
   * `aseador.schema.test.ts` ancla el caso exacto que se midió.
   *
   * No se recorta ni se normaliza: la credencial que se entrega tiene que ser
   * byte a byte la que se guarda en GoTrue.
   */
  password: z
    .string()
    .min(
      LONGITUD_MINIMA_PASSWORD,
      `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`,
    ),
});

/**
 * NO hay campo `role` ni `is_active` en este esquema, y no es un olvido (T-02-35).
 * El rol de la cuenta es un literal del código de la action. Un objeto de Zod
 * descarta por defecto las claves que no declara, así que un `role=admin` metido a
 * mano en el `FormData` no llega a `createUser`. El test lo fija.
 */
export type CrearAseadorInput = z.input<typeof esquemaCrearAseador>;
export type CrearAseadorOutput = z.output<typeof esquemaCrearAseador>;
