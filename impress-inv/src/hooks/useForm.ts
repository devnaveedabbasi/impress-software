import { useState, FormEvent } from "react";
import { ZodSchema } from "zod";
import { isAxiosError } from "axios";

interface UseFormOptions<T> {
  initialValues: T;
  validationSchema: ZodSchema;
  onSubmit: (data: T) => Promise<void>;
  successMessage?: string;
}

export function useForm<T extends Record<string, any>>({
  initialValues,
  validationSchema,
  onSubmit,
  successMessage = "Success",
}: UseFormOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (field: keyof T) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleCNICChange = (field: keyof T) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    let value = event.target.value.replace(/\D/g, "");
    if (value.length > 13) value = value.substring(0, 13);
    
    let formatted = value;
    if (value.length > 5 && value.length <= 12) {
      formatted = `${value.slice(0, 5)}-${value.slice(5)}`;
    } else if (value.length > 12) {
      formatted = `${value.slice(0, 5)}-${value.slice(5, 12)}-${value.slice(12)}`;
    }

    setValues((prev) => ({ ...prev, [field]: formatted }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleSelectChange = (field: keyof T) => (
    value: string | string[]
  ) => {
    setValues((prev) => ({
      ...prev,
      [field]: Array.isArray(initialValues[field])
        ? (Array.isArray(value) ? value : [value])
        : (typeof value === "string" ? value : value[0] ?? ""),
    }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const resetForm = () => {
    setValues(initialValues);
    setErrors({});
    setMessage("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validationSchema.safeParse(values);

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      const formattedErrors: Partial<Record<keyof T, string>> = {};
      for (const key in fieldErrors) {
        formattedErrors[key as keyof T] = fieldErrors[key]?.[0] ?? "";
      }
      setErrors(formattedErrors);
      setMessage("");
      return;
    }

    setErrors({});
    setMessage("");
    setIsLoading(true);

    try {
      await onSubmit(result.data as T);
      setMessage(successMessage);
      setValues(initialValues);
    } catch (error) {
      setMessage(
        isAxiosError(error)
          ? error.response?.data?.message ?? (error as Error).message
          : "An error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return {
    values,
    errors,
    message,
    isLoading,
    handleInputChange,
    handleCNICChange,
    handleSelectChange,
    handleSubmit,
    resetForm,
    setValues,
  };
}
