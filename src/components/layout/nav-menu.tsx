"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ItemDeCuenta } from "@/domain/entities";
import { ItemsDeCuenta } from "./items-de-cuenta";
import { UserMenu } from "./logout-button";
import { useErrorLogCount } from "./use-error-log-count";

export interface NavLink {
  href: string;
  label: string;
}

interface Props {
  links: NavLink[];
  username: string;
  image: string;
  itemsDeCuenta: ItemDeCuenta[];
  // Sólo para decidir si se consulta el contador de errores sin leer.
  isAdmin: boolean;
  hasPendingSync?: boolean;
}

export function NavMenu({
  links,
  username,
  image,
  itemsDeCuenta,
  isAdmin,
  hasPendingSync = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const unreadErrors = useErrorLogCount(isAdmin);

  function cerrarDrawer() {
    dialogRef.current?.close();
  }

  return (
    <>
      <div className="hidden md:flex items-center gap-6 text-sm">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="hover:text-pdep-200 transition-colors"
          >
            {link.label}
          </Link>
        ))}
        <UserMenu
          username={username}
          image={image}
          itemsDeCuenta={itemsDeCuenta}
          hasPendingSync={hasPendingSync}
          unreadErrors={unreadErrors}
        />
      </div>

      <button
        type="button"
        className="md:hidden relative p-2 -mr-2 text-pdep-200 hover:text-white transition-colors"
        aria-label={[
          "Abrir menú",
          hasPendingSync ? "hay una acción pendiente en tu perfil" : null,
          unreadErrors > 0 ? `${unreadErrors} errores sin leer` : null,
        ].filter(Boolean).join(", ")}
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
          />
        </svg>
        {hasPendingSync && (
          <span
            className="absolute top-1 right-4 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-pdep-900"
            aria-hidden="true"
          />
        )}
        {unreadErrors > 0 && (
          <span
            className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-pdep-900"
            aria-hidden="true"
          />
        )}
      </button>

      {/* El <dialog> modal da foco inicial, trampa de foco, Escape, inert del
          resto de la página y restauración del foco. Los márgenes y límites
          por defecto del modal se pisan para pegarlo a la derecha, a toda
          altura. El click en el backdrop llega con target === el dialog. */}
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        aria-label="Menú de navegación"
        className="md:hidden fixed right-0 top-0 bottom-0 m-0 p-0 w-72 max-w-[85vw] h-full max-h-none bg-pdep-900 text-white shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-pdep-800">
          <span className="font-bold text-white">Menú</span>
          <button
            type="button"
            className="p-2 -mr-2 text-pdep-200 hover:text-white transition-colors"
            aria-label="Cerrar menú"
            onClick={cerrarDrawer}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 6l12 12M6 18L18 6"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3 px-4 py-4 border-b border-pdep-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="w-10 h-10 rounded-full" />
          <span className="font-mono text-sm text-pdep-200 truncate">
            {username}
          </span>
        </div>

        <nav className="flex flex-col py-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={cerrarDrawer}
              className="px-4 py-3 text-white hover:bg-pdep-800 transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <ItemsDeCuenta
            items={itemsDeCuenta}
            hasPendingSync={hasPendingSync}
            unreadErrors={unreadErrors}
            onNavegar={cerrarDrawer}
            variante="drawer"
          />
        </nav>
      </dialog>
    </>
  );
}
