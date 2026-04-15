"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";

interface Props {
  username: string;
  image: string;
  isAdmin?: boolean;
}

export function UserMenu({ username, image, isAdmin = false }: Props) {
  return (
    <div className="relative group">
      <button className="flex items-center gap-2 cursor-pointer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="w-7 h-7 rounded-full" />
        <span className="font-mono text-xs text-pdep-200">{username}</span>
      </button>

      <div className="absolute right-0 top-full pt-2 hidden group-hover:block">
        <div className="bg-pdep-800 border border-pdep-700 rounded-lg shadow-lg py-1 min-w-[140px]">
          {!isAdmin && (
            <Link
              href="/perfil"
              className="block px-4 py-2 text-sm text-pdep-200 hover:text-white hover:bg-pdep-700 transition-colors"
            >
              Editar perfil
            </Link>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full text-left px-4 py-2 text-sm text-pdep-200 hover:text-white hover:bg-pdep-700 transition-colors"
          >
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}
