import styles from './CategoryBar.module.css';

interface CategoryBarProps {
  nombre: string;
  // Porcentaje agregado del período, calculado SOLO sobre calificaciones
  // que tuvieron veredicto SI/NO en esta categoría — igual que una pregunta
  // en n/a se excluye del denominador de una categoría (migración 008), una
  // calificación en SIN_VEREDICTO se excluye del promedio agregado.
  porcentaje: number;
  detalle: string;
  // Cuántas calificaciones de este período quedaron SIN_VEREDICTO en esta
  // categoría (sus 3 preguntas resultaron n/a) — no entran en el % de
  // arriba, pero cada una marca requiere_revision=true y hay que poder
  // verlas. Es inusual pero posible (ver docs/caso-de-referencia-criterios.md).
  sinVeredictoCount?: number;
}

export function CategoryBar({ nombre, porcentaje, detalle, sinVeredictoCount }: CategoryBarProps) {
  return (
    <div className={styles.row}>
      <div className={styles.top}>
        <span className={styles.nombre}>{nombre}</span>
        <span className={styles.valor}>{detalle}</span>
      </div>
      <div className={styles.bar}>
        <span className={styles.fill} style={{ width: `${porcentaje}%` }} />
      </div>
      {!!sinVeredictoCount && (
        <div className={styles.revisionNote}>
          {sinVeredictoCount} {sinVeredictoCount === 1 ? 'calificación' : 'calificaciones'} sin
          veredicto en esta categoría — requiere revisión
        </div>
      )}
    </div>
  );
}
