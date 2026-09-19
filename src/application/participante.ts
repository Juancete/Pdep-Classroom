import type { Participante } from "@/domain/entities";
import type { PdepUser } from "@/types";
import { getAlumnoByGithub, getComisionActiva } from "@/infrastructure/repositories";

/**
 * Cablea las fuentes reales (`@/infrastructure/repositories`) para que
 * `user.rol.comoParticipante` pueda resolver el `Participante` con el que
 * este usuario actúa en los flujos self-service de Mis TPs. Único punto de
 * la capa de aplicación que conoce esas fuentes concretas — el dominio
 * (`RolDeUsuario.comoParticipante`) sólo conoce la interfaz `FuentesDeParticipante`.
 *
 * Perezosas a propósito (thunks, no promesas ya disparadas): cada rol
 * consulta sólo lo que necesita — el estudiante pide `alumno()`, el docente
 * pide `comisionActiva()` — sin pagar el costo de la fuente que no usa.
 */
export async function resolverParticipante(user: PdepUser): Promise<Participante> {
  return user.rol.comoParticipante(user.githubUsername, {
    alumno: () => getAlumnoByGithub(user.githubUsername, true),
    comisionActiva: () => getComisionActiva(),
  });
}
