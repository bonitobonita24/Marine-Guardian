"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { FEATURE_REGISTRY, type FeatureAction } from "@/lib/rbac/feature-registry";

const ACTIONS: readonly FeatureAction[] = ["view", "write", "update", "delete"];

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(60, "Max 60 characters"),
  description: z.string().max(500, "Max 500 characters").optional(),
});

type FormValues = z.infer<typeof formSchema>;

export interface RolePermissionRecord {
  featureKey: string;
  view: boolean;
  write: boolean;
  update: boolean;
  delete: boolean;
}

export interface RoleRecord {
  id: string;
  name: string;
  description: string | null;
  permissions: RolePermissionRecord[];
}

type MatrixState = Record<string, Record<FeatureAction, boolean>>;

function emptyMatrix(): MatrixState {
  const matrix: MatrixState = {};
  for (const feature of FEATURE_REGISTRY) {
    matrix[feature.key] = { view: false, write: false, update: false, delete: false };
  }
  return matrix;
}

function matrixFromRole(role: RoleRecord | null | undefined): MatrixState {
  const matrix = emptyMatrix();
  if (!role) return matrix;
  for (const permission of role.permissions) {
    const row = matrix[permission.featureKey];
    if (row) {
      matrix[permission.featureKey] = {
        view: permission.view,
        write: permission.write,
        update: permission.update,
        delete: permission.delete,
      };
    }
  }
  return matrix;
}

interface RoleMatrixFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: RoleRecord | null;
  onSuccess?: () => void;
}

export function RoleMatrixForm({ open, onOpenChange, role, onSuccess }: RoleMatrixFormProps) {
  const utils = trpc.useUtils();
  const t = useTranslations("nav");

  const [matrix, setMatrix] = useState<MatrixState>(() => emptyMatrix());
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = role !== null && role !== undefined;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "" },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setMatrix(matrixFromRole(role));
    form.reset({
      name: role?.name ?? "",
      description: role?.description ?? "",
    });
  }, [open, role, form]);

  const createMut = trpc.customRole.create.useMutation({
    onSuccess: () => {
      void utils.customRole.list.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => {
      setFormError(err.message);
    },
  });

  const updateMut = trpc.customRole.update.useMutation({
    onSuccess: () => {
      void utils.customRole.list.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => {
      setFormError(err.message);
    },
  });

  const isPending = createMut.isPending || updateMut.isPending;

  function toggle(featureKey: string, action: FeatureAction) {
    setMatrix((prev) => {
      const row = prev[featureKey] ?? { view: false, write: false, update: false, delete: false };
      return {
        ...prev,
        [featureKey]: { ...row, [action]: !row[action] },
      };
    });
  }

  function onSubmit(values: FormValues) {
    setFormError(null);
    const permissions: RolePermissionRecord[] = FEATURE_REGISTRY.map((feature) => {
      const row = matrix[feature.key] ?? { view: false, write: false, update: false, delete: false };
      return {
        featureKey: feature.key,
        view: row.view,
        write: row.write,
        update: row.update,
        delete: row.delete,
      };
    });

    const description = values.description !== undefined && values.description !== ""
      ? values.description
      : undefined;

    if (role !== null && role !== undefined) {
      updateMut.mutate({
        id: role.id,
        name: values.name,
        description,
        permissions,
      });
    } else {
      createMut.mutate({
        name: values.name,
        description,
        permissions,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        aria-describedby="rmf-desc"
      >
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Custom Role" : "Create Custom Role"}</DialogTitle>
        </DialogHeader>

        <p id="rmf-desc" className="sr-only">
          {isEdit
            ? "Edit the selected custom role's name, description, and feature permissions."
            : "Name a new custom role and choose which features it can view, create, edit, or delete."}
        </p>

        <Form {...form}>
          <form
            id="role-matrix-form"
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit(onSubmit)(e);
            }}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Report Reviewer" autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Description{" "}
                    <span className="font-normal text-xs text-muted-foreground">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="What this role is for." rows={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-1.5">
              <p className="text-sm font-medium leading-none">Permissions</p>
              <p className="text-xs text-muted-foreground">
                A custom role can never exceed what an Administrator can do. User
                Management and Settings can never be granted here.
              </p>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <caption className="sr-only">Feature permission matrix</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Feature</TableHead>
                      {ACTIONS.map((action) => (
                        <TableHead key={action} scope="col" className="text-center capitalize">
                          {action}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {FEATURE_REGISTRY.map((feature) => {
                      const label = t(feature.labelKey);
                      const row = matrix[feature.key] ?? {
                        view: false,
                        write: false,
                        update: false,
                        delete: false,
                      };
                      return (
                        <TableRow key={feature.key}>
                          <TableCell className="font-medium">{label}</TableCell>
                          {ACTIONS.map((action) => {
                            const allowed = feature.actions.includes(action);
                            return (
                              <TableCell key={action} className="text-center">
                                <Checkbox
                                  checked={row[action]}
                                  disabled={!allowed}
                                  aria-label={`${label} ${action}`}
                                  onCheckedChange={() => {
                                    toggle(feature.key, action);
                                  }}
                                />
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {formError !== null && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </div>
            )}
          </form>
        </Form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isPending}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="role-matrix-form"
            disabled={isPending}
            className="min-h-[44px]"
          >
            {isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {isPending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save Changes"
                : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
