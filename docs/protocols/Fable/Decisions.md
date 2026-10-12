# Protocolo de Decisiones de Diseño

Este documento define cómo decidir cuando una orden admite **más de una
implementación razonable** en **Higgs Icons**: dónde vive una regla (generador,
módulo web, C++ generado), si un dato nuevo es un campo del manifiesto o un
override, cómo se nombra un ID o un grupo, si un cambio es compatible o rompiente.

---

## 1. Cuándo Aplica

A toda decisión en la que dos implementadores competentes podrían elegir caminos
distintos. Las decisiones que el precedente del código ya resuelve no requieren
este procedimiento: se sigue el precedente.

---

## 2. Jerarquía de Criterios

Por este orden estricto; un criterio inferior nunca vence a uno superior.

1. **Corrección, seguridad y derechos.** Se descarta toda opción que deje un caso
   límite roto, que genere C++ o HTML inválido a partir de datos, que filtre rutas
   de la máquina a las salidas, o que dependa de iconos sin procedencia
   ([Security.md](Security.md)).
2. **Estabilidad de los contratos.** Los IDs canónicos, el manifiesto, la API web,
   la API C++ y la función CMake los usan aplicaciones fuera de este repositorio.
   Gana la opción que no los rompe.
3. **Consistencia con el código existente** y paridad web/C++. El patrón que ya
   existe gana sobre el "teóricamente mejor".
4. **Diff mínimo completo y reversibilidad.** Un campo nuevo opcional es
   preferible a cambiar el significado de uno existente.
5. **Simplicidad presente (YAGNI)** y **cero dependencias**: el generador y el
   módulo web no usan paquetes de npm.
6. **Rendimiento, con evidencia** (tiempo de generación, tamaño de
   `manifest.json` o de `icons.cpp`, carga del catálogo), solo si se midió.

---

## 3. Procedimiento

1. **Enumera al menos dos opciones reales.**
2. **Evalúalas contra el §2** (dos líneas por opción bastan).
3. **Decide y ejecuta** completa la opción elegida.
4. **Registra la justificación** en el changelog y en el reporte.

---

## 4. Decisiones que No le Pertenecen al Agente

Se presentan al usuario con una recomendación concreta:

1. **Cambios rompientes de contratos:** renombrar o quitar IDs, cambiar la forma
   del manifiesto (y `schemaVersion`), cambiar firmas de la API web o C++, o la
   función `higgs_icons_copy_assets`.
2. **Criterios de producto:** nombres y descripciones curados de los iconos, a qué
   productos (`products`) pertenece cada uno, cómo se agrupan.
3. **Procedencia y publicación:** incorporar un grupo de iconos, decidir que un
   grupo es redistribuible, elegir licencia, publicar el repositorio, `dist/` o
   GitHub Pages ([RIGHTS-AND-PUBLISHING.md](../../../RIGHTS-AND-PUBLISHING.md)).
4. **Dependencias nuevas** (paquetes de npm, herramientas de compilación).
5. **Eliminación de iconos o funcionalidad** que la orden no pidió eliminar.
6. **Saltos de versión menor o mayor** ([Releases.md](../Releases.md)).

Todo lo demás se decide de forma autónoma, se ejecuta y se declara en el reporte.

---

## 5. Reglas de Diseño Permanentes

1. **Aburrido gana a ingenioso.**
2. **Regla de tres para abstracciones.**
3. **Los nombres son diseño:** un concepto tiene el mismo nombre en el
   manifiesto, el módulo web, el C++ (en `snake_case`) y la documentación
   (`legacyName` ↔ `legacy_name`).
4. **Deuda técnica solo deliberada,** declarada en el changelog.
5. **Los datos mandan:** el inventario y `metadata/ids.json` son la fuente de
   verdad; las salidas se derivan de ellos y nunca al revés.

---

## 6. Anti-patrones Prohibidos

| Anti-patrón                                             | Conducta correcta                                   |
|---------------------------------------------------------|------------------------------------------------------|
| Implementar la primera idea sin alternativas            | Al menos dos opciones evaluadas (§3.1)               |
| Romper un contrato en silencio                          | Presentarlo al usuario con recomendación (§4.1)      |
| Regla distinta en web y en C++                          | Paridad (§2.3)                                       |
| Añadir una dependencia de npm sin aprobación            | Cero dependencias salvo aprobación (§2.5, §4.4)      |
| Abstracción o parámetro "por si acaso"                  | YAGNI y regla de tres (§2.5, §5.2)                   |
| Decisión de peso sin justificación registrada           | Párrafo en changelog y reporte (§3.4)                |
