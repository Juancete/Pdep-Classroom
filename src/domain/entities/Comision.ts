import {
  Collection,
  Entity,
  OneToMany,
  PrimaryKey,
  Property,
} from "@mikro-orm/core";
import { randomUUID } from "crypto";
import type { Assignment } from "./Assignment";
import { type ColumnConfig, type GruposColumnConfig, DEFAULT_COLUMN_CONFIG } from "@/types";
import { COMISION_ANIO_MIN, COMISION_ANIO_MAX } from "./domain-constants";

// Ventana del lease de importación de grupos: pasado este tiempo sin un
// heartbeat (`renovarImportacion`), un reclamo se considera abandonado y
// vuelve a estar disponible para `reclamarImportacionDeGrupos`. Única
// fuente: antes vivía sólo en `ComisionRepository.ts` (Fase 2 de la
// auditoría de dominio).
export const VENTANA_IMPORTACION_GRUPOS_MS = 5 * 60_000;
export const INTERVALO_HEARTBEAT_IMPORTACION_GRUPOS_MS =
  VENTANA_IMPORTACION_GRUPOS_MS / 2;

@Entity()
export class Comision {
  static readonly ANIO_MIN = COMISION_ANIO_MIN;
  static readonly ANIO_MAX = COMISION_ANIO_MAX;
  @PrimaryKey({ type: "uuid" })
  id: string = randomUUID();

  @Property({ type: 'integer' })
  anio!: number;

  @Property({ type: 'string' })
  spreadsheetId!: string;

  @Property({ type: 'boolean', default: false })
  activa: boolean = false;

  // Sheets es bootstrap, no autoridad continua: una vez importados, los
  // cambios de grupos se administran exclusivamente desde Classroom.
  @Property({ type: "datetime", nullable: true })
  gruposImportadosEn?: Date;

  // Lease del bootstrap de grupos. El token identifica al request que puede
  // completar o liberar la importación; la fecha permite recuperar un request
  // que murió sin ejecutar su finally.
  @Property({ type: "string", nullable: true })
  gruposImportacionToken?: string;

  @Property({ type: "datetime", nullable: true })
  gruposImportacionIniciadaEn?: Date;

  @Property({ type: "json" })
  columnConfig: ColumnConfig = { ...DEFAULT_COLUMN_CONFIG };

  @OneToMany("Assignment", "comision")
  assignments = new Collection<Assignment>(this);

  constructor(anio: number, spreadsheetId: string) {
    this.anio = anio;
    this.spreadsheetId = spreadsheetId;
  }

  gruposConfig(): GruposColumnConfig | undefined {
    return this.columnConfig?.grupos;
  }

  activar(): void {
    this.activa = true;
  }

  desactivar(): void {
    this.activa = false;
  }

  /**
   * `true` si el bootstrap de grupos ya se completó — a partir de acá,
   * Classroom es la única fuente de verdad para los grupos, la planilla no
   * se vuelve a consultar. Única fuente: antes se chequeaba `gruposImportadosEn`
   * como truthiness en 6 lugares (Fase 2 de la auditoría de dominio).
   */
  gruposYaImportados(): boolean {
    return Boolean(this.gruposImportadosEn);
  }

  /**
   * `true` si hay un reclamo de importación vigente (dentro de la ventana
   * del lease) — un segundo reclamo mientras éste sigue en pie debe
   * rechazarse, no pisarlo.
   */
  importacionEnProceso(ahora: Date): boolean {
    const inicio = this.gruposImportacionIniciadaEn?.getTime();
    return Boolean(
      this.gruposImportacionToken &&
        inicio !== undefined &&
        inicio > ahora.getTime() - VENTANA_IMPORTACION_GRUPOS_MS
    );
  }

  /**
   * Reclama el bootstrap de grupos con `token` (generado por el caller —
   * la entidad no conoce infraestructura de generación de ids). El caller
   * es responsable de chequear antes `gruposYaImportados()`/`importacionEnProceso()`
   * para decidir si corresponde reclamar.
   */
  reclamarImportacionDeGrupos(token: string, ahora: Date): void {
    this.gruposImportacionToken = token;
    this.gruposImportacionIniciadaEn = ahora;
  }

  /**
   * Heartbeat del reclamo vigente — renueva `gruposImportacionIniciadaEn`
   * para que el lease no venza mientras la importación sigue en curso.
   * Devuelve `false` (sin aplicar nada) si ya se completó o si `token` no
   * es el que tiene el reclamo actual.
   */
  renovarImportacion(token: string, ahora: Date): boolean {
    if (this.gruposYaImportados() || this.gruposImportacionToken !== token) return false;
    this.gruposImportacionIniciadaEn = ahora;
    return true;
  }

  /**
   * Cierra el bootstrap de grupos con éxito. Devuelve `false` (sin aplicar
   * nada) si `token` no coincide con el reclamo vigente.
   */
  completarImportacionDeGrupos(token: string, ahora: Date): boolean {
    if (this.gruposImportacionToken !== token) return false;
    this.gruposImportadosEn = ahora;
    this.gruposImportacionToken = undefined;
    this.gruposImportacionIniciadaEn = undefined;
    return true;
  }

  /**
   * Libera el reclamo sin completar la importación (ej. el caller abortó).
   * Devuelve `false` (sin aplicar nada) si `token` no coincide con el
   * reclamo vigente.
   */
  liberarImportacion(token: string): boolean {
    if (this.gruposImportacionToken !== token) return false;
    this.gruposImportacionToken = undefined;
    this.gruposImportacionIniciadaEn = undefined;
    return true;
  }
}
