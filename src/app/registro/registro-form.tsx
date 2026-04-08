"use client";

import { useState } from "react";

const COMISIONES = [
  "lunes mañana",
  "martes mañana",
  "miércoles mañana",
  "jueves mañana",
  "viernes mañana",
  "sábado mañana",
  "lunes tarde",
  "miércoles tarde",
  "lunes noche",
  "martes noche",
  "miércoles noche",
  "jueves noche",
  "viernes noche",
];

export function RegistroForm({
  githubUsername,
  email,
  nombre,
}: {
  githubUsername: string;
  email: string;
  nombre: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Intentar splitear nombre de GitHub en nombre/apellido
  const parts = nombre.split(" ");
  const defaultNombre = parts.slice(0, -1).join(" ") || parts[0] || "";
  const defaultApellido = parts.length > 1 ? parts[parts.length - 1] : "";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legajo: form.get("legajo"),
          apellido: form.get("apellido"),
          nombre: form.get("nombre"),
          githubUsername,
          email: form.get("email"),
          comision: form.get("comision"),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Error al registrar");
      }

      setSuccess(true);
      // Redirigir al dashboard después de un momento
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <p className="text-green-700 font-medium">¡Registro exitoso!</p>
        <p className="text-green-600 text-sm mt-1">
          Redirigiendo al dashboard…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* GitHub username - readonly */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Usuario de GitHub
        </label>
        <input
          value={githubUsername}
          disabled
          className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm font-mono text-gray-500"
        />
      </div>

      {/* Legajo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Legajo <span className="text-red-500">*</span>
        </label>
        <input
          name="legajo"
          required
          pattern="\d{4,8}"
          placeholder="12345678"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
        />
      </div>

      {/* Apellido */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Apellido <span className="text-red-500">*</span>
        </label>
        <input
          name="apellido"
          required
          defaultValue={defaultApellido}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
        />
      </div>

      {/* Nombre */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          name="nombre"
          required
          defaultValue={defaultNombre}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
        />
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          name="email"
          type="email"
          required
          defaultValue={email}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
        />
      </div>

      {/* Comisión */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Comisión <span className="text-red-500">*</span>
        </label>
        <select
          name="comision"
          required
          defaultValue="miércoles noche"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none"
        >
          {COMISIONES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-pdep-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors disabled:opacity-50"
      >
        {loading ? "Registrando…" : "Registrarme"}
      </button>
    </form>
  );
}
