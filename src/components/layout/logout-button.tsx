"use client";

import { useState } from "react";
import type { ItemDeCuenta } from "@/domain/entities";
import { ItemsDeCuenta } from "./items-de-cuenta";

interface Props {
  username: string;
  image: string;
  itemsDeCuenta: ItemDeCuenta[];
  hasPendingSync?: boolean;
  unreadErrors?: number;
}

export function UserMenu({
  username,
  image,
  itemsDeCuenta,
  hasPendingSync = false,
  unreadErrors = 0,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        className="relative flex items-center gap-2 cursor-pointer"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={[
          username,
          hasPendingSync ? "hay una acción pendiente en tu perfil" : null,
          unreadErrors > 0 ? `${unreadErrors} errores sin leer` : null,
        ].filter(Boolean).join(", ")}
        onClick={(event) => {
          // Safari y Firefox en macOS no enfocan un botón al clickearlo, y el
          // Escape se escucha en el contenedor, que sólo recibe la tecla si el
          // foco está adentro.
          event.currentTarget.focus();
          setOpen((previous) => !previous);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="w-7 h-7 rounded-full" />
        {hasPendingSync && (
          <span
            className="absolute -top-0.5 left-8 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-pdep-900"
            aria-hidden="true"
          />
        )}
        {unreadErrors > 0 && (
          <span
            className="absolute -top-0.5 left-5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-pdep-900"
            aria-hidden="true"
          />
        )}
        <span className="font-mono text-xs text-pdep-200">{username}</span>
      </button>

      {open && (
        <>
          {/* Overlay declarativo: un click afuera del menú cae acá y lo cierra. */}
          <div
            data-testid="cerrar-menu"
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute z-50 right-0 top-full mt-2 bg-pdep-800 border border-pdep-700 rounded-lg shadow-lg py-1 min-w-[160px]"
          >
            <ItemsDeCuenta
              items={itemsDeCuenta}
              hasPendingSync={hasPendingSync}
              unreadErrors={unreadErrors}
              onNavegar={() => setOpen(false)}
              variante="menu"
            />
          </div>
        </>
      )}
    </div>
  );
}
