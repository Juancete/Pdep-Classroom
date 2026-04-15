import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: "PdeP Classroom",
  description: "Gestión de TPs - Paradigmas de Programación - UTN FRBA",
};

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
