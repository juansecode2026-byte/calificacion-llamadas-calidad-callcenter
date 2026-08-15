-- Migración 009: vincular evaluadores con Supabase Auth
--
-- Prerrequisito de las políticas RLS (ver db/policies/): sin este vínculo,
-- RLS no tiene forma de saber si el usuario logueado (auth.uid()) es
-- personal de calidad. Los asesores no tienen login todavía (confirmado en
-- sesión) — por eso solo evaluadores gana esta columna, no asesores.

alter table evaluadores
  add column auth_user_id uuid references auth.users(id),
  add constraint evaluadores_auth_user_id_unique unique (auth_user_id);

comment on column evaluadores.auth_user_id is
  'Usuario de Supabase Auth correspondiente a este evaluador. Null hasta que se le crea el login — un evaluador sembrado a mano (ej. seed data) puede no tener cuenta todavía.';

-- No se retira ninguna columna existente ni se backfillea auth_user_id acá:
-- crear la cuenta de cada evaluador real es un paso manual/de onboarding,
-- fuera del alcance de esta migración.
