# Phase 6: PWA del aseador - Context

**Gathered:** 2026-09-12
**Status:** Ready for UI phase
**Origen:** conversación directa con el desarrollador, que describió el flujo de su puño y letra.

<domain>
## Phase Boundary

El aseador ejecuta el aseo desde el teléfono y deja evidencia. Hasta hoy recibe el aviso (Fase 5) y
ve el aseo, pero **no puede hacer nada con él**: no hay forma de marcar que empezó, ni de chulear el
checklist, ni de subir una foto. Esta fase cierra eso.

**Entra:** PWA-01, PWA-04 a PWA-10 (salvo lo diferido), CHECK-01 a CHECK-04, REPORT-01 a REPORT-03.

**No entra:**
- **El modo sin señal.** Diferido por decisión explícita (D-08). Era ~la mitad del trabajo de la fase.
- **El wizard de `/instalar`** y su validación en teléfono físico, que quedaron diferidos de la Fase 5.

</domain>

<decisions>
## Implementation Decisions

### D-01 · El home es una lista de tarjetas deslizables, no una sola

El aseador abre la app y ve **sus aseos del día** como tarjetas, desplazables hacia abajo. En plural:
una aseadora puede tener tres aseos el mismo día, y una sola tarjeta escondería los otros dos.

### D-02 · "No puedo" es el segundo paso, no un botón dentro del aseo

Al tocar la tarjeta **no se entra directo al aseo**. Salen dos opciones:

- **`Comenzar aseo`**, que es la acción principal.
- **`Reportar no poder`**, que devuelve el aseo a Pendiente sin asignar y **le manda una alerta al
  admin**.

La razón de que sea el segundo paso y no un botón escondido dentro del checklist: el aseador sabe que
no puede **antes** de empezar, no a mitad. Ponerlo dentro obliga a entrar y salir.

El transporte ya existe: `decline_cleaning` emite la notificación desde la Fase 3 y la Fase 5 la
drena.

### D-03 · El checklist va en acordeones por cuarto, NO en wizard

Discutido explícitamente. Gana el acordeón por dos razones:

1. **La aseadora no limpia en orden fijo.** Puede arrancar por el baño. Un wizard la obliga a un
   orden que no es el suyo.
2. **Ya hay un wizard después**, el de la evidencia (D-05). Dos wizards seguidos cansan.

El acordeón deja abrir el cuarto que está haciendo y ver el progreso completo de un vistazo.

Los cuartos del acordeón son **únicamente los que ese apartamento tiene** (`property_rooms`), no un
catálogo fijo.

### D-04 · Los botones de acción van fijos abajo

Barra fija en la parte inferior de la pantalla, para poder oprimirla rápido sin buscar. Aplica al
botón de finalizar y a las acciones principales del flujo.

### D-05 · La evidencia se recoge AL FINAL, guiada cuarto por cuarto

El aseador chulea el checklist y toca finalizar. **Ahí** se abre la recolección de evidencia, y el
sistema le va pidiendo cuarto por cuarto: cuarto 1 y sube, sala y sube, comedor y sube.

Es una desviación deliberada del diseño original, que pedía la foto dentro de cada cuarto al cerrarlo.
Se planteó el riesgo (que la aseadora fotografíe desde el pasillo cuando ya salió) y el desarrollador
lo aceptó a cambio de un flujo más simple.

### D-06 · Se puede saltar un cuarto, con motivo, y el admin lo ve

**Corrige el criterio 2 del ROADMAP**, que decía que "Terminé" queda bloqueado si falta la foto de
algún cuarto.

Se evaluaron tres opciones y se eligió la del medio:
- Skip libre: la evidencia se vuelve opcional en la práctica.
- **Skip con marca (elegida):** puede saltar, pero el aseo queda marcado **sin evidencia completa** y
  eso **le sale al admin en el dashboard**.
- Sin skip: al menos una foto por cuarto para poder terminar.

**El motivo sale de una lista cerrada**, más un campo libre opcional. Ejemplos de la conversación:
`el huésped dejó cosas`, `el cuarto estaba cerrado`, `otro`.

**Se descartó exigir un mínimo de 30 palabras**, que fue la primera propuesta del desarrollador, y la
razón está medida en el comportamiento humano, no en la técnica: un contador de palabras se burla
solo (la gente escribe relleno) y castiga a quien tiene una razón legítima pero corta. Una lista
cerrada, además, **se puede contar**: el admin ve cuántas veces pasa cada motivo.

### D-07 · Un solo reporte, clasificado, y el gasto lleva monto

Al final, **opcional**: un campo libre donde el aseador escribe lo que pasó, **clasificado** en una de
las tres categorías que ya existen en el schema: **daño**, **gasto** o **faltante**.

**El gasto lleva un campo de monto**, y no es un detalle de formulario: sin monto, el cierre mensual
de la Fase 7 no puede sumar lo que se gastó y el admin tendría que digitarlo a mano desde un texto.

### D-08 · Sin modo offline. Diferido.

**Corrige el criterio 4 del ROADMAP**, que exigía completar un aseo entero en modo avión.

Es aproximadamente la mitad del trabajo de la fase (cola de mutaciones en IndexedDB, idempotencia por
identificador de evento, contador de pendientes, drenaje en primer plano porque iOS no tiene Background
Sync). Se difiere para sacar la app del aseador antes.

**Riesgo aceptado y registrado en `.planning/BACKLOG.md`:** si se cae la señal a mitad del aseo se
pierde el trabajo de campo, y **las fotos son justo lo que falla con mala señal**. Lo detonaría una
aseadora que pierda un aseo completo durante el piloto.

Contradice una restricción de `PROJECT.md` que lo daba por sentado desde el día uno. Queda anotado
como diferido, no como olvido.

### Claude's Discretion

- La forma exacta de la tarjeta del home y de la hoja con las dos opciones de D-02.
- Cómo se representa "sin evidencia completa" en el dashboard del admin, y en qué superficie.
- Si el reporte de D-07 es una sola pantalla con selector de categoría o tres accesos.
- El detalle de la barra fija de D-04: alto, sombra y comportamiento al hacer scroll.
- La lista concreta de motivos de skip de D-06, que sale del catálogo existente o se siembra nueva.

</decisions>

<canonical_refs>
## Canonical References

### Schema que esta fase consume, y que en su mayoría YA EXISTE
- `supabase/migrations/20260831212658_04_operacion.sql` — `cleanings`, `cleaning_checklist_items`,
  `cleaning_photos`, `damages`, `expenses`, `missing_item_reports` y `missing_item_lines`. **Las
  tablas de checklist, evidencia y reportes ya están creadas desde la Fase 1.**
- `supabase/migrations/20260831210111_03_catalogo.sql` — `property_rooms`, `room_types`,
  `checklist_tasks` y `missing_item_catalog`, que es de donde sale el checklist armado por apartamento.
- `supabase/migrations/20260831215108_05_triggers_y_maquina_de_estados.sql` — la máquina de estados y
  el log de transiciones. `pendiente -> en_curso -> completada` ya está escrita y vigilada por CHECK.
- `supabase/migrations/20260831223038_09_rpc.sql` — `reveal_access_code`, `finish_cleaning` y
  `decline_cleaning`, **ya construidas**.
- `supabase/migrations/20260831224030_10_storage.sql` — el bucket privado `evidencia` con sus policies.

### Lo que la Fase 5 dejó listo y esta fase extiende
- `app/(cleaner)/aseos/[id]/page.tsx` y `TarjetaAseo.tsx` — la pantalla de aterrizaje de solo lectura.
- `app/(cleaner)/_components/CodigoDeAcceso.tsx` — el código con su auditoría y su ventana temporal.
- `app/(cleaner)/mis-aseos/page.tsx` — **todavía es un stub**, y es lo que D-01 convierte en el home.
- La escala tipográfica móvil de `05-UI-SPEC.md` §3.1 y su guardarraíl `check-escala-movil.sh`.

### Reglas de producto vigentes
- `.planning/PROJECT.md` §Constraints — incluidas **las tres reglas del camino a v2** del 2026-09-12,
  que esta fase tiene que respetar: dinero en unidad mínima más moneda, `today_bog()` parametrizable,
  y toda tabla nueva colgando de `properties` o de `cleanings`.
- `.planning/BACKLOG.md` — lo diferido, con su riesgo escrito.

</canonical_refs>

<code_context>
## Existing Code Insights

### Lo que ya existe y se reusa
- **Casi todo el schema.** Las tablas de checklist, fotos y reportes llevan creadas desde la Fase 1.
  Esta fase construye sobre todo **UI y RPC**, no estructura.
- El árbol `app/(cleaner)/` con su layout, su guard de sesión y su banner de avisos.
- El bucket `evidencia`, privado, con sus policies.

### Trampas vivas, medidas, que esta fase hereda
- **`max-w-<talla>` en primitivas de shadcn** compila a 4-16 px. `npm run ci:arch` lo atrapa.
- **Bajo `app/(cleaner)/` solo se usan las clases tipográficas con sufijo `-movil`**, y hay un
  guardarraíl de CI que lo impone desde la Fase 5. Es lo que evita el zoom automático de iOS al
  enfocar un campo, **y esta fase es la primera que va a tener campos**.
- **`revalidatePath` está prohibido** en las Server Actions de `(admin)`: cuelga el navegador. El
  refresco lo pide `router.refresh()`.
- Las fotos se comprimen **en el cliente** a ~200 KB y lado largo de 1280 px, y se les quita el EXIF
  conservando solo la orientación.

</code_context>

<specifics>
## Specific Ideas

- El flujo, en palabras del desarrollador: *"el aseador abre la PWA y le sale una card que dice el
  aseo que tiene disponible, le da click y cuando entra le muestra una serie de acordeones. Después
  de eso tiene un botón persistente que dice finalizar, ahí se abre la opción de subir la evidencia
  por cuarto, la sube, y finalmente y no de manera obligatoria tiene un campo para reportar incidente
  o novedad. Si no reporta nada puede finalizar y listo, vuelve al home."*
- **El uso real calibra el diseño:** de pie, con guantes o las manos mojadas, una mano ocupada. Por
  eso los botones van fijos abajo y el piso de toque es de 44 px.
- La asimetría que guía el proyecto desde la Fase 3 sigue aplicando: un aviso de más lo ignora un
  humano; un aseo sin evidencia no se puede reconstruir después.

</specifics>

<deferred>
## Deferred Ideas

- **PWA offline-first con cola de mutaciones** (D-08). En `.planning/BACKLOG.md` con su riesgo.
- **Wizard de `/instalar` y sus 5 capturas**, diferidos de la Fase 5.
- **Validación en teléfono físico**, diferida de la Fase 5.
- **Mínimo de 30 palabras para justificar un skip**, descartado a favor de la lista cerrada de D-06.

</deferred>

---
