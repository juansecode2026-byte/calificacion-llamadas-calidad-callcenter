# Caso de referencia — qué enseña sobre los criterios de evaluación

Anotación de `plantilla-lid-montos-grandes-ejemplo-real.jpeg`, la única
planilla real calificada a mano que tenemos. La imagen es la fuente; este
archivo es lo que se deduce de ella.

**Qué NO es este archivo:** no son los textos de
`parametros_calidad.criterio_evaluacion`. Esos los define el equipo de
calidad (ver migración `007_criterio_evaluacion.sql`, que deja la columna
vacía a propósito). Acá se registra la *lógica* observada en un caso real,
para que quien redacte esos textos no la tenga que redescubrir, y para
contrastar contra ella cuando lleguen.

---

## El caso, leído literal

| Categoría | Pregunta | Valor | Veredicto |
|---|---|---|---|
| Perfilado | ¿Conocemos la experiencia del cliente? | 2 | **SI** |
| Perfilado | ¿Conocemos el área de actividad del cliente? | 2 | |
| Perfilado | ¿Sabemos para qué vino el cliente? | 2 | |
| Trabajo sobre el monto | ¿Hay Up-sell con CVB desde el perfil hasta el próximo status? | 0 | **NO** |
| Trabajo sobre el monto | ¿Hay solicitud de feedback? | 0 | |
| Trabajo sobre el monto | ¿Hay venta del manager de la sucursal? | 2 | |
| Trabajo con objeciones | ¿Hay acoplamiento? | 2 | **SI** |
| Trabajo con objeciones | ¿Existe argumento en contra? | 2 | |
| Trabajo con objeciones | ¿Hay solicitud de feedback? | 2 | |

SI / NO / SI = 2 positivos de 3 → la venta **CUENTA**.

La celda de "Trabajo con objeciones" muestra `2` en vez de `SI`: es la fórmula
mal copiada de la planilla, no un veredicto válido. Ver
`db/migrations/011_veredicto_venta.sql`.

---

## Regla general — qué se está evaluando

**Se evalúa lo que dice el asesor, no lo que responde el cliente.**

El objeto de la calificación es siempre la conducta verbal del asesor: si
estaba buscando sincronizarse con lo que pide calidad. La reacción del cliente
—que evada, que responda mal, que no responda— **no penaliza**, porque no está
bajo control del asesor.

Esto vale para **todos** los parámetros, no solo para Perfilado. Aplicado a las
tres categorías:

| Parámetro | La evidencia es… | NO es… |
|---|---|---|
| ¿Conocemos la experiencia / el área / el objetivo? | que el asesor haya indagado | que el cliente tenga experiencia o la haya dado |
| ¿Hay solicitud de feedback? | que el asesor lo haya pedido | que el cliente haya dado el feedback |
| ¿Hay acoplamiento? | que el asesor lo haya buscado | que el cliente se haya acoplado |
| ¿Existe argumento en contra? | que el asesor lo haya trabajado | que el cliente se haya convencido |

**El contrapeso —ver punto 2:** que la evidencia sea la conducta del asesor no
significa que baste con emitirla. Tiene que mostrar que buscaba lo que el
parámetro persigue. Un asesor que dice palabras sin pertinencia al objetivo no
"se está sincronizando con lo que pide calidad", y no aprueba. Los dos filos de
la misma regla:

- La **reacción del cliente** no cuenta ni a favor ni en contra.
- La **pertinencia de la intervención del asesor** cuenta, y es lo que decide.

---

## Lo que el caso enseña

### 1. "¿Conocemos X?" se evalúa por la indagación del asesor

La pregunta *¿Conocemos la experiencia del cliente?* aprueba con **2**, y su
justificación dice: *"No tiene experiencia, tiene algo a largo plazo"*.

El cliente **no** tiene experiencia y la pregunta **aprueba igual**. Lo que se
califica es que **el asesor haya indagado**: la relevancia está en lo que el
asesor pregunta, no en lo que el cliente termina respondiendo. La respuesta del
cliente puede ser negativa, pobre o evasiva — eso no baja el puntaje, porque no
es el asesor quien lo controla.

**Dónde busca la evidencia el agente:** en las intervenciones del asesor, no en
los datos que aparezcan sobre el cliente. La pregunta del asesor es el hecho
evaluable; la respuesta es contexto.

Es una trampa directa: leer *"no tiene experiencia"* como incumplimiento
invierte el criterio. Aplica a las tres preguntas de Perfilado.

> **Borde:** si el dato aparece porque el cliente lo menciona espontáneamente y
> el asesor nunca indaga, **no cuenta** — no hubo conducta del asesor que
> evaluar. Se sigue directo de la regla general. Queda anotado como derivación,
> no como caso observado: en la planilla de referencia no se dio.

### 2. La acción mecánica no basta — tiene que estar anclada a lo que el cliente pidió

*¿Hay Up-sell con CVB desde el perfil hasta el próximo status?* → **0**, y sin
embargo la justificación **reconoce que el up-sell ocurrió y que se hizo desde
el perfil**:

> "cliente dice que arrancaría con 5k y se le mencionaban otros montos, se le
> ofrece un portafolio de acciones con un depo de 10k a 50k. **está correcto
> pero él preguntó por otra cosa muy distinta**, no por acciones, él preguntó
> por IA Y COPIADOS, también por EDUCACIÓN, Y LO HIZO DESDE EL PERFIL."

Reprueba porque el producto ofrecido no correspondía al interés declarado por
el cliente. El criterio no es *¿hubo up-sell?* sino *¿el up-sell fue pertinente
al interés que el cliente manifestó?*.

Un agente que solo busque evidencia de que la acción existió va a dar 2 acá.

### 3. Misma pregunta, distinta categoría, distinto criterio, distinto resultado

*¿Hay solicitud de feedback?* está en **dos** categorías, y en este caso da
resultados opuestos:

- **Trabajo sobre el monto → 0.** El feedback esperado es sobre la propuesta
  económica. La justificación describe lo que faltó: *"¿qué te parece esa
  propuesta? ¿ese monto de 10k es fácil para ti?"*.
- **Trabajo con objeciones → 2.** Aprueba con *"dice que asistirá a la reunión
  con el manager de 2 venta"* — el feedback acá es la confirmación de
  compromiso después de resolver la objeción.

El texto de la pregunta no identifica su criterio; la categoría sí. Cuando se
redacten los `criterio_evaluacion`, **estos dos tienen que quedar escritos
distinto**, o el agente va a aplicar el mismo estándar a los dos.

Del lado técnico ya está cubierto: el agente recibe y devuelve `parametro_id`
(el UUID de la fila), no el texto de la pregunta — ver
`backend/agent/output_schema.json`. El seed las siembra como filas separadas
por `categoria_id` + `orden` (`db/000_schema_inicial.sql`). No hay colisión posible.

### 4. Ojo con imitar el estilo de las justificaciones humanas

En las dos preguntas que dieron 0, el evaluador humano escribió **lo que
faltó**, en modo prescriptivo, no lo que pasó.

El agente no debe hacer eso: su `justificacion` tiene que ser evidencia
concreta de la transcripción. Esta captura sirve para entender el criterio,
**no** como muestra del estilo de redacción esperado.

### 5. `n/a` no aparece en este caso, y está bien

*¿Existe argumento en contra?* —la pregunta que `CLAUDE.md` usa justamente como
ejemplo de cuándo corresponde `n/a`— acá dio **2**, con la justificación *"se le
responden todas las preguntas"*. Hubo intercambio, así que se evalúa normal.

Confirma que `n/a` queda reservado a la ausencia estructural de la situación, y
que no tiene frecuencia esperada: puede no aparecer nunca.

---

## Pendiente

Falta una **segunda planilla de ejemplo** que se mencionó en sesión pero nunca
se guardó en el repo. Serviría sobre todo para contrastar los puntos 2 y 3, que
salen de un solo caso cada uno.
