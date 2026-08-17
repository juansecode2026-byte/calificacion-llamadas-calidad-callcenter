-- Migración 013: retirar la columna obsoleta asesores.nombre
--
-- La 002 dejó "nombre" en su lugar a propósito, para no perder datos si algo
-- todavía la referenciaba. Ya no la referencia nada: no hay FKs sobre ella y
-- backend/ y frontend/ siguen sin construirse.
--
-- Mientras siga siendo NOT NULL, dar de alta un asesor obliga a llenar tres
-- campos para dos datos —"nombre" además de "nombres" y "apellidos"—, y el
-- formulario de carga arrastraría esa redundancia. Detectado al probar un
-- insert real contra la base.
--
-- Se retira ahora porque la tabla está vacía: más adelante implicaría migrar
-- datos y decidir cómo partir cada "nombre" en sus dos mitades, que es
-- justamente lo que la 002 no pudo hacer de forma confiable.

alter table asesores drop column nombre;

-- nombres y apellidos pasan a ser obligatorios: son la identidad del asesor
-- que el formulario de carga muestra para confirmar visualmente antes de
-- subir el audio (CLAUDE.md, paso 1 del pipeline).
alter table asesores
  alter column nombres set not null,
  alter column apellidos set not null;

-- area_id queda nullable a propósito: permite dar de alta un asesor antes de
-- que las áreas estén cargadas. Si el negocio confirma que ningún asesor
-- puede existir sin área, se ajusta en una migración aparte.
