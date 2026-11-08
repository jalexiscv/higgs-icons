# La biblioteca queda bajo licencia privativa de EDUX FUTURO SAS

**Fecha:** 2026-11-08
**Versión:** 0.2.2
**Área:** docs
**Tiempo laborado:** 2 horas
**Autor:** Jose Alexis Correa Valencia <jalexiscv@utede.edu.co>
**Asistencia:** Agente de IA (Claude)

## Descripción

El autor decidió la licencia que `RIGHTS-AND-PUBLISHING.md` dejaba «por
decidir»: Higgs Icons es parte de productos a la venta, así que es **material
privativo de EDUX FUTURO SAS**, con el mismo contrato de licencia que Skriba
adaptado a una biblioteca: los iconos solo se usan tal como los muestran los
productos de la familia Higgs y bajo la licencia de cada producto; el acceso a
las fuentes y a `dist/` es para compilar, mantener y distribuir esos productos;
no se redistribuyen sueltos ni se usan en otras aplicaciones, sitios o
conjuntos de iconos. Identificador SPDX: `LicenseRef-EduxFuturo-Proprietary`,
el mismo que ya usan los archivos de Skriba.

Cubre por igual el código, los metadatos y las imágenes (código y archivos de
imagen tienen el mismo dueño, así que no hace falta licenciarlos aparte).

## Tipo de Cambio

- `Agregado`

## Archivos Afectados

### [NUEVO] `LICENSE`
- El contrato de licencia de la Biblioteca.

### [MODIFICADO] `RIGHTS-AND-PUBLISHING.md`, `README.md`, `docs/arquitectura.md`, `package.json`
- La sección «Licencia» deja de estar por decidir y remite a `LICENSE`; los
  términos de cada grupo de procedencia pasan a ser los de `LICENSE`; el campo
  `license` de `package.json` apunta al archivo.

## Verificación

- Revisión de los textos; `node --test` y `node tools/build.mjs` no cambian
  (no se tocan recursos ni metadatos).

## Impacto

- Quien no sea usuario de un producto Higgs no tiene derecho de uso sobre los
  iconos; los productos AGPL de la familia (Odyssey) incorporan los dibujos
  como material de terceros bajo esta licencia, no bajo la AGPL.
