# Fase 10 — Rediseño del dashboard admin · Contexto y decisiones

> Decisiones tomadas por el dueño del producto el **2026-09-18**, en conversación
> directa, con referencias de Refero sobre la mesa.
>
> **Todas estas decisiones están CERRADAS. No se vuelven a preguntar.**
>
> El alcance cerrado hoy es **solo `/login`**. El resto del dashboard entra
> después, cuando el dueño lo defina pantalla por pantalla.

## D10-1 · El problema, en sus palabras

Cita literal: *"los [componentes] que veo actualmente estan espantosos"*.

Medido contra el repo, la biblioteca no es el problema: es **shadcn/ui 4.19.1
con estilo `base-nova` sobre `@base-ui/react@1.7.0`**, 26 componentes copiados en
`components/ui/`, todos editables. Lo que se ve genérico es el **tema por
defecto**: `baseColor: neutral` y los tokens sin personalizar en
`app/globals.css`.

**Consecuencia:** no se cambia de biblioteca. Se trabaja sobre los componentes
que ya están en el repo.

## D10-2 · El login es una pantalla partida, con la publicidad a la izquierda

Cita literal: *"este login debe ser de una pantalla dividida en dos en desktop
donde al lado izquierda hayan imágenes tipo carrousel porque ahí quiero vender
publicidad"*.

| Lado | Contenido |
|---|---|
| Izquierda | espacio publicitario |
| Derecha | login y sus flujos |
| Abajo, full-width | footer |

## D10-3 · La proporción es 45/45, NO 75/25

El dueño pidió de entrada *"3/4 para el espacio publicitario y 1/4 para el
login"*. Se buscaron en Refero cuatro consultas distintas sobre ~1.300 logins:
**ninguno llega a 75/25**. El techo medido del corpus es 51% (Wealthsimple).

Razón medida, no de opinión: un formulario de login necesita 360-440px para no
verse apretado. A 1280px de viewport, 25% son 320px, que es ancho de teléfono.

Presentadas las dos opciones, el dueño escogió la proporción de **GlossGenius,
invertida**: *"si gloss genius lo hace bien"*.

Referencia: https://refero.design/pages/767d341f-df17-46d2-b246-8b8771686900

**Cerrado:** publicidad 45% izquierda · login 45% derecha · footer full-width.

## D10-4 · La publicidad, hoy, es un placeholder animado entre grises

Cita literal: *"por ahora vamos a dejar la publicidad en placeholder, vamos a
mostrar que es una animación pero solo se va a ir cambiando entre varios
grises"*.

No hay imágenes reales, no hay carrusel de contenido, no hay anunciantes. Lo que
se construye es el **slot**, con una animación que demuestre que ahí algo rota.

Supuestos asumidos y aceptados por el dueño:
- cross-fade entre 4 grises
- 5 segundos por paso, 600ms de transición
- apagada cuando el sistema pide `prefers-reduced-motion`

## D10-5 · El footer, con las redes en disabled

Cita literal: *"por el lado del footer mantengamos el derechos reservado, la
fecha, y las redes en disabled teniendo solo Instagram y TikTok"*.

- `© {año dinámico} VivaGuest. Todos los derechos reservados.`
- Dos iconos: **Instagram** y **TikTok**, ambos en estado disabled
- Nada más: ni links legales, ni "acerca de", ni contacto

El año se calcula, no se escribe a mano.

## D10-6 · Debajo de 1024px el panel de publicidad desaparece

No se apila arriba, no se encoge: desaparece. Queda el login centrado tal como
está hoy.

Razón: en un teléfono, un banner encima del formulario empuja el campo de correo
fuera de la pantalla y obliga a hacer scroll para entrar.

## D10-7 · La identidad no se toca

Se conservan tal cual:
- el wordmark **VivaGuest** en Poppins (`font-brand`), en `--foreground`
- el token `--brand-identity` reservado para logo y áreas grandes, **nunca para
  texto**: da 2.64:1 contra blanco y no llega al 4.5:1 de WCAG
- `max-w-login` (400px) como medida del formulario

Esto ya está escrito en `app/(public)/login/page.tsx` y en el UI-SPEC de la
Fase 2 (§3, actualización del 2026-09-01). No se reabre.

## LO QUE QUEDA ABIERTO, Y NO BLOQUEA ESTA FASE

1. **Quién ve la publicidad.** Hoy el que entra al dashboard es el **admin**, no
   un propietario. Si la publicidad se va a vender dirigida a propietarios, el
   login es la pantalla equivocada, porque los propietarios no tienen cuenta en
   el sistema. Planteado al dueño, sin responder.
2. **El formato del slot cuando haya anunciantes reales:** relación de aspecto
   fija, conteo de impresiones, y qué se muestra cuando no hay anunciante.
3. **El resto del dashboard.** Esta fase abre con el login; las demás pantallas
   se definen después.
