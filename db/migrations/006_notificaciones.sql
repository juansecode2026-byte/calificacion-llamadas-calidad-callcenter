-- Migración 006: configuración y registro de notificaciones al asesor
--
-- Paso 5 del pipeline. El canal es configurable por empresa (cada cliente
-- puede notificar distinto — email es el ejemplo de hoy, puede cambiar).

-- Tabla singleton: como cada proyecto Supabase es de una sola empresa, esta
-- tabla nunca debe tener más de una fila. El truco de primary key booleana
-- (siempre "true") lo garantiza a nivel de constraint, no de convención.
create table configuracion_empresa (
  singleton boolean primary key default true check (singleton),
  nombre_comercial text not null,
  canal_notificacion text not null default 'email' check (canal_notificacion in ('email', 'whatsapp', 'chat')),
  plantilla_mensaje text
);

-- No se siembra automáticamente: nombre_comercial y canal son específicos de
-- cada cliente. Insertar a mano tras crear el proyecto, ej.:
--   insert into configuracion_empresa (nombre_comercial, canal_notificacion)
--   values ('Nombre del cliente', 'email');

create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  calificacion_id uuid references calificaciones(id) not null,
  canal text not null,
  destinatario text not null,
  estado_envio text not null default 'pendiente' check (estado_envio in ('pendiente', 'enviado', 'error')),
  fecha_envio timestamptz,
  fecha_creacion timestamptz not null default now()
);
