import { ReportTemplateList } from "./_components/report-template-list";

export default function ReportTemplatesPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Report Templates</h1>
        <p className="text-sm text-muted-foreground">
          Manage printable report templates — layouts, logos, and default settings.
          Administrators only.
        </p>
      </div>
      <ReportTemplateList />
    </div>
  );
}
