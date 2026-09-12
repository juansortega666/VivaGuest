import { Skeleton } from '@/components/ui/skeleton';

/**
 * La forma EXACTA de lo que va a aparecer: titulo, fecha y tres tarjetas.
 *
 * Prohibido el spinner centrado a pantalla completa (§11.2): no dice nada sobre
 * lo que viene, y en un telefono con mala senal la aseadora se queda mirando un
 * circulo sin saber si hay uno o cinco aseos.
 */
export default function CargandoMisAseos() {
  return (
    <>
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-[28px] w-[160px]" />
        <Skeleton className="h-[24px] w-[220px]" />
      </div>

      <div className="flex flex-col gap-lg">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[132px] w-full rounded-md" />
        ))}
      </div>
    </>
  );
}
