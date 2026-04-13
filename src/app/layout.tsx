import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/session";
import Link from "next/link";
import { UserMenu } from "./logout-button";

export const metadata: Metadata = {
  title: "PdeP Classroom",
  description: "Gestión de TPs - Paradigmas de Programación - UTN FRBA",
};

async function Nav() {
  const user = await getCurrentUser();

  return (
    <nav className="bg-pdep-900 text-white">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight">
          PdeP <span className="font-light text-pdep-200">Classroom</span>
        </Link>

        <div className="flex items-center gap-6 text-sm">
          {user && (
            <>
              <Link
                href="/dashboard"
                className="hover:text-pdep-200 transition-colors"
              >
                Mis TPs
              </Link>
              {user.isAdmin && (
                <>
                  <Link
                    href="/admin/assignments"
                    className="hover:text-pdep-200 transition-colors"
                  >
                    Assignments
                  </Link>
                  <Link
                    href="/admin/grupos"
                    className="hover:text-pdep-200 transition-colors"
                  >
                    Grupos
                  </Link>
                  <Link
                    href="/admin/comisiones"
                    className="hover:text-pdep-200 transition-colors"
                  >
                    Comisiones
                  </Link>
                  <Link
                    href="/admin/alumnos"
                    className="hover:text-pdep-200 transition-colors"
                  >
                    Alumnos
                  </Link>
                </>
              )}
              <UserMenu username={user.githubUsername} image={user.image} />
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="font-sans">
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
