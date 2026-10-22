"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";
import type { ItemDeCuenta } from "@/domain/entities";

type Variante = "menu" | "drawer";

type EstilosDeVariante = {
  role?: "menuitem";
  enlace: string;
  salir: string;
  claseDelBadge: string;
  indicadorDeSincronizacion: ReactNode;
};

// Mismo contenido en dos contenedores (menú del avatar y drawer mobile): lo
// único que cambia es el estilo y el rol ARIA — dato, no rama de lógica.
const ESTILOS_POR_VARIANTE: Record<Variante, EstilosDeVariante> = {
  menu: {
    role: "menuitem",
    enlace:
      "flex items-center justify-between gap-3 px-4 py-2 text-sm text-pdep-200 hover:text-white hover:bg-pdep-700 transition-colors",
    salir:
      "w-full text-left px-4 py-2 text-sm text-pdep-200 hover:text-white hover:bg-pdep-700 transition-colors",
    claseDelBadge:
      "rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white",
    indicadorDeSincronizacion: (
      <span className="text-xs font-semibold text-amber-300" aria-hidden="true">
        !
      </span>
    ),
  },
  drawer: {
    enlace:
      "flex items-center justify-between gap-3 px-4 py-3 text-pdep-200 hover:bg-pdep-800 hover:text-white transition-colors",
    salir:
      "text-left px-4 py-3 text-pdep-200 hover:bg-pdep-800 hover:text-white transition-colors",
    claseDelBadge:
      "rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white",
    indicadorDeSincronizacion: (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-amber-300"
        aria-hidden="true"
      >
        <span>!</span>
        Pendiente
      </span>
    ),
  },
};

type EntradaDeAviso = {
  hasPendingSync: boolean;
  unreadErrors: number;
  estilos: EstilosDeVariante;
};

type Aviso = {
  visible: boolean;
  sufijoAccesible: ReactNode;
  indicador: ReactNode;
};

// Qué avisa cada tipo de `ItemDeCuenta.aviso` y cuándo está activo.
const AVISOS: Record<NonNullable<ItemDeCuenta["aviso"]>, (entrada: EntradaDeAviso) => Aviso> = {
  sincronizacion: ({ hasPendingSync, estilos }) => ({
    visible: hasPendingSync,
    sufijoAccesible: <span className="sr-only">, acción pendiente</span>,
    indicador: estilos.indicadorDeSincronizacion,
  }),
  errores: ({ unreadErrors, estilos }) => ({
    visible: unreadErrors > 0,
    sufijoAccesible: null,
    indicador: (
      <span className={estilos.claseDelBadge} aria-label={`${unreadErrors} sin leer`}>
        {unreadErrors > 99 ? "99+" : unreadErrors}
      </span>
    ),
  }),
};

const SIN_AVISO: Aviso = { visible: false, sufijoAccesible: null, indicador: null };

export function ItemsDeCuenta({
  items,
  hasPendingSync,
  unreadErrors,
  onNavegar,
  variante,
}: {
  items: ItemDeCuenta[];
  hasPendingSync: boolean;
  unreadErrors: number;
  onNavegar: () => void;
  variante: Variante;
}) {
  const estilos = ESTILOS_POR_VARIANTE[variante];

  return (
    <>
      {items.map((item) => {
        const aviso = item.aviso
          ? AVISOS[item.aviso]({ hasPendingSync, unreadErrors, estilos })
          : SIN_AVISO;
        return (
          <Link
            key={item.href}
            href={item.href}
            role={estilos.role}
            onClick={onNavegar}
            className={estilos.enlace}
          >
            <span>
              {item.label}
              {aviso.visible && aviso.sufijoAccesible}
            </span>
            {aviso.visible && aviso.indicador}
          </Link>
        );
      })}
      <button
        type="button"
        role={estilos.role}
        onClick={() => signOut({ callbackUrl: "/" })}
        className={estilos.salir}
      >
        Salir
      </button>
    </>
  );
}
