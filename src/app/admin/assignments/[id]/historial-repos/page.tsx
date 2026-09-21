import { requireAdmin } from "@/infrastructure/auth/session";
import { getAssignment, getEntregas, getRepoDeletionHistory } from "@/infrastructure/repositories";
import { parsePage } from "@/lib/search-params";
import { redirect } from "next/navigation";
import { AssignmentHeader } from "../assignment-header";
import { DeleteReposButton } from "../../delete-repos-button";
import { RepoDeletionHistory } from "../repo-deletion-history";

export default async function HistorialReposPage(props: {
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

  const [entregas, deletionHistory] = await Promise.all([
    getEntregas(params.id),
    getRepoDeletionHistory(params.id, parsePage(searchParams.page)),
  ]);

  return (
    <div>
      <AssignmentHeader
        assignment={assignment}
        activa="repos"
        acciones={
          <DeleteReposButton
            assignmentId={assignment.id}
            assignmentSlug={assignment.slug}
            deletionEnabled={assignment.permiteBorrarRepos()}
            activeRepoCount={entregas.filter((entrega) => entrega.hasRepo()).length}
          />
        }
      />
      <RepoDeletionHistory assignmentId={assignment.id} history={deletionHistory} />
    </div>
  );
}
