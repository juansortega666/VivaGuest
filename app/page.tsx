import { redirect } from 'next/navigation';

/**
 * La raiz no tiene contenido propio: manda a `/login`.
 *
 * Una vez con sesion, el middleware reescribe el destino segun `app_metadata.role`
 * (admin al dashboard, aseador a su ruta), asi que este redirect solo cubre el caso
 * sin sesion y el enlace directo a la raiz.
 *
 * Sustituye la landing de `create-next-app`, que ademas metia valores de color
 * literales en clases arbitrarias de Tailwind y rompia el guardarrail 6 de
 * `scripts/ci/check-service-role.sh`.
 */
export default function Home() {
  redirect('/login');
}
