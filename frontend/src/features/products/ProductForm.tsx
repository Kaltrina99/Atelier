import { Field } from "@/shared/ui/Field";
import type { FormProps } from "@/shared/ui/ResourcePage";
import { useApiForm } from "@/shared/ui/useApiForm";
import { productsApi } from "./api";
import { productSchema, type Product, type ProductInput } from "./types";

export function ProductForm({ item, onDone }: FormProps<Product>) {
  const create = productsApi.useCreate();
  const update = productsApi.useUpdate();
  const { register, handleSubmit, formState: { errors, isSubmitting }, handleServerError } =
    useApiForm(productSchema, {
      name: item?.name ?? "",
      description: item?.description ?? null,
      price: item?.price ?? 0,
      isActive: item?.isActive ?? true,
    });

  const onSubmit = async (input: ProductInput) => {
    try {
      if (item) await update.mutateAsync({ id: item.id, input });
      else await create.mutateAsync(input);
      onDone();
    } catch (err) {
      handleServerError(err);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Field label="Name" error={errors.name?.message}>
        <input className="input" autoFocus {...register("name")} />
      </Field>

      <Field label="Description" error={errors.description?.message}>
        <textarea className="input" rows={4} {...register("description", { setValueAs: (v) => v || null })} />
      </Field>

      <Field label="Price" error={errors.price?.message}>
        <input className="input" type="number" step="0.01" min="0" {...register("price", { valueAsNumber: true })} />
      </Field>

      <label className="check">
        <input type="checkbox" {...register("isActive")} />
        Active
      </label>

      {errors.root && <p className="banner-error">{errors.root.message}</p>}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {item ? "Save changes" : "Create product"}
        </button>
      </div>
    </form>
  );
}
