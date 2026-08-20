import type { ReactNode } from 'react';
import styles from './KpiTile.module.css';

interface KpiTileProps {
  label: string;
  value: ReactNode;
  accent?: boolean;
  delta?: { texto: string; direccion: 'up' | 'down' | 'neutral' };
}

export function KpiTile({ label, value, accent, delta }: KpiTileProps) {
  return (
    <div className={styles.tile}>
      <div className={styles.label}>{label}</div>
      <div className={`${styles.value} ${accent ? styles.accent : ''}`}>{value}</div>
      {delta && <div className={`${styles.delta} ${styles[delta.direccion]}`}>{delta.texto}</div>}
    </div>
  );
}
