import styles from './VerdictChip.module.css';

// Veredicto de categoría: SIEMPRE uno de estos tres textos, nunca un número
// (ver CLAUDE.md — el bug real que originó esa regla). SIN_VEREDICTO ocurre
// cuando las 3 preguntas de la categoría resultaron n/a; no aprueba ni
// rechaza, y normalmente viene acompañado de requiere_revision=true.
export type Veredicto = 'SI' | 'NO' | 'SIN_VEREDICTO';

const ETIQUETA: Record<Veredicto, string> = {
  SI: 'SI',
  NO: 'NO',
  SIN_VEREDICTO: 'Sin veredicto',
};

const CLASE: Record<Veredicto, string> = {
  SI: styles.si,
  NO: styles.no,
  SIN_VEREDICTO: styles.sinVeredicto,
};

export function VerdictChip({ veredicto }: { veredicto: Veredicto }) {
  return <span className={`${styles.chip} ${CLASE[veredicto]}`}>{ETIQUETA[veredicto]}</span>;
}
