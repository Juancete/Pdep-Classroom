import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <h1 className="text-2xl font-bold mb-2 text-gray-800">
        Página no encontrada
      </h1>
      <p className="text-gray-500 text-sm mb-4">
        La página que buscás no existe o fue movida.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-pdep-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-pdep-800 transition-colors"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
