import { z } from "zod";
import { PARADIGMAS } from "@/types";
import { GRUPAL_MIN_MAX_INTEGRANTES } from "@/domain/entities/domain-constants";

export const AssignmentBaseSchema = z.object({
  titulo: z.string().min(1, "El título es obligatorio"),
  slug: z
    .string()
    .regex(/^[a-z0-9-]*$/, "Solo minúsculas, números y guiones")
    .optional()
    .or(z.literal("")),
  descripcion: z.string().optional(),
  templateRepo: z.string().min(1, "El template es obligatorio"),
  tipo: z.enum(["individual", "grupal"] as const),
  paradigma: z.enum(PARADIGMAS as [string, ...string[]]),
  deadline: z.string().optional(),
  maxIntegrantes: z.coerce
    .number()
    .int()
    .min(GRUPAL_MIN_MAX_INTEGRANTES, `Mínimo ${GRUPAL_MIN_MAX_INTEGRANTES} integrantes`)
    .optional(),
});

export const AssignmentSchema = AssignmentBaseSchema.refine(
  (data) => data.tipo !== "grupal" || data.maxIntegrantes !== undefined,
  { message: "Requerido para assignments grupales", path: ["maxIntegrantes"] }
);

export type AssignmentFormData = z.infer<typeof AssignmentSchema>;

export type AssignmentFormErrors =
  z.typeToFlattenedError<AssignmentFormData>["fieldErrors"];

export type AssignmentFormState =
  | { ok: false; errors: AssignmentFormErrors; formError?: string }
  | null;
