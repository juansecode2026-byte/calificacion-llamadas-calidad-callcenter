-- Migracion 029: 'cargada' pasa a ser el default de llamadas.estado
--
-- Segunda mitad de la 028 — va en migracion aparte porque Postgres no
-- permite usar un valor de enum en la misma transaccion en que se agrego
-- ("unsafe use of new value of enum type").
--
-- A partir de aca: la Edge Function de ingesta (backend/functions/) crea la
-- llamada sin tocar el estado y queda 'cargada'. El boton "Evaluar" del
-- dashboard hace UPDATE a 'pendiente'. El worker solo mira 'pendiente'.

alter table llamadas alter column estado set default 'cargada';

comment on column llamadas.estado is
  'Avance de la llamada en el pipeline. cargada = subida pero todavia no
  enviada a evaluar (default, ver CLAUDE.md: el disparo es manual).
  pendiente = en cola, el worker la va a tomar. transcribiendo/evaluando =
  en proceso. calificada = termino. error = fallo en algun paso.';
