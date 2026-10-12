# Protocolo de Autorrevisión Adversarial

Entre "el cambio está hecho y verificado" y "el cambio se entrega" hay una etapa
obligatoria: releer el diff completo **como un revisor hostil cuyo único trabajo
es encontrar el defecto**. La verificación demuestra que lo pedido funciona; esta
revisión busca lo que nadie pidió pero se rompió.

---

## 1. Procedimiento

1. **Momento:** después de la verificación y antes de documentar, con `git diff`
   y `git status` a la vista.
2. **Actitud:** se asume que hay al menos un defecto. La conclusión válida es
   "busqué las clases del §2 y encontré X".
3. **Cobertura:** archivo por archivo. Para cada fragmento: ¿qué inventario,
   metadato, consulta o consumidor rompe esto?
4. **Resultado:** cada defecto se corrige (volviendo a verificar); cada duda sin
   resolver se declara como riesgo en el reporte.

---

## 2. Catálogo de Clases de Defecto

### 2.1. Casos límite ★

* Inventario vacío, grupo sin iconos, directorio `.ico.png` sin variantes o con
  un solo tamaño, `overrides.json` sin `icons`.
* Consultas vacías, con espacios extra, con mayúsculas, con tildes ("Líneas",
  "Ñuñoa"); `limit` 0, negativo o no numérico; tamaño pedido 0 o enorme.
* Nombres heredados con mayúsculas seguidas (`VectorFX`), números, guiones bajos
  o caracteres fuera de ASCII; alias que coinciden con otro ID o con otro alias.

### 2.2. Ruta de error ★

* PNG con firma inválida, tamaño repetido, ID duplicado, override desconocido,
  registro desincronizado: ¿el generador se detiene con un mensaje claro que dice
  qué archivo o ID falla?
* En el navegador: manifiesto que no carga, ID inexistente (`url` y `createImage`
  devuelven `null`), portapapeles no disponible en el catálogo.

### 2.3. Contratos y paridad ★

* ¿Cambió un campo del manifiesto? ¿Lo usan igual el módulo web, el catálogo,
  `desktopSource` y las pruebas? ¿Hace falta subir `schemaVersion`?
* ¿Algún ID publicado cambió o desapareció? (`git diff metadata/ids.json`: los
  valores existentes no cambian.)
* ¿La búsqueda, la elección de tamaño y la resolución de nombres heredados siguen
  dando el mismo resultado en web y en C++?
* En lotes: ¿los N iconos quedaron con entrada en el registro, tres variantes y
  firma PNG válida?

### 2.4. Generación de código y salidas

* ¿Toda cadena de datos que entra al C++ pasa por `cppString`? ¿Y la que entra al
  HTML del catálogo usa `textContent`, nunca `innerHTML`?
* ¿Las salidas son deterministas (orden estable, sin fechas ni rutas absolutas)?
* ¿`dist/` se regenera sin restos de la generación anterior?

### 2.5. Plataformas

* ¿El C++ generado compila con MSVC (`/utf-8`) y es C++20 estándar (GCC y Clang)?
* ¿Las rutas del manifiesto usan `/` y las del disco `node:path`? ¿Mayúsculas
  que en Windows coinciden y en Linux no?
* ¿El módulo web funciona sin bundler y bajo cualquier prefijo de URL?

### 2.6. Seguridad y procedencia

* Checklist de [Security.md](Security.md) §7.

### 2.7. Residuos e intenciones

* `console.log` de depuración, archivos temporales o árboles `build/` dentro del
  proyecto, cambios en `dist/` hechos a mano.
* Cada línea del diff se justifica con la orden.

---

## 3. Profundidad Según Riesgo

| Tipo de cambio                                  | Profundidad mínima                         |
|-------------------------------------------------|--------------------------------------------|
| Documentación                                   | §2.7                                       |
| Lote de iconos o metadatos                      | §2.1, §2.3 (lotes e IDs), §2.6, §2.7       |
| Catálogo (`catalog/`, `catalogo-iconos.html`)   | §2.1, §2.2, §2.4, §2.7                     |
| Módulo web                                      | Catálogo completo, énfasis en §2.3         |
| Generador o plantillas C++/CMake                | Catálogo completo, énfasis en §2.3 y §2.4  |

---

## 4. Anti-patrones Prohibidos

| Anti-patrón                                         | Conducta correcta                             |
|-----------------------------------------------------|------------------------------------------------|
| Concluir "se ve bien" tras una relectura pasiva     | Búsqueda dirigida por clases (§1.2)            |
| Saltarse la revisión "porque el cambio es pequeño"  | Calibrar profundidad, nunca omitir (§3)        |
| Probar solo la consulta feliz                       | Casos límite y errores primero (§2.1–§2.2)     |
| Revisar la web y no el C++                          | Paridad (§2.3)                                 |
| Silenciar una duda                                  | Declararla como riesgo (§1.4)                  |
