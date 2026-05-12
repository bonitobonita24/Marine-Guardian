import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

export interface PdfColumn {
  key: string;
  label: string;
}

export interface ExportPdfProps {
  entity: string;
  tenantName: string;
  filterSummary: string;
  generatedAt: Date;
  columns: PdfColumn[];
  rows: Record<string, unknown>[];
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
    paddingBottom: 6,
  },
  title: { fontSize: 16, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 9, color: "#555555", marginTop: 2 },
  table: { width: "100%", marginTop: 4 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
    padding: 4,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#dddddd",
    padding: 4,
  },
  tableRowAlt: { backgroundColor: "#f5f5f5" },
  tableCell: { flex: 1, paddingRight: 4 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    fontSize: 8,
    color: "#888888",
    textAlign: "center",
  },
});

export function ExportPdfDocument(props: ExportPdfProps) {
  const { entity, tenantName, filterSummary, generatedAt, columns, rows } =
    props;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.title}>{entity} Export</Text>
          <Text style={styles.meta}>{tenantName}</Text>
          <Text style={styles.meta}>
            Generated: {generatedAt.toISOString()}
          </Text>
          <Text style={styles.meta}>Filters: {filterSummary || "(none)"}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            {columns.map((c) => (
              <Text key={c.key} style={styles.tableCell}>
                {c.label}
              </Text>
            ))}
          </View>
          {rows.map((row, idx) => (
            <View
              key={idx}
              style={
                idx % 2 === 1
                  ? [styles.tableRow, styles.tableRowAlt]
                  : styles.tableRow
              }
              wrap={false}
            >
              {columns.map((c) => (
                <Text key={c.key} style={styles.tableCell}>
                  {row[c.key] === null || row[c.key] === undefined
                    ? ""
                    : String(row[c.key])}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${String(pageNumber)} of ${String(totalPages)}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderExportPdf(props: ExportPdfProps): Promise<Buffer> {
  return renderToBuffer(<ExportPdfDocument {...props} />);
}
