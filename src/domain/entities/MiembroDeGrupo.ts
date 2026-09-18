import { Entity, ManyToOne, PrimaryKey, Property, Unique } from "@mikro-orm/core";
import { randomUUID } from "crypto";
import { Alumno } from "./Alumno";
import type { Grupo } from "./Grupo";

/**
 * Un integrante de un `Grupo`, identificado por su username de GitHub — no
 * por una fila de `Alumno` — para poder admitir integrantes sin registro
 * (el docente que arma un grupo de demo para mostrarle a la clase el flujo
 * de aceptación, issue #107/#112). Reemplaza el pivot `grupo_alumnos`: el
 * vínculo con `Alumno` queda opcional (`alumno`) y se completa cuando
 * existe — lo usan la entrega y la auditoría de membresía para asociar al
 * alumno real detrás del username.
 *
 * `grupo` se referencia por nombre de entidad ("Grupo") en vez de la clase
 * importada, mismo criterio que `Grupo.assignment` con `GrupalAssignment`:
 * evita el ciclo de módulos entre esta entidad y `Grupo.ts`, que a su vez
 * necesita importar `MiembroDeGrupo` para su lado `OneToMany`.
 */
@Entity({ tableName: "grupo_miembro" })
@Unique({
  name: "grupo_miembro_assignment_username_unique_idx",
  properties: ["assignmentId", "githubUsername"],
})
export class MiembroDeGrupo {
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @ManyToOne("Grupo", { deleteRule: "cascade" })
  grupo!: Grupo;

  // Denormalizado desde `grupo.assignment.id` al agregar el miembro
  // (`Grupo.agregarMiembro`) — la FK compuesta (grupo_id, assignment_id) →
  // grupo(id, assignment_id) evita que un miembro quede apuntando a un
  // grupo de otro assignment, mismo criterio que tenía
  // `grupo_alumnos.assignment_id` (Migration20260813190000).
  @Property({ type: "uuid" })
  assignmentId!: string;

  // Canónico (`Alumno.normalizarUsername`): se compara y persiste siempre
  // en minúsculas.
  @Property({ type: "string" })
  githubUsername!: string;

  @ManyToOne(() => Alumno, { nullable: true, deleteRule: "cascade" })
  alumno?: Alumno;
}
