# Diferidos de la Fase 3

Hallazgos fuera del alcance del plan que los encontró. No se arreglan aquí (regla de frontera de
alcance del ejecutor): son preexistentes y no los causa el cambio en curso.

## Del plan 03-09

### `npm run lint` en rojo por tres errores preexistentes

- `e2e/fixtures.ts:104,110,116` — `react-hooks/rules-of-hooks`: el `use` de Playwright (fixtures)
  lo confunde con el hook `use` de React. Son funciones de fixture, no componentes. Se cierra con
  una excepción de ESLint acotada a `e2e/`, no tocando el código.
- `lib/domain/aseador.schema.test.ts:40` — aviso de `_phone` asignado y no usado.

Ninguno lo introduce el plan 03-09 y ninguno afecta a `test:unit`, `test:integration`, `db:test`,
`tsc --noEmit` ni `ci:arch`, que son los que la fase verifica.

### El dead man's switch externo (T-03-85)

`estadoDeSincronizacion` cierra el caso "no corre nada dentro de la base" porque se computa AL
LEER, pero si el admin no abre el panel nadie se entera. Aceptado para el MVP y declarado en el
resumen del plan 03-09. Lo cerraría un ping externo desde el dispatcher hacia un servicio de
terceros. Fuera del alcance.

**Dueño:** la fase de despliegue. **Forma de cierre:** el dispatcher hace un `pg_net` extra hacia
un servicio de terceros en cada corrida; si el servicio deja de recibir el ping, avisa por fuera del
sistema. Es la única capa que no es ciega a su propia muerte.

## Del plan 03-10

### 1. El checkpoint 2 queda diferido CON FECHA, no indefinidamente

**Qué pasa.** `feed_sync_runs` guarda en cada corrida de diff el piso del feed (`min_ends_on`) y el
contador de rotaciones de UID. Son los dos instrumentos que contestan empíricamente las dos
preguntas que llevaban dos documentos de research en disputa. Instrumentación escrita y no leída es
instrumentación desperdiciada.

**Por qué no se lee aquí, y esto es lo que lo convierte en diferimiento legítimo.** No se difiere
por falta de tiempo: **se difiere porque producción no existe todavía.** El checkpoint A1 de la
Fase 1 (crear los proyectos Supabase de dev y de producción) sigue abierto, así que no hay tres días
de sync real contra feeds de Airbnb de verdad que leer. Toda la Fase 3 se verificó en local, y en
local el piso del feed y las rotaciones de UID salen de fixtures construidas por nosotros: leerlas
sería medirnos a nosotros mismos.

**Fecha de disparo.** **Al tercer día de sync real corriendo en producción**, atado a que se cierre
el checkpoint A1 de la Fase 1. Con 34 feeds y ~15 reservas por feed hay muestra de sobra en una
semana.

**Dueño:** el usuario, al desplegar producción.

**Las tres consultas, literales y listas para pegar.** No están resumidas a propósito: un resumen
obliga a reconstruirlas dentro de tres meses y ahí se pierden.

1. Serie del piso del feed por hora de Bogotá:

```sql
select date_trunc('hour', started_at at time zone 'America/Bogota') as hora_bog,
 min(min_ends_on), max(min_ends_on) from public.feed_sync_runs
 where outcome = 'ok' group by 1 order by 1;
```

2. Distribución de desapariciones:

```sql
select ends_on, disappeared_at at time zone 'America/Bogota' as se_fue_bog,
 (disappeared_at at time zone 'America/Bogota')::date - ends_on as dias_despues
 from public.calendar_reservations where disappeared_at is not null order by ends_on;
```

3. Rotaciones de UID:

```sql
select sum(uid_rotations) from public.feed_sync_runs;
```

**Las dos preguntas que contestan, y qué decisión desbloquea cada una.**

| Pregunta | La contestan | Qué desbloquea |
|---|---|---|
| ¿La reserva que termina hoy desaparece hoy mismo o mañana, y con qué zona horaria? | Consultas 1 y 2. Si `min_ends_on` salta de D a D+1 **durante el propio día D**, es el mundo B, y la hora de Bogotá en que salta dice qué zona horaria usa Airbnb. Si salta al empezar D+1, es el mundo A. La hora del día de la segunda columna de la consulta 2 contesta la parte de la zona horaria. | La decisión de encoger o no la ventana protegida. Ver la entrada 2. |
| ¿El `UID` de Airbnb sobrevive a un cambio de fechas? | Consulta 3. **Cero** significa que el `UID` es estable. Distinto de cero significa que rota, y que el nivel 1 de identidad (el código de reserva) es el que está sosteniendo el sistema. | Nada bloqueante: el diseño del diff es correcto bajo las dos respuestas, porque la identidad del aseo es `(property_id, scheduled_date)` y no la reserva. Si sale distinto de cero, hay que comprobar que la aserción 12 del plan 03-09 sigue cubriendo el caso. |

**Qué hacer con la salida.** Pegarla **literal** en este archivo, con su fecha. No un resumen: la
salida real es el dato, y el resumen es la interpretación de quien la miró ese día.

### 2. La ventana protegida se queda en `today_bog() + 1`. Decisión tomada, no pendiente

**Decisión:** no se encoge. Se queda en `today_bog() + 1` hasta que las consultas de la entrada 1
den un dato real de producción.

**Justificación, y es la única que importa:** no hay ni un dato medido que confirme el mundo A. Lo
que hay son dos documentos de research en desacuerdo y fixtures construidas por nosotros, que
prueban que el código se comporta bien bajo los dos mundos pero no cuál es el mundo real.

Y la asimetría de costos es la que el propio plan describe:

- **Coste de dejarla en `+1` si el mundo real fuera A:** un aseo de más, que un humano revisa en el
  panel y cancela en diez segundos.
- **Coste de encogerla a `today_bog()` si el mundo real fuera B:** el aseo de hoy cancelado con la
  aseadora ya en camino al apartamento.

Ante cualquier duda no se encoge. La postura conservadora se mantiene por escrito y con dueño, que
es distinto de mantenerse por olvido.

### 3. Los proyectos Supabase de dev y de producción no existen (checkpoint A1 de la Fase 1)

**Qué pasa.** El checkpoint A1 sigue abierto desde la Fase 1. Toda la Fase 3 se verificó contra el
stack local: `supabase start`, migraciones aplicadas, `pg_cron` y `pg_net` instalados en local.

**Impacto.** Bloquea el checkpoint 2 de este plan (entrada 1) y las entradas 5 y 6. Ninguna decisión
de ingeniería de esta fase depende de él: el diseño es seguro bajo las dos respuestas de las
preguntas abiertas, y por eso la fase cierra igual.

**Lo que NO es una migración.** Los secretos de Vault (el secreto compartido del cron y la URL base
del worker) son **datos**, no schema. No pueden ir en una migración: quedarían en texto plano en el
repositorio y en `cron.job.command`, que es texto plano y está medido. Son un paso operativo del
despliegue y están documentados en `docs/despliegue-sync.md`.

**Dueño:** el usuario, al desplegar. **Forma de cierre:** crear los dos proyectos, cargar los dos
secretos en Vault y correr el agendado del dispatcher.

### 4. `CRON_SHARED_SECRET` vive en tres sitios que tienen que coincidir

**Qué pasa.** El mismo secreto compartido tiene que estar en `.env.local` (para la suite de
integración), en Vercel (para el worker desplegado) y en Vault (para el dispatcher de `pg_cron`).
Nada del sistema comprueba que los tres coincidan.

**El modo de fallo, que es lo peligroso.** Cuando no coinciden, el dispatcher manda la petición, el
worker responde **401 sin cuerpo** (a propósito: distinguir "no mandaste header" de "el secreto no
coincide" es información gratis para quien sondea el endpoint) y `pg_net` es fire-and-forget, así
que nadie lee esa respuesta. **El sync deja de correr en silencio.** Solo se ve por dos vías
indirectas: el historial del job y la obsolescencia de la salud del feed, que es exactamente lo que
`estadoDeSincronizacion` computa.

**Dueño:** la fase de despliegue. **Forma de cierre:** una comprobación de arranque en el despliegue
que haga una llamada de prueba al worker con el secreto de Vault y verifique que no da 401.

### 5. Que el job corra cada minuto durante días no está verificado, y no puede estarlo sin producción

**Qué pasa.** En local la cadencia se aproxima con el agendado de segundos, que es lo que hace la
suite del dispatcher. Eso mide el mecanismo, no la resistencia: un job que corre cada minuto durante
días acumula historial, lease vencidos y feeds con backoff largo, y ninguna de esas condiciones se
alcanza en una corrida de test.

**Dueño:** la primera semana de producción. **Forma de cierre:** revisar `cron.job_run_details` y la
distribución de `consecutive_failures` al séptimo día.

### 6. Que el feed real llegue con CRLF no está probado

**Qué pasa.** `airbnb-real-crlf.ics` prueba que el código lo aguanta, no que Airbnb lo mande así. La
fixture real llegó normalizada a LF por el proceso de anonimización. El RFC 5545 §3.1 especifica
CRLF, así que es lo más probable, pero la captura que tenemos no lo demuestra.

**Impacto.** Ninguno si el desdoblado sigue normalizando el retorno de carro, que es lo que el
señuelo 1 del plan 03-02 vigila con cinco tests. La entrada existe para que nadie borre esa
normalización pensando que es defensiva.

**Dueño:** la primera corrida real. **Forma de cierre:** una sola corrida contra el feed en vivo lo
confirma o lo desmiente.

### 7. `npx tsc --noEmit` en rojo por directorios duplicados en `node_modules` del checkout principal

**Encontrado en:** plan 03-10, al correr la puerta de fase.

**Qué pasa.** `tsc` devuelve 1 con **nueve** errores `TS2688`, todos de la misma forma:

```
error TS2688: Cannot find type definition file for 'chai 2'.
error TS2688: Cannot find type definition file for 'node 3'.
error TS2688: Cannot find type definition file for 'react 3'.
```

El checkout principal tiene `node_modules/@types/` con cada paquete **duplicado con un sufijo
numérico**: `chai` y `chai 2`, `node` y `node 3`, `react` y `react 3`, y así los nueve. Es el patrón
de renombrado que dejan los servicios de sincronización de archivos (iCloud Drive y similares)
cuando resuelven un conflicto. `tsc` recorre los `typeRoots` **hacia arriba** en el árbol de
directorios, así que un worktree con su `node_modules` recién instalado y limpio los hereda igual.

**Por qué no lo causa este plan, medido.** Los nueve errores son idénticos y en el mismo número
corriendo `npx tsc --noEmit` en el checkout principal, sin ningún cambio de este plan. **Cero
errores en código del proyecto:** los nueve son `TS2688` sobre bibliotecas de tipos implícitas, no
sobre archivos fuente.

**Impacto.** La puerta `tsc --noEmit` queda en rojo en esta máquina. No afecta a `test:unit`,
`test:integration`, `db:test`, `ci:arch` ni `build`. En CI no aparece, porque ahí `node_modules` sale
de un `npm ci` limpio sobre una ruta que no está sincronizada.

**Forma de cierre.** Borrar los directorios duplicados del checkout principal y reinstalar:

```sh
rm -rf /Users/juanortega/Documents/VivaGuest/node_modules && npm ci
```

**No se ejecuta desde aquí:** es `node_modules` de la máquina del usuario, está fuera del repositorio
y borrar directorios ajenos al worktree es exactamente lo que la frontera de alcance del ejecutor
prohíbe. **Dueño:** el usuario. Y la salida duradera es sacar el proyecto de la carpeta sincronizada,
o excluir `node_modules` de la sincronización.
