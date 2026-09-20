import type { Grupo } from "@/domain/entities";
import {
  unirseAGrupo as unirseAGrupoEnRepositorio,
  salirDeGrupo as salirDeGrupoEnRepositorio,
  moverAlumnoDeGrupo as moverAlumnoDeGrupoEnRepositorio,
} from "@/infrastructure/repositories";
import { accesoAlRepositorioDeGrupo } from "./accesoAlRepositorio";

type ParametrosDeUnirse = Omit<Parameters<typeof unirseAGrupoEnRepositorio>[0], "acceso">;
type ParametrosDeSalir = Omit<Parameters<typeof salirDeGrupoEnRepositorio>[0], "acceso">;
type ParametrosDeMover = Omit<Parameters<typeof moverAlumnoDeGrupoEnRepositorio>[0], "acceso">;

// El repositorio no puede importar `application` ni GitHub, por eso el acceso
// al repo se inyecta acá.
export async function unirseAGrupo(params: ParametrosDeUnirse): Promise<Grupo> {
  return unirseAGrupoEnRepositorio({ ...params, acceso: accesoAlRepositorioDeGrupo });
}

export async function salirDeGrupo(
  params: ParametrosDeSalir
): ReturnType<typeof salirDeGrupoEnRepositorio> {
  return salirDeGrupoEnRepositorio({ ...params, acceso: accesoAlRepositorioDeGrupo });
}

export async function moverAlumnoDeGrupo(
  params: ParametrosDeMover
): ReturnType<typeof moverAlumnoDeGrupoEnRepositorio> {
  return moverAlumnoDeGrupoEnRepositorio({ ...params, acceso: accesoAlRepositorioDeGrupo });
}
