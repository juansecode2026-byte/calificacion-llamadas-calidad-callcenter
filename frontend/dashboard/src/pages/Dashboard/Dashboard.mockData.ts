// DATOS DE EJEMPLO — no vienen de Supabase todavía.
//
// El pipeline real (backend/agent/client.ts, backend/agent/parser.ts,
// backend/worker/) no existe aún, y las tablas de la base están vacías
// (verificado 2026-08-15). Reemplazar por llamadas reales en
// src/services/ cuando el pipeline esté armado — ver DECISIONES.md,
// "Agente evaluador automático".
//
// Los nombres de asesor acá SÍ son ficticios a propósito, igual que en el
// showcase de la landing.

import type { PuntoTendencia } from '../../charts/TrendChart/TrendChart';
import type { EstadoLlamada, VeredictoVenta } from '../../components/EstadoChip/EstadoChip';

export const KPI_MOCK = {
  ventasQueCuentan: 78, // % de calificaciones con veredicto_venta = 'CUENTA'
  llamadasAuditadas: 1284,
  enProceso: 7, // estado in ('transcribiendo', 'evaluando')
  requiereRevision: 5, // requiere_revision = true
};

export const TENDENCIA_MOCK: PuntoTendencia[] = [
  { semana: 'S1', porcentajeCuenta: 58 },
  { semana: 'S2', porcentajeCuenta: 61 },
  { semana: 'S3', porcentajeCuenta: 57 },
  { semana: 'S4', porcentajeCuenta: 63 },
  { semana: 'S5', porcentajeCuenta: 68 },
  { semana: 'S6', porcentajeCuenta: 65 },
  { semana: 'S7', porcentajeCuenta: 70 },
  { semana: 'S8', porcentajeCuenta: 72 },
  { semana: 'S9', porcentajeCuenta: 69 },
  { semana: 'S10', porcentajeCuenta: 74 },
  { semana: 'S11', porcentajeCuenta: 76 },
  { semana: 'S12', porcentajeCuenta: 78 },
];

interface FilaPipeline {
  id: string;
  asesor: string;
  estado: EstadoLlamada;
  veredictoVenta?: VeredictoVenta;
  requiereRevision?: boolean;
}

export const PIPELINE_MOCK: FilaPipeline[] = [
  { id: '#1284', asesor: 'Asesor D', estado: 'evaluando' },
  { id: '#1283', asesor: 'Asesor A', estado: 'transcribiendo' },
  { id: '#1282', asesor: 'Asesor C', estado: 'pendiente' },
  { id: '#1281', asesor: 'Asesor D', estado: 'calificada', veredictoVenta: 'CUENTA' },
  { id: '#1280', asesor: 'Asesor E', estado: 'calificada', veredictoVenta: 'NO_CUENTA' },
  { id: '#1279', asesor: 'Asesor B', estado: 'calificada', requiereRevision: true },
  { id: '#1278', asesor: 'Asesor A', estado: 'error' },
];

interface FilaCategoria {
  nombre: string;
  porcentaje: number;
  detalle: string;
  // Calificaciones del período que quedaron SIN_VEREDICTO en esta categoría
  // (excluidas del % de arriba) — inusual pero posible, ver
  // docs/caso-de-referencia-criterios.md. La mayoría de meses esto es 0.
  sinVeredictoCount?: number;
}

// Refleja las 3 categorías reales de "LID de montos grandes" — no inventar
// una cuarta. "Trabajo con objeciones" trae 3 calificaciones en
// SIN_VEREDICTO de las 1284 del mes, para que el estado se vea
// representado (los mocks originales no lo contemplaban en absoluto).
export const CATEGORIAS_MOCK: FilaCategoria[] = [
  { nombre: 'Perfilado', porcentaje: 90, detalle: '1,156 / 1,284 aplicables' },
  { nombre: 'Trabajo sobre el monto', porcentaje: 65, detalle: '834 / 1,281 aplicables' },
  {
    nombre: 'Trabajo con objeciones',
    porcentaje: 85,
    detalle: '1,089 / 1,281 aplicables',
    sinVeredictoCount: 3,
  },
];

interface FilaAsesor {
  nombre: string;
  porcentajeCuenta: number;
}

export const ASESORES_DESTACADOS_MOCK: FilaAsesor[] = [
  { nombre: 'Asesor D', porcentajeCuenta: 91 },
  { nombre: 'Asesor C', porcentajeCuenta: 84 },
  { nombre: 'Asesor A', porcentajeCuenta: 72 },
];
