import { useState, type FormEvent } from 'react';
import { KpiTile } from '../../components/KpiTile/KpiTile';
import { EstadoChip } from '../../components/EstadoChip/EstadoChip';
import { CategoryBar } from '../../components/CategoryBar/CategoryBar';
import { TrendChart } from '../../charts/TrendChart/TrendChart';
import {
  KPI_MOCK,
  TENDENCIA_MOCK,
  PIPELINE_MOCK,
  CATEGORIAS_MOCK,
  ASESORES_DESTACADOS_MOCK,
} from './Dashboard.mockData';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const [correo, setCorreo] = useState('');
  const [nombreCoincide, setNombreCoincide] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  // TODO: reemplazar por una búsqueda real contra asesores (correo
  // normalizado, ver db/migrations/019_normalizar_correo_asesor.sql) en
  // cuanto exista el servicio — hoy es solo la interacción visual.
  function handleCorreoChange(valor: string) {
    setCorreo(valor);
    setNombreCoincide(valor.includes('@') ? 'Coincidencia pendiente de conectar' : null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // TODO: llamar a la Edge Function de carga (backend/functions) — hoy no
    // hay backend que reciba esto.
    setSubiendo(true);
    setTimeout(() => setSubiendo(false), 600);
  }

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <b>Calidad</b>IA
        </div>
        <div className={styles.links}>
          <span className={styles.active}>Panel</span>
          <span>Asesores</span>
          <span>Llamadas</span>
          <span>Plantillas</span>
        </div>
        <div className={styles.right}>
          <div className={styles.badgeLive}>
            <span className={styles.dot} /> Evaluación en vivo
          </div>
        </div>
      </nav>

      <h1 className={styles.hero}>Panel de calidad</h1>
      <div className={styles.heroSub}>Resultados de evaluación automática por asesor</div>

      <form className={styles.upload} onSubmit={handleSubmit}>
        <div className={styles.uploadTitle}>Subir una llamada</div>
        <div className={styles.uploadSub}>Buscá al asesor por correo y adjuntá el audio</div>
        <div className={styles.uploadRow}>
          <div className={styles.field}>
            <label htmlFor="correo-asesor">Correo del asesor</label>
            <input
              id="correo-asesor"
              type="email"
              placeholder="correo@empresa.com"
              value={correo}
              onChange={(e) => handleCorreoChange(e.target.value)}
              required
            />
            {nombreCoincide && <div className={styles.match}>✓ {nombreCoincide}</div>}
          </div>
          <div className={styles.field}>
            <label htmlFor="archivo-audio">Archivo de audio</label>
            <label className={styles.fileBtn} htmlFor="archivo-audio">
              {archivo ? archivo.name : 'Seleccionar archivo — ningún archivo elegido'}
            </label>
            <input
              id="archivo-audio"
              type="file"
              accept="audio/*"
              className={styles.fileInput}
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              required
            />
          </div>
          <button type="submit" className={styles.submitBtn} disabled={subiendo}>
            {subiendo ? 'Subiendo…' : 'Subir llamada'}
          </button>
        </div>
      </form>

      <div className={styles.grid4}>
        <KpiTile
          label="Ventas que cuentan"
          value={`${KPI_MOCK.ventasQueCuentan}%`}
          accent
          delta={{ texto: '▲ 4.2% vs. mes anterior', direccion: 'up' }}
        />
        <KpiTile
          label="Llamadas auditadas"
          value={KPI_MOCK.llamadasAuditadas.toLocaleString('es')}
          delta={{ texto: '▲ 156 esta semana', direccion: 'up' }}
        />
        <KpiTile
          label="En proceso ahora"
          value={KPI_MOCK.enProceso}
          accent
          delta={{ texto: 'transcribiendo / evaluando', direccion: 'neutral' }}
        />
        <KpiTile
          label="Requiere revisión"
          value={KPI_MOCK.requiereRevision}
          delta={{ texto: 'categoría sin veredicto', direccion: 'neutral' }}
        />
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.stitle}>Tendencia de ventas que cuentan</div>
          <div className={styles.ssub}>últimas 12 semanas</div>
          <TrendChart datos={TENDENCIA_MOCK} />
        </div>
        <div className={styles.card}>
          <div className={styles.stitle}>Estado en tiempo real</div>
          <div className={styles.ssub}>se actualiza solo al terminar cada llamada</div>
          {PIPELINE_MOCK.map((fila) => (
            <div className={styles.pipeRow} key={fila.id}>
              <span className={styles.pipeId}>{fila.id}</span>
              <span className={styles.pipeName}>{fila.asesor}</span>
              <EstadoChip
                estado={fila.estado}
                veredictoVenta={fila.veredictoVenta}
                requiereRevision={fila.requiereRevision}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.stitle}>Puntaje por categoría</div>
          <div className={styles.ssub}>promedio del mes — plantilla "LID de montos grandes"</div>
          {CATEGORIAS_MOCK.map((cat) => (
            <CategoryBar key={cat.nombre} {...cat} />
          ))}
        </div>
        <div className={styles.card}>
          <div className={styles.stitle}>Asesores destacados</div>
          <div className={styles.ssub}>mayor % de ventas que cuentan este mes</div>
          {ASESORES_DESTACADOS_MOCK.map((asesor) => (
            <div className={styles.simpleBar} key={asesor.nombre}>
              <div className={styles.top}>
                <span>{asesor.nombre}</span>
                <span className={styles.accentText}>{asesor.porcentajeCuenta}%</span>
              </div>
              <div className={styles.bar}>
                <span className={styles.fill} style={{ width: `${asesor.porcentajeCuenta}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
