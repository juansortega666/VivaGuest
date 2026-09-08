'use client';

import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';

/**
 * Progreso del montaje del catalogo (UI-SPEC §9.1).
 *
 * ── POR QUE ESTA PANTALLA NO TIENE ESTADO VACIO ─────────────────────────────
 * La lista de apartamentos NUNCA esta vacia: la Fase 1 sembro las 39 unidades
 * reales. Pero el dia uno las 39 son placeholders con `tarifa_huesped` y
 * `pago_aseador` en NULL e `is_active = false`, asi que la tabla llena de datos
 * falsos es el verdadero "vacio". Un `EstadoVacio` generico no aplica —no hay
 * nada que crear— y lo que si aplica es decir cuanto falta.
 *
 * ── EL DENOMINADOR ES 34, NO 39, Y NO ESTA ESCRITO A MANO ───────────────────
 * Las informativas no se montan: no tienen tarifas, ni responsable, ni estado
 * activable (`cl_unmanaged_is_inert`, `props_assignees_only_when_managed`).
 * Contarlas en el denominador haria que el montaje no llegara nunca al 100%.
 *
 * Y el 34 se DERIVA contando las gestionadas en `resumenDelCatalogo()`. Escrito
 * a mano, el dia que el admin marque una unidad como gestion externa desde el
 * formulario, el banner mentiria hasta que alguien se diera cuenta.
 *
 * ── DESAPARECE SOLO AL LLEGAR A 34 DE 34 ────────────────────────────────────
 * No se convierte en un check permanente. Cumplio su funcion y deja de ocupar
 * espacio encima de la tabla que el admin va a mirar todos los dias durante los
 * proximos anos. La condicion de render es "queda al menos una gestionada no
 * activa".
 *
 * ── EL ACENTO ───────────────────────────────────────────────────────────────
 * La barra de progreso es uno de los cinco usos permitidos de `--primary`
 * (§4.4), y el switch marcado es otro. No hay ningun otro acento en este bloque.
 */
export function BannerMontaje({
  gestionadas,
  listas,
  soloPendientes,
  onSoloPendientesChange,
  idInterruptor,
}: {
  /** Denominador: las unidades que se montan dentro del sistema. */
  gestionadas: number;
  /** Numerador: gestionadas ya activas. */
  listas: number;
  soloPendientes: boolean;
  onSoloPendientesChange: (valor: boolean) => void;
  /** Lo genera el padre con `useId` para ligar el `<label>` al interruptor. */
  idInterruptor: string;
}) {
  const faltan = gestionadas - listas;

  // Nada que montar (catalogo solo informativo) o montaje terminado: fuera.
  if (gestionadas === 0 || faltan <= 0) return null;

  return (
    <section
      aria-labelledby={`${idInterruptor}-titulo`}
      className="flex flex-col gap-sm rounded-md bg-canvas p-lg"
    >
      <div className="flex items-center justify-between gap-lg">
        <h2 id={`${idInterruptor}-titulo`} className="text-heading text-foreground">
          Montaje del catálogo
        </h2>

        <div className="flex items-center gap-sm">
          <label htmlFor={idInterruptor} className="text-body text-muted-foreground">
            Ver solo pendientes
          </label>
          {/*
            `aria-label` ADEMAS del `<label htmlFor>`: los dos dicen lo mismo, y el
            atributo garantiza el nombre accesible aunque el primitivo cambie de
            elemento renderizado. El filtro deja `Incompleta` + `Inactiva`, que es
            exactamente lo que este banner esta contando como pendiente.
          */}
          <Switch
            id={idInterruptor}
            aria-label="Ver solo pendientes"
            checked={soloPendientes}
            onCheckedChange={onSoloPendientesChange}
          />
        </div>
      </div>

      <p className="text-body tabular-nums text-foreground">
        {listas} de {gestionadas} unidades gestionadas listas
      </p>

      {/*
        `value`/`max` en vez de un porcentaje precalculado: asi `aria-valuenow` y
        `aria-valuemax` dicen 6 y 34, que es lo que la linea de arriba dice, en vez
        de un 17% que nadie ha escrito en pantalla.
      */}
      <Progress
        value={listas}
        max={gestionadas}
        aria-label="Progreso del montaje del catálogo"
        className="flex"
      />

      <p className="text-micro tabular-nums text-muted-foreground">
        Faltan {faltan} por completar o activar.
      </p>
    </section>
  );
}
