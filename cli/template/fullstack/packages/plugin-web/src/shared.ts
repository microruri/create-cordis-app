import { z } from "zod";

export const webStateSchema = z.object({
  title: z.string(),
  plugins: z.array(z.object({ name: z.string(), revision: z.number().int().nonnegative() })),
});
export type WebState = z.infer<typeof webStateSchema>;
