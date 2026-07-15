"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import {
  FEATURES,
  PAINS,
  ROLES,
  ROLE_SLUGS,
  STEPS,
  BENTO,
  BENTO_SLUGS,
} from "@/app/showcase/_components/data";
import { CmsPlateEditor, type CmsPlateEditorHandle } from "@/components/cms/cms-plate-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Save, Trash2 } from "lucide-react";

type CmsFields = Record<string, { value: string; valueJson: unknown }>;

interface FieldSpec {
  key: string;
  label: string;
  kind: "text" | "long" | "bullets";
}

interface SectionSpec {
  id: string;
  label: string;
  intro: FieldSpec[];
  items: { title: string; fields: FieldSpec[] }[];
}

const SECTIONS: SectionSpec[] = [
  {
    id: "hero",
    label: "Hero",
    intro: [
      { key: "hero.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "hero.headline", label: "Headline", kind: "text" },
      { key: "hero.headlineAccent", label: "Headline accent", kind: "text" },
      { key: "hero.subcopy", label: "Subcopy", kind: "long" },
      { key: "hero.ctaPrimaryLabel", label: "Primary CTA label", kind: "text" },
      { key: "hero.ctaSecondaryLabel", label: "Secondary CTA label", kind: "text" },
    ],
    items: [],
  },
  {
    id: "problem",
    label: "Problem",
    intro: [
      { key: "problem.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "problem.title", label: "Title", kind: "text" },
      { key: "problem.body", label: "Body", kind: "long" },
    ],
    items: PAINS.map((p) => ({
      title: p.title,
      fields: [
        { key: `problem.${p.id}.title`, label: "Title", kind: "text" as const },
        { key: `problem.${p.id}.body`, label: "Body", kind: "long" as const },
      ],
    })),
  },
  {
    id: "features",
    label: "Features",
    intro: [
      { key: "features.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "features.title", label: "Title", kind: "text" },
    ],
    items: FEATURES.map((f) => ({
      title: f.eyebrow,
      fields: [
        { key: `feature.${f.id}.eyebrow`, label: "Eyebrow", kind: "text" as const },
        { key: `feature.${f.id}.title`, label: "Title", kind: "text" as const },
        { key: `feature.${f.id}.body`, label: "Body", kind: "long" as const },
        { key: `feature.${f.id}.bullets`, label: "Bullets", kind: "bullets" as const },
      ],
    })),
  },
  {
    id: "bento",
    label: "Bento grid",
    intro: [
      { key: "bento.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "bento.title", label: "Title", kind: "text" },
    ],
    items: BENTO.map((b, i) => {
      const bentoSlug: string = BENTO_SLUGS[i] ?? "";
      return {
        title: b.name,
        fields: [
          { key: `bento.${bentoSlug}.name`, label: "Name", kind: "text" as const },
          { key: `bento.${bentoSlug}.description`, label: "Description", kind: "long" as const },
        ],
      };
    }),
  },
  {
    id: "steps",
    label: "How it works",
    intro: [
      { key: "steps.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "steps.title", label: "Title", kind: "text" },
    ],
    items: STEPS.map((s) => ({
      title: `Step ${s.n}`,
      fields: [
        { key: `step.${s.n}.title`, label: "Title", kind: "text" as const },
        { key: `step.${s.n}.body`, label: "Body", kind: "long" as const },
      ],
    })),
  },
  {
    id: "roles",
    label: "Roles & permissions",
    intro: [
      { key: "roles.eyebrow", label: "Eyebrow", kind: "text" },
      { key: "roles.title", label: "Title", kind: "text" },
      { key: "roles.subcopy", label: "Subcopy", kind: "text" },
    ],
    items: ROLES.map((r, i) => {
      const roleSlug: string = ROLE_SLUGS[i] ?? "";
      return {
        title: r.name,
        fields: [
          { key: `role.${roleSlug}.name`, label: "Name", kind: "text" as const },
          { key: `role.${roleSlug}.can`, label: "Can", kind: "long" as const },
        ],
      };
    }),
  },
  {
    id: "cta",
    label: "Closing CTA",
    intro: [
      { key: "cta.title", label: "Title", kind: "text" },
      { key: "cta.body", label: "Body", kind: "long" },
      { key: "cta.primaryLabel", label: "Primary label", kind: "text" },
      { key: "cta.secondaryLabel", label: "Secondary label", kind: "text" },
    ],
    items: [],
  },
];

/**
 * /admin/content/showcase (CMS_BUILD_PLAN.md — W6). Data-driven from the
 * SAME id lists ./showcase/_components/data.ts already uses to resolve CMS
 * text (resolve-cms.ts, W5) — so this admin UI never drifts from the actual
 * keys the public page reads. Each field row saves independently via
 * cmsShowcase.update (upsert), matching the "Save each field (or a section)"
 * allowance in the build plan.
 */
export function AdminContentShowcaseClient() {
  const utils = trpc.useUtils();
  const query = trpc.cmsShowcase.getAll.useQuery();
  const fields = query.data ?? {};

  const invalidate = React.useCallback(() => {
    void utils.cmsShowcase.getAll.invalidate();
  }, [utils]);

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Showcase / Landing</h1>
        <p className="text-sm text-muted-foreground">
          Edits the public /showcase marketing page. Each field saves independently.
        </p>
      </div>

      {SECTIONS.map((section) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="text-base">{section.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {section.intro.map((f) => (
                <FieldEditor key={f.key} spec={f} fields={fields} onSaved={invalidate} />
              ))}
            </div>

            {section.items.length > 0 && (
              <div className="space-y-4 border-t border-border pt-4">
                {section.items.map((item) => (
                  <div key={item.title} className="space-y-3 rounded-md border border-input p-3">
                    <p className="text-sm font-medium">{item.title}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {item.fields.map((f) => (
                        <FieldEditor key={f.key} spec={f} fields={fields} onSaved={invalidate} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FieldEditor({
  spec,
  fields,
  onSaved,
}: {
  spec: FieldSpec;
  fields: CmsFields;
  onSaved: () => void;
}) {
  const existing = fields[spec.key];
  const [value, setValue] = React.useState(existing?.value ?? "");
  const [bullets, setBullets] = React.useState<string[]>(
    Array.isArray(existing?.valueJson) ? (existing.valueJson as string[]) : [],
  );
  const editorRef = React.useRef<CmsPlateEditorHandle>(null);
  const [saved, setSaved] = React.useState(false);

  const update = trpc.cmsShowcase.update.useMutation({
    onSuccess: () => {
      setSaved(true);
      onSaved();
      setTimeout(() => { setSaved(false); }, 1500);
    },
  });

  const handleSave = () => {
    if (spec.kind === "bullets") {
      update.mutate({ key: spec.key, value: "", valueJson: bullets });
      return;
    }
    if (spec.kind === "long") {
      const markdown = editorRef.current?.getMarkdown() ?? value;
      update.mutate({ key: spec.key, value: markdown });
      return;
    }
    update.mutate({ key: spec.key, value });
  };

  return (
    <div className={spec.kind === "text" ? "space-y-1.5" : "space-y-1.5 sm:col-span-2"}>
      <div className="flex items-center justify-between">
        <Label htmlFor={spec.key} className="font-mono text-xs text-muted-foreground">
          {spec.label} <span className="opacity-60">({spec.key})</span>
        </Label>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-muted-foreground">Saved</span>}
          <Button size="sm" variant="outline" disabled={update.isPending} onClick={handleSave}>
            <Save className="size-3.5" />
          </Button>
        </div>
      </div>

      {spec.kind === "text" && (
        <Input id={spec.key} value={value} onChange={(e) => { setValue(e.target.value); }} />
      )}

      {spec.kind === "long" && (
        <CmsPlateEditor
          ref={editorRef}
          initialMarkdown={value}
          scope="showcase"
          variant="compact"
          placeholder="…"
        />
      )}

      {spec.kind === "bullets" && (
        <div className="space-y-2">
          {bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={b}
                onChange={(e) => {
                  const next = [...bullets];
                  next[i] = e.target.value;
                  setBullets(next);
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { setBullets(bullets.filter((_, idx) => idx !== i)); }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => { setBullets([...bullets, ""]); }}>
            <Plus className="size-4" />
            Add bullet
          </Button>
        </div>
      )}
    </div>
  );
}
