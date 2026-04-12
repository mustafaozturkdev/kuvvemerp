import * as React from "react";
import {
  useForm,
  type UseFormProps,
  type UseFormReturn,
  type FieldValues,
  type SubmitHandler,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z, ZodType } from "zod";
import { Form } from "@/components/ui/form";

interface ZodFormOzellik<TSema extends ZodType<FieldValues>>
  extends Omit<UseFormProps<z.infer<TSema>>, "resolver"> {
  sema: TSema;
  onGonder: SubmitHandler<z.infer<TSema>>;
  children: (form: UseFormReturn<z.infer<TSema>>) => React.ReactNode;
  className?: string;
  id?: string;
}

/**
 * React Hook Form + Zod wrapper.
 * Kullanim:
 *   <ZodForm sema={girisSemasi} onGonder={girisYap}>
 *     {(form) => <FormField ... />}
 *   </ZodForm>
 */
export function ZodForm<TSema extends ZodType<FieldValues>>({
  sema,
  onGonder,
  children,
  className,
  id,
  ...kalanlar
}: ZodFormOzellik<TSema>) {
  const form = useForm<z.infer<TSema>>({
    ...kalanlar,
    resolver: zodResolver(sema),
  });

  return (
    <Form {...form}>
      <form
        id={id}
        className={className}
        onSubmit={form.handleSubmit(onGonder)}
        noValidate
      >
        {children(form)}
      </form>
    </Form>
  );
}
