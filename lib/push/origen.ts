/**
 * EL ORIGEN ABSOLUTO AL QUE NAVEGA UN AVISO CUANDO SE TOCA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTO VIVE EN UN MODULO PROPIO Y NO DENTRO DE QUIEN LO USA.
 *
 * Hasta el plan 05-06 habia UN solo emisor de avisos —el drenaje— y la funcion
 * vivia dentro de su ruta. Desde el plan 05-11 hay DOS: el drenaje y el aviso de
 * prueba del asistente de instalacion, que sale desde una Server Action.
 *
 * Duplicar esta resolucion en los dos sitios es exactamente la forma en que dos
 * copias de una decision de seguridad se desincronizan: alguien endurece una y
 * la otra se queda. Y la consecuencia de que se queden distintas es visible y
 * grave, ver abajo.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LO QUE SE DECIDE AQUI, Y POR QUE IMPORTA ────────────────────────────────
 *
 * `notifications.url` y el destino del aviso de prueba son RUTAS RELATIVAS
 * (`/aseos/{id}`, `/instalar?prueba={token}`). Alguien tiene que decidir contra
 * que origen se resuelven, y la decision tiene consecuencias visibles:
 *
 *   UN ORIGEN EQUIVOCADO MANDA A TODAS LAS ASEADORAS A OTRO DESPLIEGUE DESDE SU
 *   PANTALLA DE BLOQUEO, sin barra de direcciones que delate el salto.
 *
 * Por eso NO se deriva de `req.url` ni del header `Host`, que es exactamente la
 * fuente que la intuicion sugiere: ese header lo escribe quien llama, y apoyar
 * el destino de un aviso en un dato del atacante es gratis de evitar.
 *
 * Sale de la CONFIGURACION DEL SERVIDOR, en este orden:
 *
 *   1. `APP_BASE_URL`, que tiene que valer lo MISMO que el secreto `app_base_url`
 *      de Vault con el que el dispatcher de la migracion 17 construye la URL de
 *      la ruta de drenaje. Documentado en `.env.example`.
 *   2. El dominio de produccion que inyecta la plataforma. Es el dominio
 *      ESTABLE, no la URL del despliegue concreto: asi un despliegue de vista
 *      previa que drene una notificacion sigue mandando a la aseadora a la
 *      aplicacion de verdad y no a una vista previa que manana no existe.
 *
 * Si no hay ninguno devuelve `null`, y el llamante NO envia nada. NO se inventa
 * un origen: mandar a alguien a un sitio equivocado es peor que no mandarlo.
 */

import { readServerSecret } from '@/lib/env';

const VAR_ORIGEN = 'APP_BASE_URL';

export function origenDeLaAplicacion(): string | null {
  let crudo: string | null = null;
  try {
    crudo = readServerSecret(VAR_ORIGEN);
  } catch {
    const dominio = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    crudo = dominio ? `https://${dominio}` : null;
  }
  if (!crudo) return null;

  try {
    const u = new URL(crudo);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    // `.origin` normaliza y descarta cualquier ruta: `https://host/app/` y
    // `https://host` tienen que producir el mismo destino.
    return u.origin;
  } catch {
    return null;
  }
}
