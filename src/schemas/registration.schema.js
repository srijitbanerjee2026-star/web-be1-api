import { z } from "zod";

export const registerEventSchema = z.object({
  notes: z.string().max(250, "Notes cannot exceed 250 characters").optional(),
});