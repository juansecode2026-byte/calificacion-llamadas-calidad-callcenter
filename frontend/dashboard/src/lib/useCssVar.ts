import { useEffect, useState } from 'react';

// Los atributos de presentación de SVG (stroke, fill, stop-color) NO
// resuelven var() de forma confiable como sí lo hace style="" — es una
// limitación real de los navegadores, no un detalle de gusto. Cuando un
// componente de Recharts (u otro SVG) necesita un color de tokens.css como
// prop de string, hay que leer el valor computado, no pasar "var(--x)" tal
// cual. Devuelve el fallback hasta que el efecto corre en el cliente.
export function useCssVar(nombre: string, fallback: string): string {
  const [valor, setValor] = useState(fallback);

  useEffect(() => {
    const computado = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
    if (computado) setValor(computado);
  }, [nombre]);

  return valor;
}
