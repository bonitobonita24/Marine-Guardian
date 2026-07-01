"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";

const LAYOUT_OPTIONS = [
  { value: "landscape-one-per-page", label: "Landscape — one per page" },
  { value: "portrait-one-per-page", label: "Portrait — one per page" },
  { value: "continuous", label: "Continuous scroll" },
] as const;

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Max 255 characters"),
  layout: z.enum(["landscape-one-per-page", "portrait-one-per-page", "continuous"]),
  reportTitle: z.string().min(1, "Report title is required").max(255, "Max 255 characters"),
  footerNotes: z.string().optional(),
  isDefault: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export interface TemplateRecord {
  id: string;
  name: string;
  layout: string;
  municipalLogoKey: string | null;
  partnerLogoKey: string | null;
  reportTitle: string;
  footerNotes: string | null;
  isDefault: boolean;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => { setReduced(mq.matches); };
    mq.addEventListener("change", handler);
    return () => { mq.removeEventListener("change", handler); };
  }, []);
  return reduced;
}

async function fileToUpload(
  file: File,
): Promise<{ data: string; contentType: "image/png" | "image/jpeg" }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve({ data: base64, contentType: file.type as "image/png" | "image/jpeg" });
    };
    reader.onerror = () => { reject(new Error("Failed to read file")); };
    reader.readAsDataURL(file);
  });
}

interface ReportTemplateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateRecord | null;
  onSuccess?: () => void;
}

export function ReportTemplateForm({
  open,
  onOpenChange,
  template,
  onSuccess,
}: ReportTemplateFormProps) {
  const utils = trpc.useUtils();
  const prefersReducedMotion = useReducedMotion();

  const [municipalFile, setMunicipalFile] = useState<File | null>(null);
  const [partnerFile, setPartnerFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function validateImageFile(file: File | null | undefined): string | null {
    if (file === null || file === undefined) return null;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      return `Unsupported file type "${file.type}". Please upload a PNG or JPEG image.`;
    }
    if (file.size > 10 * 1024 * 1024) {
      return `File "${file.name}" exceeds 10 MB. Please choose a smaller image.`;
    }
    return null;
  }
  const isEdit = template !== null && template !== undefined;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      layout: "landscape-one-per-page",
      reportTitle: "",
      footerNotes: "",
      isDefault: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    setMunicipalFile(null);
    setPartnerFile(null);
    setLogoError(null);
    setFormError(null);
    if (template) {
      form.reset({
        name: template.name,
        layout: template.layout as FormValues["layout"],
        reportTitle: template.reportTitle,
        footerNotes: template.footerNotes ?? "",
        isDefault: template.isDefault,
      });
    } else {
      form.reset({
        name: "",
        layout: "landscape-one-per-page",
        reportTitle: "",
        footerNotes: "",
        isDefault: false,
      });
    }
  }, [open, template, form]);

  const createMut = trpc.reportTemplate.create.useMutation({
    onSuccess: () => {
      void utils.reportTemplate.list.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => { setFormError(err.message); },
  });

  const updateMut = trpc.reportTemplate.update.useMutation({
    onSuccess: () => {
      void utils.reportTemplate.list.invalidate();
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err) => { setFormError(err.message); },
  });

  const isPending = createMut.isPending || updateMut.isPending;

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const fileErr = validateImageFile(municipalFile) ?? validateImageFile(partnerFile);
    if (fileErr !== null) {
      setLogoError(fileErr);
      return;
    }
    try {
      const municipalLogoUpload = municipalFile
        ? await fileToUpload(municipalFile)
        : undefined;
      const partnerLogoUpload = partnerFile
        ? await fileToUpload(partnerFile)
        : undefined;

      if (template !== null && template !== undefined) {
        updateMut.mutate({
          id: template.id,
          ...values,
          footerNotes: values.footerNotes !== "" ? values.footerNotes : null,
          municipalLogoUpload,
          partnerLogoUpload,
        });
      } else {
        createMut.mutate({
          ...values,
          footerNotes: values.footerNotes,
          municipalLogoUpload,
          partnerLogoUpload,
        });
      }
    } catch {
      setFormError("Failed to read logo file. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        aria-describedby="rtf-desc"
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Report Template" : "Create Report Template"}
          </DialogTitle>
        </DialogHeader>

        <p id="rtf-desc" className="sr-only">
          {isEdit
            ? "Edit the selected report template fields."
            : "Fill in the fields to create a new printable report template."}
        </p>

        <Form {...form}>
          <form
            id="report-template-form"
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
                  <FormLabel>Template Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. Standard Municipal Report"
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="layout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Page Layout</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger aria-label="Select page layout">
                        <SelectValue placeholder="Select a layout" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LAYOUT_OPTIONS.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reportTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Report Title</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. Marine Protected Area Patrol Report"
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="footerNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Footer Notes{" "}
                    <span className="font-normal text-xs text-muted-foreground">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Optional footer text printed at the bottom of each page."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Municipal Logo */}
            <div className="space-y-1.5">
              <label
                htmlFor="municipal-logo-input"
                className="text-sm font-medium leading-none"
              >
                Municipal Logo{" "}
                <span className="font-normal text-xs text-muted-foreground">
                  (optional, PNG/JPEG, max 10 MB)
                </span>
              </label>
              {typeof template?.municipalLogoKey === "string" && (
                <p className="text-xs text-muted-foreground">
                  Current logo on file — upload a new file to replace it.
                </p>
              )}
              <input
                id="municipal-logo-input"
                type="file"
                accept="image/png,image/jpeg"
                aria-label="Upload municipal logo (PNG or JPEG, max 10 MB)"
                className="block w-full text-sm text-foreground
                  file:mr-3 file:rounded file:border file:border-border
                  file:px-3 file:py-1 file:text-xs file:font-medium
                  file:cursor-pointer file:bg-background file:text-foreground
                  hover:file:bg-accent"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setMunicipalFile(f);
                  setLogoError(validateImageFile(f));
                }}
              />
              {municipalFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {municipalFile.name}
                </p>
              )}
            </div>

            {/* Partner Logo */}
            <div className="space-y-1.5">
              <label
                htmlFor="partner-logo-input"
                className="text-sm font-medium leading-none"
              >
                Partner Logo{" "}
                <span className="font-normal text-xs text-muted-foreground">
                  (optional — leave empty to use Blue Alliance default)
                </span>
              </label>
              {typeof template?.partnerLogoKey === "string" && (
                <p className="text-xs text-muted-foreground">
                  Current logo on file — upload a new file to replace it.
                </p>
              )}
              <input
                id="partner-logo-input"
                type="file"
                accept="image/png,image/jpeg"
                aria-label="Upload partner logo (PNG or JPEG). Leave empty to use the Blue Alliance default logo."
                className="block w-full text-sm text-foreground
                  file:mr-3 file:rounded file:border file:border-border
                  file:px-3 file:py-1 file:text-xs file:font-medium
                  file:cursor-pointer file:bg-background file:text-foreground
                  hover:file:bg-accent"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setPartnerFile(f);
                  setLogoError(validateImageFile(f));
                }}
              />
              {partnerFile ? (
                <p className="text-xs text-muted-foreground">
                  Selected: {partnerFile.name}
                </p>
              ) : (
                !isEdit && (
                  <p className="text-xs text-muted-foreground">
                    Will use Blue Alliance default logo.
                  </p>
                )
              )}
            </div>

            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 rounded-md border p-3">
                  <FormControl>
                    <Switch
                      id="is-default-switch"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-0.5">
                    <FormLabel htmlFor="is-default-switch" className="cursor-pointer">
                      Set as default template
                    </FormLabel>
                    <p className="text-xs text-muted-foreground">
                      This template will be pre-selected when generating reports.
                    </p>
                  </div>
                </FormItem>
              )}
            />

            {logoError !== null && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {logoError}
              </div>
            )}

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
            onClick={() => { onOpenChange(false); }}
            disabled={isPending}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="report-template-form"
            disabled={isPending}
            className="min-h-[44px]"
          >
            {isPending && !prefersReducedMotion && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {isPending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save Changes"
                : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
