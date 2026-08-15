#!/usr/bin/env python3
"""
Crea y mantiene la estructura de carpetas full stack.

Uso:
    python estructura.py crear    [--raiz .] [--manifiesto estructura.yaml]
    python estructura.py revisar  [--raiz .] [--manifiesto estructura.yaml]

crear   -> crea las carpetas que falten y sincroniza marcadores
revisar -> no crea carpetas nuevas, solo sincroniza marcadores y reporta

Ambos comandos regeneran ESTRUCTURA.md, que es el mapa visual del proyecto.
El comando es idempotente: correrlo dos veces no cambia nada.
"""

import argparse
import os
import re
import sys
from pathlib import Path

MARCADOR = "_VACIA.md"

PLANTILLA_MARCADOR = """# Carpeta vacía — pendiente

**Para:** {para}

Esta carpeta forma parte de la estructura full stack del proyecto y se deja
creada a propósito, aunque todavía no tenga contenido.

Este archivo cumple dos funciones:

1. Hace visible en el explorador que la carpeta sigue pendiente.
2. Mantiene la carpeta en Git, que por defecto no versiona carpetas vacías.

Al agregar el primer archivo real, correr `python scripts/estructura.py revisar`
y este marcador se elimina solo.
"""

# Archivos que no cuentan como "contenido real" al decidir si una carpeta está vacía.
IGNORAR = {MARCADOR, ".gitkeep", ".DS_Store", "Thumbs.db"}


def cargar_manifiesto(ruta):
    """Lee el YAML sin depender de PyYAML: el formato es plano y conocido."""
    if not ruta.exists():
        sys.exit(f"No se encuentra el manifiesto: {ruta}")

    proyecto = "Proyecto"
    carpetas = []
    actual = None

    for linea in ruta.read_text(encoding="utf-8").splitlines():
        sin_comentario = linea.split("#", 1)[0].rstrip()
        if not sin_comentario.strip():
            continue

        m = re.match(r"^proyecto:\s*(.+)$", sin_comentario)
        if m:
            proyecto = m.group(1).strip()
            continue

        m = re.match(r"^\s*-\s*ruta:\s*(.+)$", sin_comentario)
        if m:
            actual = {"ruta": m.group(1).strip(), "para": ""}
            carpetas.append(actual)
            continue

        m = re.match(r"^\s+para:\s*(.+)$", sin_comentario)
        if m and actual is not None:
            actual["para"] = m.group(1).strip()

    if not carpetas:
        sys.exit(f"El manifiesto no define carpetas: {ruta}")

    return proyecto, carpetas


def tiene_contenido(carpeta):
    """Una carpeta cuenta como llena si tiene algún archivo o subcarpeta propia."""
    if not carpeta.is_dir():
        return False
    for hijo in carpeta.iterdir():
        if hijo.name in IGNORAR:
            continue
        if hijo.is_dir():
            # Una subcarpeta que solo contiene marcadores no llena a la madre.
            if tiene_contenido(hijo):
                return True
            continue
        return True
    return False


def sincronizar(raiz, carpetas, crear_faltantes):
    """Pone el marcador en las carpetas vacías y lo quita de las que se llenaron."""
    resultado = []
    for entrada in carpetas:
        destino = raiz / entrada["ruta"]

        if not destino.exists():
            if crear_faltantes:
                destino.mkdir(parents=True, exist_ok=True)
                estado_previo = "creada"
            else:
                resultado.append((entrada, "ausente"))
                continue
        else:
            estado_previo = "existente"

        marcador = destino / MARCADOR
        llena = tiene_contenido(destino)

        if llena and marcador.exists():
            marcador.unlink()
            estado = "llena"
        elif llena:
            estado = "llena"
        else:
            if not marcador.exists():
                marcador.write_text(
                    PLANTILLA_MARCADOR.format(para=entrada["para"] or "sin descripción"),
                    encoding="utf-8",
                )
            estado = "vacia"

        resultado.append((entrada, estado if estado_previo != "creada" else estado))
    return resultado


def escribir_mapa(raiz, proyecto, resultado):
    """Genera ESTRUCTURA.md: el mapa de qué está hecho y qué falta."""
    llenas = sum(1 for _, e in resultado if e == "llena")
    total = len(resultado)

    lineas = [
        f"# Estructura del proyecto — {proyecto}",
        "",
        f"**Avance:** {llenas} de {total} carpetas con contenido.",
        "",
        "Generado por `scripts/estructura.py`. No editar a mano: se sobrescribe.",
        "",
        "| | Carpeta | Para |",
        "|---|---|---|",
    ]

    simbolo = {"llena": "✅", "vacia": "⬜", "ausente": "❌"}
    for entrada, estado in resultado:
        lineas.append(
            f"| {simbolo[estado]} | `{entrada['ruta']}/` | {entrada['para']} |"
        )

    lineas += [
        "",
        "✅ con contenido · ⬜ vacía, pendiente · ❌ no existe en disco",
        "",
        "Las carpetas vacías se dejan a propósito: sostienen la estructura completa",
        f"del full stack. Cada una lleva un `{MARCADOR}` que la mantiene visible en el",
        "explorador y versionada en Git. El marcador desaparece solo al agregar el",
        "primer archivo real y volver a correr el script.",
        "",
    ]

    (raiz / "ESTRUCTURA.md").write_text("\n".join(lineas), encoding="utf-8")


CLAUDE_MD_INICIAL = """# CLAUDE.md

@STACK.md
<!-- Import del stack tecnológico estándar. Ruta relativa a propósito:
     STACK.md vive en la raíz de ESTE repo, así el equipo lo recibe
     automáticamente al clonar. -->

## Overview
(completar: qué hace este proyecto, en 2-3 líneas)

## Flujo / arquitectura
(completar: cómo se conectan las piezas de este proyecto en particular)

## Reglas de negocio clave
(completar: lo que es único de este proyecto, no del stack general)

## Pendiente / en decisión
(completar)
"""


def bootstrap_stack_y_claude(raiz):
    """Copia el STACK.md maestro (bundleado en el skill) y arma un CLAUDE.md
    inicial en la raíz del proyecto, si todavía no existen. No sobreescribe
    archivos que el proyecto ya tenga — solo completa lo que falta."""
    skill_dir = Path(__file__).resolve().parent.parent
    stack_maestro = skill_dir / "STACK.md"
    resultado = []

    destino_stack = raiz / "STACK.md"
    if destino_stack.exists():
        resultado.append(("STACK.md", "ya existía, no se tocó"))
    elif stack_maestro.exists():
        destino_stack.write_text(stack_maestro.read_text(encoding="utf-8"), encoding="utf-8")
        resultado.append(("STACK.md", "copiado desde el skill"))
    else:
        resultado.append(("STACK.md", "no encontrado en el skill — omitido"))

    destino_claude = raiz / "CLAUDE.md"
    if destino_claude.exists():
        resultado.append(("CLAUDE.md", "ya existía, no se tocó"))
    else:
        destino_claude.write_text(CLAUDE_MD_INICIAL, encoding="utf-8")
        resultado.append(("CLAUDE.md", "creado con el import de STACK.md"))

    return resultado


def main():
    p = argparse.ArgumentParser(description="Estructura full stack con marcado de carpetas vacías")
    p.add_argument("comando", choices=["crear", "revisar"])
    p.add_argument("--raiz", default=".", help="Raíz del proyecto (default: .)")
    p.add_argument("--manifiesto", default=None, help="Ruta al estructura.yaml")
    args = p.parse_args()

    raiz = Path(args.raiz).resolve()
    manifiesto = (
        Path(args.manifiesto).resolve()
        if args.manifiesto
        else Path(__file__).resolve().parent.parent / "estructura.yaml"
    )

    proyecto, carpetas = cargar_manifiesto(manifiesto)

    if args.comando == "crear":
        bootstrap = bootstrap_stack_y_claude(raiz)
        print("Stack y contexto del proyecto:")
        for archivo, estado in bootstrap:
            print(f"  {archivo}: {estado}")
        print()

    resultado = sincronizar(raiz, carpetas, crear_faltantes=(args.comando == "crear"))
    escribir_mapa(raiz, proyecto, resultado)

    llenas = [e["ruta"] for e, s in resultado if s == "llena"]
    vacias = [e["ruta"] for e, s in resultado if s == "vacia"]
    ausentes = [e["ruta"] for e, s in resultado if s == "ausente"]

    print(f"{proyecto} — {len(llenas)} de {len(resultado)} carpetas con contenido\n")
    if llenas:
        print("Con contenido:")
        for r in llenas:
            print(f"  ✅ {r}/")
    if vacias:
        print("\nVacías (marcador puesto):")
        for r in vacias:
            print(f"  ⬜ {r}/")
    if ausentes:
        print("\nNo existen en disco (correr `crear` para generarlas):")
        for r in ausentes:
            print(f"  ❌ {r}/")
    print("\nMapa actualizado en ESTRUCTURA.md")


if __name__ == "__main__":
    main()
