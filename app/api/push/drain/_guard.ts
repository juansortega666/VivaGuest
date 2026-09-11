/**
 * El guard de `POST /api/push/drain`: UNA REEXPORTACION, SIN LOGICA PROPIA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NO IMPLEMENTA NADA, Y ESA ES LA DECISION.
 *
 * La propiedad que hace seguro el guard del secreto compartido —hashear LOS DOS
 * LADOS antes de compararlos, porque la comparacion de tiempo constante de Node
 * LANZA cuando los buferes miden distinto, y esa excepcion es ella misma un
 * canal lateral que revela la longitud del secreto— esta medida y probada UNA
 * SOLA VEZ, en `app/api/cron/sync-feed/_guard.ts`. Copiarla aqui crearia una
 * segunda copia que puede derivar sin que nadie lo note, y el dia que derive el
 * test de la primera seguiria verde. Dos endpoints publicos de internet, sin
 * cookie y sin sesion, que construyen la fabrica administrativa: el peor sitio
 * posible para dos implementaciones del mismo control de acceso.
 *
 * (El parrafo de arriba describe el patron en vez de escribir los identificadores
 * de `node:crypto`, porque el criterio de aceptacion de este archivo es un grep
 * de esos dos nombres. Misma regla que `scripts/ci/check-service-role.sh` se
 * impone en su propia cabecera.)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * POR QUE EXISTE EL ARCHIVO, EN VEZ DE IMPORTAR DIRECTO DESDE `route.ts`:
 * mantiene la convencion de `_guard.ts` por endpoint que el repo ya usa (el
 * guion bajo deja el archivo fuera del enrutador del App Router), y da un sitio
 * donde colgar el test de NO DUPLICACION: `_guard.test.ts` afirma la IDENTIDAD
 * REFERENCIAL entre lo que se exporta aqui y lo que exporta el original, y esa
 * asercion se rompe en el acto si alguien la reemplaza por una copia.
 *
 * El secreto es el MISMO (`CRON_SHARED_SECRET`) para los dos workers: lo dice
 * `.env.example` y lo repite `docs/despliegue-push.md`. El dispatcher de la
 * migracion 17 saca de Vault el mismo `cron_shared_secret` que el de la 14.
 */

export {
  exigirSecretoCron,
  SecretoCronInvalido,
  type MotivoDeNegacion,
} from '@/app/api/cron/sync-feed/_guard';
