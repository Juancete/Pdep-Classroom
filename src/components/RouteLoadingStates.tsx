import {
  DashboardSkeleton,
  AssignmentsTableSkeleton,
  FormSkeleton,
  ListSkeleton,
} from "./PageSkeleton";

// Next.js exige un archivo `loading.tsx` por segmento de ruta — no hay forma
// de compartir un solo archivo entre rutas, es una convención de ubicación,
// no de import. Lo que sí se puede compartir es la lógica: qué skeleton (y
// con qué props) le corresponde a cada ruta vive acá, en un solo lugar, y
// cada `loading.tsx` queda como un re-export de una línea (ver esos
// archivos) en vez de repetir `export default function Loading() { ... }`
// nueve veces.

export function DashboardLoading() {
  return <DashboardSkeleton />;
}

export function AssignmentsLoading() {
  return <AssignmentsTableSkeleton />;
}

export function AssignmentNuevoLoading() {
  return <FormSkeleton title="Nuevo Assignment" />;
}

export function AssignmentEditarLoading() {
  return <FormSkeleton title="Editar Assignment" />;
}

export function ComisionesLoading() {
  return <AssignmentsTableSkeleton />;
}

export function ComisionNuevaLoading() {
  return <ListSkeleton title="Nueva Comisión" rows={2} />;
}

export function ComisionEditarLoading() {
  return <ListSkeleton title="Editar Comisión" rows={2} />;
}

export function AlumnosLoading() {
  return <ListSkeleton title="Alumnos" rows={8} />;
}

export function GruposLoading() {
  return <ListSkeleton title="Grupos" rows={4} />;
}
