import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type DefaultValues, type FieldValues, type Path } from "react-hook-form";
import type { z } from "zod";
import { ApiError } from "@/shared/api/client";

/**
 * react-hook-form + zod, plus: server validation errors land on the right field.
 * Use handleServerError(err) in your mutation's onError.
 */
export function useApiForm<TInput extends FieldValues, TOutput extends FieldValues>(
  schema: z.ZodType<TOutput, TInput>,
  defaultValues: DefaultValues<TInput>,
) {
  const form = useForm<TInput, unknown, TOutput>({ resolver: zodResolver(schema), defaultValues });

  const handleServerError = (err: unknown) => {
    if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
      Object.entries(err.fieldErrors).forEach(([name, message]) =>
        form.setError(name as Path<TInput>, { type: "server", message }),
      );
    } else {
      form.setError("root", { message: err instanceof Error ? err.message : "Saving failed. Try again." });
    }
  };

  return { ...form, handleServerError };
}
