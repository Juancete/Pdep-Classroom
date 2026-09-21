import { requireAdmin } from "@/infrastructure/auth/session";
import { getAssignment, getHistorialDeMembresias } from "@/infrastructure/repositories";
import { parsePage } from "@/lib/search-params";
import { redirect } from "next/navigation";
import { AssignmentHeader } from "../assignment-header";
import { HistorialDeMembresias } from "../historial-membresias";

export default async function HistorialIntegrantesPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const emptySearchParams: { page?: string | string[] } = {};
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams ?? Promise.resolve(emptySearchParams),
  ]);
  await requireAdmin();

  const assignment = await getAssignment(params.id);
  if (!assignment) redirect("/admin/assignments");
  if (!assignment.comoGrupal()) redirect(`/admin/assignments/${params.id}`);

  const historial = await getHistorialDeMembresias(params.id, parsePage(searchParams.page));

  return (
    <div>
      <AssignmentHeader assignment={assignment} activa="integrantes" />
      <HistorialDeMembresias assignmentId={assignment.id} historial={historial} />
    </div>
  );
}
