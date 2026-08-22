import { z } from "zod";

export const freeModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  contextLength: z.number().int().positive().nullable(),
  promptPrice: z.literal(0),
  completionPrice: z.literal(0),
});

export const freeModelCatalogSchema = z.array(freeModelSchema);

export type FreeModel = z.infer<typeof freeModelSchema>;
