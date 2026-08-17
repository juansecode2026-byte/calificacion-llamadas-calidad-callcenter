-- Migración 011: veredicto final de la venta
--
-- Regla de negocio (confirmada por el usuario, 2026-08-17): los "3
-- indicadores" son las 3 categorías de la plantilla —Perfilado, Trabajo
-- sobre el monto, Trabajo con objeciones—. Si al menos **2 de 3** dan
-- veredicto 'SI', la venta se le tiene en cuenta al asesor.
--
-- Ver docs/plantilla-lid-montos-grandes-ejemplo-real.jpeg: caso real con
-- SI / NO / SI = 2 positivos = la venta cuenta.
--
-- El umbral es absoluto, no proporcional: hacen falta 2 'SI', sin importar
-- cuántas categorías hayan resultado aplicables. Una categoría en
-- SIN_VEREDICTO (todas sus preguntas n/a, ver migración 008) simplemente no
-- suma —pero marca la calificación para revisión.
--
-- Sobre el n/a: no tiene frecuencia esperada. No hay cuota ni "debería
-- aparecer cada tanto" — se usa si y solo si la situación que evalúa la
-- pregunta no se dio en esa llamada, según los parámetros. Puede no
-- aparecer nunca. Que las 3 preguntas de una categoría no apliquen es
-- posible pero inusual, y por eso amerita una mirada humana.

alter table calificaciones
  add column veredicto_venta text
    check (veredicto_venta in ('CUENTA', 'NO_CUENTA')),
  add column requiere_revision boolean not null default false;

comment on column calificaciones.veredicto_venta is
  'CUENTA / NO_CUENTA — siempre texto, nunca un número ni un booleano crudo. Mismo criterio que el veredicto de categoría: el tipo de dato restringido desde el diseño hace imposible el error de arrastrar un puntaje a la celda de resultado. Null mientras la calificación no esté cerrada.';

comment on column calificaciones.requiere_revision is
  'true cuando alguna categoría quedó en SIN_VEREDICTO. No cambia el veredicto de la venta —solo señala que un humano debería mirar esa llamada. El n/a no tiene frecuencia esperada (se usa solo si la situación no se dio), pero que las 3 preguntas de una categoría no apliquen es inusual.';

-- =========================================================
-- Cálculo del veredicto de venta
-- =========================================================
-- Determinista y en la base, nunca en el agente (CLAUDE.md, Restricciones).
-- Lee de calificacion_categoria_resultado, que ya tiene el veredicto por
-- categoría calculado por calcular_veredicto_categoria().

create or replace function calcular_veredicto_venta(p_calificacion_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_categorias_si integer;
begin
  select count(*) into v_categorias_si
  from calificacion_categoria_resultado
  where calificacion_id = p_calificacion_id
    and veredicto = 'SI';

  if v_categorias_si >= 2 then
    return 'CUENTA';
  else
    return 'NO_CUENTA';
  end if;
end;
$$;

comment on function calcular_veredicto_venta(uuid) is
  'Veredicto final: CUENTA si al menos 2 categorías dieron SI. Umbral absoluto (2), no proporcional. Si alguna empresa cliente necesitara otro umbral, va como columna en configuracion_empresa —hoy no hace falta, las 5 empresas usan la misma regla.';

-- =========================================================
-- ¿Hay alguna categoría sin veredicto?
-- =========================================================

create or replace function calificacion_requiere_revision(p_calificacion_id uuid)
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select exists (
    select 1 from calificacion_categoria_resultado
    where calificacion_id = p_calificacion_id
      and veredicto = 'SIN_VEREDICTO'
  );
$$;
