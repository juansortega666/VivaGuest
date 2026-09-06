'use client';

import {
  Building2,
  CalendarClock,
  Check,
  CircleCheck,
  CircleSlash,
  Flag,
  MoreHorizontal,
  UserRoundCog,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AseadorActivo, FilaDeOperacion } from '@/lib/data/operacion';
import { estadoDeAseo } from '@/lib/domain/cleanings';
import { formatFechaBog } from '@/lib/domain/dates';

import { limpiarMarcaDeRevision } from '../_actions';
import { DialogoCancelarAseo } from './DialogoCancelarAseo';
import { DialogoCerrarAseo } from './DialogoCerrarAseo';
import { DialogoReasignar } from './DialogoReasignar';
import { DialogoReprogramar } from './DialogoReprogramar';
import { SheetConfirmar } from './SheetConfirmar';

/**
 * Menú `⋯` de una fila de aseo (04-UI-SPEC.md §7.3). Sale de
 * `MenuApartamento.tsx`, que fijó la forma en la Fase 2.
 *
 * ── LA VISIBILIDAD DE LOS ITEMS COINCIDE CON LAS PRECONDICIONES DE LAS RPC ──
 * No con lo que "tendría sentido": con lo que la migración 15 acepta. Un ítem
 * que la base rechaza es un error que el admin descubre después de pulsarlo.
 *
 *   reassign_cleaning    is_managed · confirmado_at NO nulo · started_at NULO ·
 *                        state <> cancelada          -> el estado `pendiente`
 *   reschedule_cleaning  is_managed · started_at NULO · state <> cancelada
 *   close_cleaning       is_managed · state in (pendiente, en_curso)
 *   cancel_cleaning      is_managed · state in (pendiente, en_curso)
 *   clear_review_flag    is_managed
 *
 * ── DOS DESVIACIONES DECLARADAS DEL UI-SPEC §7.3 ──────────────────────────
 *
 * 1. §7.3 muestra `Reasignar` también sobre `En curso`. Acá se restringe a
 *    `Pendiente`, porque `reassign_cleaning` exige `started_at is null`. La
 *    condición real es "no hay trabajo hecho todavía": un aseo que ya empezó no
 *    se reasigna, y reasignarlo dejaría el `started_at` de una persona sobre el
 *    nombre de otra. Para eso está `Cerrar manualmente`, o el `No puedo` del
 *    aseador de la Fase 6, que sí limpia `started_at`. Mostrar el ítem sobre
 *    `En curso` sería ofrecer una acción que la base rechaza.
 *
 * 2. §7.3 no lista `Marcar como revisado`. Se añade porque la migración 13,
 *    línea 106, promete literalmente que `needs_review` es pegajoso y que "solo
 *    el admin lo apaga, en la Fase 4", y el UI-SPEC ya renderiza la señal `Flag`
 *    de §5.2 sin ninguna acción que la apague. Es la superficie de
 *    `clear_review_flag`. Sin ella la marca se queda encendida para siempre y el
 *    admin aprende a ignorarla, que es cómo muere una alerta.
 *
 * ── NINGUN ITEM SE MUESTRA DESHABILITADO ──────────────────────────────────
 * Un ítem atenuado que no dice por qué es peor que su ausencia. Misma regla que
 * `MenuApartamento.tsx`. Sobre `Terminado` y `Cancelado` el menú se queda con
 * `Ver apartamento` y nada más.
 *
 * ── OCULTAR UN ITEM NO ES AUTORIZAR (T-04-17) ─────────────────────────────
 * Esto es UX, con las mismas palabras que la Fase 2. Cada RPC verifica el rol
 * por dentro con `private.is_admin()` y cada action arranca por `exigirAdmin()`.
 * Un Server Action es un endpoint HTTP público y nadie tiene que abrir este menú
 * para invocarlo. El menú solo evita ofrecer acciones que la base va a rechazar.
 *
 * ── LOS DIALOGOS VIVEN FUERA DEL `DropdownMenu` ───────────────────────────
 * Controlados por estado de este componente, que es el patrón de
 * `MenuApartamento.tsx`. La razón es concreta: el menú se cierra al pulsar el
 * ítem, desmonta su árbol, y un diálogo montado dentro se iría con él antes de
 * llegar a abrirse.
 *
 * Además se monta SOLO el que está abierto. Con treinta filas en pantalla,
 * mantener los cinco montados en cada una serían 150 `useActionState` y 150
 * suscripciones al router en reposo; y un diálogo que solo existe mientras está
 * abierto no puede arrastrar el estado de la vez anterior.
 *
 * ── `Confirmar` NO ABRE UN DIALOGO PROPIO ─────────────────────────────────
 * Abre el `SheetConfirmar` del plan 04-10 con una tanda de uno. Hay UNA sola
 * superficie de confirmación en la aplicación: un segundo formulario con los
 * mismos dos campos sería el sitio donde las dos validaciones se desincronizan.
 */

/**
 * Lo que las acciones de una fila necesitan y la fila no trae.
 *
 * Viaja como UN objeto y no como tres props sueltas porque atraviesa tres
 * componentes (`BloqueDia` -> `TablaDia` -> `FilaAseo`) que no lo usan: así
 * añadir un cuarto dato mañana no vuelve a tocar los tres.
 */
export interface ContextoDeAcciones {
  /** Aseadores activos, ya ordenados por nombre. Solo para el `Select` de reasignar. */
  aseadores: AseadorActivo[];
  /** `property_id` -> nombre del responsable fijo, o `null`. Lo pide `SheetConfirmar`. */
  responsables: Record<string, string | null>;
  /** El día de negocio de Bogotá, del servidor. Es el `min` del campo de fecha. */
  hoy: string;
}

export function MenuAseo({
  fila,
  acciones,
}: {
  fila: FilaDeOperacion;
  acciones: ContextoDeAcciones;
}) {
  const router = useRouter();

  const [dialogo, setDialogo] = useState<
    'reasignar' | 'reprogramar' | 'cerrar' | 'cancelar' | null
  >(null);

  // El `Sheet` se monta con `key` de sesión, igual que desde la bandeja: reabrir
  // tiene que producir una tanda nueva y no reanudar la anterior.
  const [sesionConfirmar, setSesionConfirmar] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [revisando, setRevisando] = useState(false);

  const { clave } = estadoDeAseo(fila);

  const puedeConfirmar = clave === 'sin_confirmar';
  const puedeReasignar = clave === 'pendiente';
  const puedeReprogramar = clave === 'pendiente';
  const puedeRevisar = fila.needs_review && fila.is_managed;
  // `Cerrar manualmente` y `Cancelar aseo` comparten precondición en la base:
  // `state in ('pendiente','en_curso')`. Se derivan de la misma constante para
  // que no puedan divergir por un `if` copiado.
  const tieneTrabajoVivo = clave === 'pendiente' || clave === 'en_curso';

  const nombre = fila.property?.nombre ?? 'este apartamento';
  const fecha = formatFechaBog(fila.scheduled_date);

  /**
   * `Marcar como revisado` va SIN diálogo de confirmación.
   *
   * Apagar una marca de revisión no destruye nada y es reversible por el propio
   * sync: si el hecho que la encendió vuelve a ocurrir, `sync_feed_apply()` la
   * vuelve a encender. Un `AlertDialog` acá sería una fricción sin nada que
   * proteger.
   */
  async function marcarRevisado() {
    setRevisando(true);
    try {
      const formData = new FormData();
      formData.set('aseo_id', fila.id);

      const resultado = await limpiarMarcaDeRevision(null, formData);

      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }

      toast.success(resultado.mensaje);
      // La action ya llamó a `revalidatePath`; esto pide el árbol de servidor YA
      // para que la señal `Flag` desaparezca de la fila sin recargar a mano.
      router.refresh();
    } finally {
      setRevisando(false);
    }
  }

  function abrirConfirmacion() {
    setSesionConfirmar((n) => n + 1);
    setConfirmando(true);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              // El nombre accesible lleva el apartamento Y la fecha: con treinta
              // filas en pantalla, treinta botones llamados "Acciones" son
              // indistinguibles para quien navega por lista de controles, y solo
              // con el apartamento seguirían repitiéndose entre días.
              aria-label={`Acciones del aseo de ${nombre} del ${fecha}`}
              className="transicion flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MoreHorizontal className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </button>
          }
        />

        <DropdownMenuContent align="end">
          {puedeConfirmar && (
            <DropdownMenuItem onClick={abrirConfirmacion}>
              <Check aria-hidden="true" />
              Confirmar
            </DropdownMenuItem>
          )}

          {puedeReasignar && (
            <DropdownMenuItem onClick={() => setDialogo('reasignar')}>
              <UserRoundCog aria-hidden="true" />
              Reasignar
            </DropdownMenuItem>
          )}

          {puedeReprogramar && (
            <DropdownMenuItem onClick={() => setDialogo('reprogramar')}>
              <CalendarClock aria-hidden="true" />
              Reprogramar
            </DropdownMenuItem>
          )}

          {puedeRevisar && (
            <DropdownMenuItem onClick={marcarRevisado} disabled={revisando}>
              <Flag aria-hidden="true" />
              Marcar como revisado
            </DropdownMenuItem>
          )}

          {tieneTrabajoVivo && (
            <DropdownMenuItem onClick={() => setDialogo('cerrar')}>
              <CircleCheck aria-hidden="true" />
              Cerrar manualmente
            </DropdownMenuItem>
          )}

          {/* Siempre, en cualquier fila gestionada: es el único ítem que le queda
              al menú sobre `Terminado` y sobre `Cancelado`. */}
          <DropdownMenuItem render={<Link href={`/apartamentos/${fila.property_id}`} />}>
            <Building2 aria-hidden="true" />
            Ver apartamento
          </DropdownMenuItem>

          {tieneTrabajoVivo && (
            <>
              {/* El separador SÍ se pinta: el ítem destructivo tiene por encima
                  `Ver apartamento`, o sea algo de lo que separarlo (§7.3). */}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDialogo('cancelar')}>
                <CircleSlash aria-hidden="true" />
                Cancelar aseo
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/*
        Los cinco, HERMANOS del `DropdownMenu` y nunca dentro de él. Ver la
        cabecera: montado dentro, el menú se los lleva al cerrarse.
      */}

      {confirmando && (
        // Tanda de uno: `1 de 1` y el primario dice `Confirmar y cerrar`. El
        // `responsables` se recorta a esta unidad porque es lo único que el panel
        // consulta, y así el menú no acarrea el mapa de 39 apartamentos.
        <SheetConfirmar
          key={sesionConfirmar}
          filas={[fila]}
          responsables={{ [fila.property_id]: acciones.responsables[fila.property_id] ?? null }}
          onCerrar={() => setConfirmando(false)}
        />
      )}

      {dialogo === 'reasignar' && (
        <DialogoReasignar
          aseo={{ id: fila.id, apartamento: nombre, aseadorActualId: fila.aseador_id }}
          aseadores={acciones.aseadores}
          abierto
          onAbiertoChange={(a) => !a && setDialogo(null)}
        />
      )}

      {dialogo === 'reprogramar' && (
        <DialogoReprogramar
          aseo={{ id: fila.id, apartamento: nombre, fecha: fila.scheduled_date }}
          hoy={acciones.hoy}
          abierto
          onAbiertoChange={(a) => !a && setDialogo(null)}
        />
      )}

      {dialogo === 'cerrar' && (
        <DialogoCerrarAseo
          aseo={{ id: fila.id, apartamento: nombre }}
          abierto
          onAbiertoChange={(a) => !a && setDialogo(null)}
        />
      )}

      {dialogo === 'cancelar' && (
        <DialogoCancelarAseo
          aseo={{ id: fila.id, apartamento: nombre, fecha: fila.scheduled_date }}
          abierto
          onAbiertoChange={(a) => !a && setDialogo(null)}
        />
      )}
    </>
  );
}
