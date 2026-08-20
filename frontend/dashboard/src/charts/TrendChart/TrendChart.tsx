import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { useCssVar } from '../../lib/useCssVar';
import styles from './TrendChart.module.css';

export interface PuntoTendencia {
  semana: string;
  porcentajeCuenta: number;
}

// Wrapper de Recharts — CLAUDE.md/STACK.md ya definieron Recharts como la
// librería de gráficos del dashboard. El mock original (dashboard-final.html)
// dibujaba esta curva a mano con un <path> de SVG; acá se reemplaza por un
// AreaChart real para que sea mantenible (tooltips, accesibilidad, resize).
//
// Los colores se leen de tokens.css vía useCssVar(), no como var(--x) directo
// en los props de Recharts: los atributos de presentación de SVG no
// resuelven var() de forma confiable (ver lib/useCssVar.ts).
export function TrendChart({ datos }: { datos: PuntoTendencia[] }) {
  const accent = useCssVar('--color-accent', '#c9a55c');
  const accentLight = useCssVar('--color-accent-light', '#e4cfa0');

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={datos} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="tendenciaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.3} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, 100]} />
          <Area
            type="monotone"
            dataKey="porcentajeCuenta"
            stroke={accentLight}
            strokeWidth={2.5}
            fill="url(#tendenciaFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
