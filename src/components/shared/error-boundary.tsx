"use client";

import { Component, type ReactNode } from "react";

/**
 * ErrorBoundary de cliente mínimo (spec 39, FR-007/FR-011). React 19 sigue
 * requiriendo un class component para `getDerivedStateFromError`.
 *
 * Se usa para envolver los paneles de tabs de **plata** (Caja / Rendición) que
 * leen su dato con `use(promise)`: si la promesa rechaza, mostramos un estado
 * de **error explícito y accionable**, nunca un estado vacío que se lea como
 * "no hay datos". También evita que un rechazo de una promesa consumida por una
 * pill tumbe todo el shell.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
