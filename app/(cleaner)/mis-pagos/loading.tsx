import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga de `/mis-pagos` (07-UI-SPEC §12.2a).
 *
 * ESQUELETO DE GEOMETRIA REAL, NUNCA UN INDICADOR DE ESPERA CENTRADO. La razon
 * no es estetica: un circulo girando en el centro no dice si hay uno o cinco
 * periodos, y al resolverse el contenido salta de golpe. Aqui se reproducen las
 * medidas reales —el enlace de regreso, el titulo, las tarjetas con su alto y la
 * nota al pie— para que la unica diferencia al llegar los datos sea que el gris
 * se convierte en texto.
 *
 * TRES TARJETAS Y NO LAS QUE HAYA: cuantas hay es justo lo que todavia no se
 * sabe. Tres es lo que cabe en una pantalla de telefono sin desplazar, asi que
 * el esqueleto ocupa el alto que va a ocupar el contenido y no mas.
 *
 * El alto de 118px es el de la tarjeta real: 16px de relleno arriba, la linea de
 * las dos fechas, el total al tamano de titulo, la linea de estado, y 16px de
 * relleno abajo.
 */
export default function CargandoMisPagos() {
  return (
    <>
      <Skeleton className="h-[24px] w-[180px]" />
      <Skeleton className="h-[34px] w-[140px]" />

      <div className="flex flex-col gap-lg">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[118px] w-full rounded-md" />
        ))}

        <Skeleton className="h-[20px] w-[260px]" />
      </div>

      <span className="sr-only">Cargando tus pagos</span>
    </>
  );
}
