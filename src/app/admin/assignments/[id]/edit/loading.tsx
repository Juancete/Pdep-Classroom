export default function Loading() {
  return (
    <div className="max-w-xl animate-pulse">
      <h1 className="text-2xl font-bold mb-6">Editar Assignment</h1>
      <div className="space-y-5">
        {[...Array(6)].map((_, i) => (
          <div key={i}>
            <div className="h-4 bg-gray-200 rounded w-24 mb-1" />
            <div className="h-10 bg-gray-100 rounded-lg" />
          </div>
        ))}
        <div className="flex gap-3 pt-2">
          <div className="h-9 bg-gray-200 rounded-lg w-32" />
          <div className="h-9 bg-gray-100 rounded-lg w-20" />
        </div>
      </div>
    </div>
  );
}
