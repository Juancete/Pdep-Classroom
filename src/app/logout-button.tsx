"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Props {
  username: string;
  image: string;
  isAdmin?: boolean;
}

export function UserMenu({ username, image, isAdmin = false }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
        className="flex items-center gap-2 cursor-pointer"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="w-7 h-7 rounded-full" />
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
              className="block px-4 py-2 text-sm text-pdep-200 hover:text-white hover:bg-pdep-700 transition-colors"
            >
              Editar perfil
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
