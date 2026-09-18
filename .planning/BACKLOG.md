# Backlog

Lo que no es del MVP pero está decidido que importa. Se revisa en cada cierre de milestone.

---

## v2 — Multi-tenant y autogestión

**Registrado:** 2026-09-12, durante la Fase 5.
**Origen:** pregunta del desarrollador, textual: *"yo siento que el MVP está basado en el alcance
de la descripción de nuestros aseadores y propiedades, sin embargo esto no tiene sentido porque
esto lo vamos a vender, debería ser genérico."*

### El objetivo declarado

Vender VivaGuest a **otros operadores de propiedades en LATAM**, y que sea **casi autogestionable**:
el cliente se registra, se configura y opera sin que nadie del equipo toque nada.

### Lo que se midió el 2026-09-12, leyendo el schema

| Hecho | Consecuencia |
|---|---|
| **Cero rastro de `tenant_id`, `org_id` ni equivalente** en las 23 tablas de `public` | No existe el concepto de empresa. Dos clientes en la misma base verían los datos del otro |
| La RLS autoriza con dos preguntas: `private.is_admin()` y `private.is_active_cleaner()` | La seguridad distingue **roles**, no **dueños** |
| Los 39 apartamentos, 8 clusters, aseadores, tipos de cuarto, tareas y faltantes viven en `supabase/seeds/` | **Esto NO es el problema.** Ya son datos: otro cliente es otro seed |
| `today_bog()` está usada en índices, policies y jobs | La zona horaria es lo segundo más caro de sacar |
| El dinero es `bigint` de pesos enteros, sin subunidad | Sirve para COP, CLP y PYG. **No sirve para MXN, BRL, ARS ni PEN**, que tienen centavos |

### El error de diagnóstico que conviene no repetir

La intuición apuntaba a los aseadores y las propiedades. Esos ya son datos y cambiarlos cuesta cero.
El problema real es **la ausencia de separación entre empresas**, que no se ve porque hoy solo hay
una.

### Costo de arreglar cada cosa, según cuándo

| Qué | Si se hace hoy | Si se hace después del MVP |
|---|---|---|
| Otro catálogo de propiedades y aseadores | cero | cero |
| Otra moneda sin decimales | cero | cero |
| **Moneda con subunidad (México, Brasil)** | **bajo: 3 columnas** | **alto: ~15 columnas y con histórico financiero vivo** |
| Otro país o zona horaria | medio | alto: índices, policies y jobs |
| **Separación entre empresas (multi-tenant)** | alto | **muy alto: 23+ tablas, RLS reescrita y migración con datos en producción** |

### Por qué NO se construye en el MVP

Construir abstracciones para clientes que todavía no existen retrasa el piloto, y el piloto es lo
único que dice si el producto sirve. El activo hoy son **39 unidades reales esperando**; un producto
genérico sin un solo cliente no vale nada.

**Y una salida que se evaluó y se descartó:** una instancia de Supabase por cliente. Aísla por
construcción y no toca el schema, pero **es incompatible con "autogestionable"**: si el cliente se
registra solo, nadie puede crear un proyecto a mano por cada uno. Aprovisionar eso automáticamente
cuesta más que hacer multi-tenant bien.

### Alcance de v2, para dimensionarlo honestamente

Autogestionable **no es una funcionalidad, es otro producto**:

- Separación de datos por empresa, con RLS reescrita y probada contra fuga entre inquilinos
- Registro y alta de empresa sin intervención humana
- Multi-moneda y multi-zona horaria
- Planes, cobro y límites de uso
- Soporte y observabilidad por cliente

Y el retrofit de multi-tenant sobre una base con datos reales **no es una fase: es un proyecto**,
con migración y ventana de riesgo. Se planea como milestone propio, no como una fase más del MVP.

### Lo que sí se decidió hacer YA, porque después cuesta caro

Tres reglas baratas hoy, escritas también en `PROJECT.md` §Constraints para que las fases 6 y 7 las
respeten. Ver ahí su forma vigente.

1. Dinero en unidad mínima más columna de moneda
2. `today_bog()` recibe la zona como parámetro, con Bogotá por defecto
3. Toda tabla nueva cuelga de `properties` o de `cleanings`

---

## Diferido desde fases anteriores

| Ítem | Origen | Por qué se difirió |
|---|---|---|
| Semáforo de entregabilidad de push (NOTIF-V2-01) | Fase 5 | Mide si los envíos llegan, no si hay a dónde enviarlos. Entra si el piloto pierde un aseo confirmado |
| Validación en teléfono físico (plan 05-17) | Fase 5 | Depende de exponer la app por HTTPS. **Corregido 2026-09-18:** ya no depende del wizard, que se eliminó |
| Enviar una prueba de aviso desde `/aseadores` | Fase 5, deuda §20.6 | Un aseador puede quedarse en `Sin probar` para siempre y el admin no tiene cómo forzarle una prueba |
| Modo oscuro en el árbol del aseador | Fase 5, deuda §20.2 | El aseador abre la app a las 6 de la mañana con el sistema en oscuro y recibe una pantalla blanca |
| **PWA offline-first: cola de mutaciones en IndexedDB** | Fase 6, decisión del desarrollador el 2026-09-12 | Es ~la mitad del trabajo de la Fase 6. Se difiere para sacar la app del aseador antes. **Riesgo aceptado:** si se cae la señal a mitad del aseo se pierde el trabajo de campo, y las fotos son justo lo que falla con mala señal. **Lo detonaría:** una aseadora que pierda un aseo completo en el piloto. Contradice la restricción de `PROJECT.md` que lo daba por sentado desde el día uno |
| Exportación o vista imprimible del cierre mensual | PROJECT.md §Riesgos | El cálculo es visible en pantalla y el snapshot persiste |

### Eliminado del backlog, no diferido

- **Wizard de `/instalar` y sus 5 capturas (plan 05-12)** — sale de la tabla el **2026-09-18** (quick `260918-h47`). **No se difiere a v2 ni se mueve de fase: se elimina como idea.** El dueño instala la PWA a mano, teléfono por teléfono, y entrega el aparato ya instalado; una guía dentro de la app no le sirve a nadie. Su código se borró entero en el mismo quick. Queda escrito aquí y no simplemente borrado para que nadie lo vuelva a proponer creyendo que es un hueco.
