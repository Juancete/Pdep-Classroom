"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Props {
  username: string;
  image: string;
  isAdmin?: boolean;
  hasPendingSync?: boolean;
  unreadErrors?: number;
}

export function UserMenu({
  username,
  image,
  isAdmin = false,
  hasPendingSync = false,
  unreadErrors = 0,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
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
        onClick={() => setOpen((previous) => !previous)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="w-7 h-7 rounded-full" />
        {hasPendingSync && (
          <span
            className="absolute -top-0.5 left-5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-pdep-900"
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
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 bg-pdep-800 border border-pdep-700 rounded-lg shadow-lg py-1 min-w-[160px]"
        >
          {!isAdmin && (
            <Link
              href="/perfil"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-pdep-200 hover:text-white hover:bg-pdep-700 transition-colors"
            >
              <span>
                Editar perfil
                {hasPendingSync && (
                  <span className="sr-only">, acción pendiente</span>
                )}
              </span>
              {hasPendingSync && (
                <span
                  className="text-xs font-semibold text-amber-300"
                  aria-hidden="true"
                >
                  !
                </span>
              )}
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/errores"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-pdep-200 hover:text-white hover:bg-pdep-700 transition-colors"
            >
              <span>Errores</span>
              {unreadErrors > 0 && (
                <span
                  className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                  aria-label={`${unreadErrors} sin leer`}
                >
                  {unreadErrors > 99 ? "99+" : unreadErrors}
                </span>
              )}
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full text-left px-4 py-2 text-sm text-pdep-200 hover:text-white hover:bg-pdep-700 transition-colors"
          >
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
