import { Collection, Entity, OneToMany, Property } from "@mikro-orm/core";
import { Assignment } from "./Assignment";
import type { Grupo } from "./Grupo";

@Entity({ discriminatorValue: "grupal" })
export class GrupalAssignment extends Assignment {
  @Property()
  maxIntegrantes!: number;

  @OneToMany("Grupo", "assignment")
  grupos = new Collection<Grupo>(this);
}
