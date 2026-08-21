"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
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
  isAdmin: boolean;
  hasPendingSync?: boolean;
}

export function NavMenu({
  links,
  username,
  image,
  isAdmin,
  hasPendingSync = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const unreadErrors = useErrorLogCount(isAdmin);

  useEffect(() => {
    if (!open) return;
    const drawer = document.getElementById("mobile-drawer");
    if (!drawer) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const focusableSelector =
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusables = () =>
      Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector));

    getFocusables()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = getFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (previousActive && document.contains(previousActive)) {
        previousActive.focus();
      }
    };
  }, [open]);

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
          isAdmin={isAdmin}
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
        aria-controls="mobile-drawer"
        onClick={() => setOpen(true)}
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
            className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-pdep-900"
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

      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        inert={!open || undefined}
        className={`md:hidden fixed right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-pdep-900 z-50 shadow-xl transform transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-pdep-800">
          <span className="font-bold text-white">Menú</span>
          <button
            type="button"
            className="p-2 -mr-2 text-pdep-200 hover:text-white transition-colors"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
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
              onClick={() => setOpen(false)}
              className="px-4 py-3 text-white hover:bg-pdep-800 transition-colors"
            >
              {link.label}
            </Link>
          ))}
          {!isAdmin && (
            <Link
              href="/perfil"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-4 py-3 text-pdep-200 hover:bg-pdep-800 hover:text-white transition-colors"
            >
              <span>
                Editar perfil
                {hasPendingSync && (
                  <span className="sr-only">, acción pendiente</span>
                )}
              </span>
              {hasPendingSync && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-300"
                  aria-hidden="true"
                >
                  <span>!</span>
                  Pendiente
                </span>
              )}
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/errores"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 px-4 py-3 text-pdep-200 hover:bg-pdep-800 hover:text-white transition-colors"
            >
              <span>Errores</span>
              {unreadErrors > 0 && (
                <span
                  className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white"
                  aria-label={`${unreadErrors} sin leer`}
                >
                  {unreadErrors > 99 ? "99+" : unreadErrors}
                </span>
              )}
            </Link>
          )}
          <button
            type="button"
            className="text-left px-4 py-3 text-pdep-200 hover:bg-pdep-800 hover:text-white transition-colors"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Salir
          </button>
        </nav>
      </aside>
    </>
  );
}
