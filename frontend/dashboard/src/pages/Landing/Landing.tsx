import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn } from '../../services/authService';
import { useAuthStore } from '../../stores/authStore';
import { VerdictChip } from '../../components/VerdictChip/VerdictChip';
import styles from './Landing.module.css';

// Datos ilustrativos del showcase — a propósito NO parecen nombres reales de
// asesores de un cliente real (ver revisión del 2026-08-19: el mock original
// traía nombres con pinta de datos reales de clientes en una página pública).
const SHOWCASE = [
  { llamada: 'Asesor A — Perfilado, Trabajo sobre el monto', veredicto: 'SI' as const },
  { llamada: 'Asesor B — Trabajo con objeciones', veredicto: 'NO' as const },
  { llamada: 'Asesor C — Perfilado', veredicto: 'SI' as const },
];

// TODO: dirección real de contacto comercial — placeholder hasta que el
// usuario confirme el mail que va a procesar las solicitudes de demo a mano
// (siguen siendo altas manuales de infraestructura, no self-serve).
const MAIL_DEMO = 'ventas@calidadia.example.com';

export function Landing() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setEstado('cargando');
    setErrorMsg('');
    try {
      const { user } = await signIn(correo, password);
      setUser(user);
      navigate('/panel');
    } catch (err) {
      setEstado('error');
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      return;
    }
    setEstado('idle');
  }

  return (
    <div className={styles.wrap}>
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <b>Calidad</b>IA
        </div>
        <div className={styles.navLinks}>
          <span>Producto</span>
          <span>Cómo funciona</span>
          <a href="#login" className={styles.navLogin}>
            Iniciar sesión
          </a>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.eyebrow}>Evaluación de calidad para call centers</div>
        <h1>
          Cada llamada, auditada
          <br />
          con <em>precisión absoluta</em>
        </h1>
        <p className={styles.heroSub}>
          Reemplazamos la revisión manual por un criterio consistente, respaldado por evidencia y
          verificable en cada veredicto — sin excepciones, sin desgaste.
        </p>
        <div className={styles.heroCtas}>
          <a className={styles.btnGold} href={`mailto:${MAIL_DEMO}?subject=Solicitud%20de%20demo`}>
            Solicitar una demo
          </a>
          <a className={styles.btnGhost} href="#login">
            Iniciar sesión →
          </a>
        </div>
      </section>

      <section className={styles.showcase}>
        <div className={styles.showcaseCard}>
          <div className={styles.showcaseTop}>
            <span className={styles.showcaseLabel}>Panel de calidad — ejemplo ilustrativo</span>
          </div>
          {SHOWCASE.map((fila) => (
            <div className={styles.miniRow} key={fila.llamada}>
              <span className={styles.miniName}>{fila.llamada}</span>
              <VerdictChip veredicto={fila.veredicto} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.story}>
        <div className={styles.storyGrid}>
          <div>
            <div className={styles.storyNum}>01</div>
            <h2>
              La revisión manual
              <br />
              no escala
            </h2>
            <p>
              Un evaluador humano puede revisar una fracción de las llamadas reales. El resto
              queda sin auditar — y el criterio cambia de una persona a otra.
            </p>
          </div>
          <div>
            <div className={styles.storyNum}>02</div>
            <h2>
              Un criterio,
              <br />
              siempre igual
            </h2>
            <p>
              Cada llamada se evalúa contra el mismo estándar, con evidencia citada de la
              transcripción. El veredicto lo calcula un proceso determinista.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.values}>
        <div className={styles.sectionHead}>
          <h2>Lo que no negociamos</h2>
        </div>
        <div className={styles.valuesGrid}>
          <div className={styles.valueCard}>
            <div className={styles.valueIcon}>✓</div>
            <h3>Evidencia</h3>
            <p>Ningún veredicto sin cita concreta de la llamada.</p>
          </div>
          <div className={styles.valueCard}>
            <div className={styles.valueIcon}>⟲</div>
            <h3>Determinismo</h3>
            <p>El cálculo del puntaje es siempre un proceso fijo, nunca el criterio del agente.</p>
          </div>
          <div className={styles.valueCard}>
            <div className={styles.valueIcon}>≡</div>
            <h3>Consistencia</h3>
            <p>El mismo estándar para todos los asesores, todos los días.</p>
          </div>
          <div className={styles.valueCard}>
            <div className={styles.valueIcon}>◎</div>
            <h3>Auditabilidad</h3>
            <p>Cada resultado se puede rastrear hasta su origen.</p>
          </div>
        </div>
      </section>

      <section className={styles.loginSection} id="login">
        <form className={styles.loginCard} onSubmit={handleLogin}>
          <div className={styles.eyebrow}>Acceso a clientes</div>
          <h2>Ingresá a tu panel</h2>
          <p>Si tu empresa ya trabaja con nosotros, entrá con tu correo corporativo.</p>

          <div className={styles.field}>
            <label htmlFor="correo">Correo corporativo</label>
            <input
              id="correo"
              type="email"
              placeholder="nombre@tuempresa.com"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              disabled={estado === 'cargando'}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={estado === 'cargando'}
              required
            />
          </div>

          {estado === 'error' && <div className={styles.formError}>{errorMsg}</div>}

          <button type="submit" className={styles.btnFull} disabled={estado === 'cargando'}>
            {estado === 'cargando' ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
          <div className={styles.loginFoot}>
            ¿Tu empresa todavía no es cliente?{' '}
            <a href={`mailto:${MAIL_DEMO}?subject=Solicitud%20de%20acceso`}>Solicitá acceso →</a>
          </div>
        </form>
      </section>
    </div>
  );
}
