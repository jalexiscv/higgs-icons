# Protocolo de Seguridad, Procedencia y Publicación

Este documento define las reglas de seguridad que todo cambio debe cumplir en
**Higgs Icons**. Su superficie es pequeña pero real: el generador lee miles de
archivos y metadatos y **escribe código fuente C++** y HTML a partir de ellos; las
aplicaciones confían en las salidas; y el inventario procede de aplicaciones
heredadas cuyos derechos aún no se revisaron.

---

## 1. Principio Rector

**Ningún dato del inventario o de los metadatos puede romper ni inyectar código
en las salidas; ninguna salida filtra datos de la máquina; ningún icono entra ni
sale sin procedencia y permiso.**

---

## 2. Entradas del Generador

1. **Validación antes de emitir:** firma PNG de cada variante, tamaños únicos,
   IDs únicos, registro sincronizado con el inventario, overrides con solo las
   claves admitidas y arreglos donde se esperan arreglos. Todo dato nuevo que el
   generador acepte se valida igual.
2. **Sin seguir enlaces fuera del árbol:** el recorrido se limita a `Apps/`,
   `Common/` y `Engines/`; no se añaden enlaces simbólicos ni rutas que salgan de
   ellos.
3. **Las rutas de salida se derivan de los IDs normalizados**, nunca de texto
   libre de los overrides.

## 3. Salidas

1. **Código generado:** toda cadena de datos que entra a `icons.cpp` pasa por
   `cppString`; ningún dato se concatena sin escapar en C++, CMake o HTML.
2. **HTML del catálogo:** los datos se insertan con `textContent` o atributos,
   nunca con `innerHTML`.
3. **Sin datos de la máquina:** las salidas no contienen rutas absolutas, nombres
   de usuario ni fechas de generación (lo comprueba una prueba).
4. **`dist/` es desechable:** se regenera entero y está fuera de Git.

## 4. Operaciones Destructivas

1. `metadata/ids.json` y `metadata/overrides.json` son curados a mano: no se
   regeneran ni sobrescriben (`--initialize-ids` se niega a hacerlo, y así debe
   seguir).
2. Borrar iconos o grupos, `git reset --hard`, reescribir historia o sobrescribir
   archivos que no creó el agente requieren mirar antes lo que se destruye y
   confirmación del usuario, y quedan en el changelog.
3. Los temporales de las pruebas van a `os.tmpdir()` y se borran; los del agente,
   al scratchpad del entorno.

## 5. Procedencia, Derechos y Publicación

1. **Estado:** la biblioteca es material propio del autor y se puede usar y
   distribuir ([RIGHTS-AND-PUBLISHING.md](../../../RIGHTS-AND-PUBLISHING.md)).
   Quedan por cerrar la licencia, que aún no se declara, y la procedencia de cada
   grupo.
2. **Incorporar iconos** exige procedencia conocida y declarada en el changelog
   (de qué aplicación o autor vienen). No se extraen recursos de binarios de
   productos propietarios para añadirlos al inventario, ni se usan herramientas
   de ingeniería inversa para obtenerlos.
3. **Publicar** (hacer público el repositorio, subir `dist/`, activar o ampliar
   GitHub Pages, adjuntar paquetes a un release) es decisión exclusiva del autor
   y requiere la revisión de derechos completada.
4. **Iconos y textos propios:** los nombres de productos de terceros se usan solo
   para describir la procedencia.

## 6. Secretos y Datos Personales

1. Nunca se escriben credenciales ni tokens en el código, la CI, los changelogs ni
   los reportes; si aparecen, se reporta de inmediato para rotarlos.
2. Los changelogs solo llevan nombre y correo del autor.

---

## 7. Checklist de Seguridad por Cambio

1. ¿Todo dato nuevo del inventario o de los metadatos se valida antes de usarse?
2. ¿Toda cadena de datos que llega a C++, CMake o HTML está escapada?
3. ¿Las salidas siguen libres de rutas absolutas y datos de la máquina?
4. ¿No se sobrescribieron `metadata/ids.json` ni `overrides.json` por accidente,
   ni cambió ningún ID publicado?
5. ¿Todo icono incorporado tiene procedencia declarada y ninguno sale de un
   binario propietario?
6. ¿No se publicó nada sin orden del autor?
7. ¿Ningún secreto quedó en el código, la CI, el changelog o el reporte?

Un "no" bloquea la entrega igual que una prueba fallida.
