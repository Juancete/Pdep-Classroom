"use client";

import { useFormStatus } from "react-dom";

export const INPUT_CLASS =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pdep-500 focus:border-pdep-500 outline-none";

export const INPUT_ERROR_CLASS =
  "w-full border border-red-400 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-red-600 text-xs mt-1">{message}</p>;
}

export function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-pdep-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-pdep-700 transition-colors disabled:opacity-60"
    >
      {pending ? "Guardando…" : label}
    </button>
  );
}
