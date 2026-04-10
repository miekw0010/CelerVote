/**
 * Client-side CSV export for event results
 * Drop this in src/lib/exportCsv.ts
 */

export function exportResultsCSV(event: any) {
  const rows: string[][] = [];

  // Header
  rows.push(["Event", event.title || ""]);
  rows.push(["Total Votes", event.total_votes?.toString() || "0"]);
  rows.push(["Status", event.status || ""]);
  rows.push(["Exported At", new Date().toLocaleString()]);
  rows.push([]);
  rows.push(["Category", "Candidate", "Votes", "Percentage"]);

  // Data rows
  const categories = event.categories || [];
  for (const cat of categories) {
    const candidates = [...(cat.candidates || [])].sort(
      (a: any, b: any) => (b.vote_count || 0) - (a.vote_count || 0)
    );
    const total = candidates.reduce((s: number, c: any) => s + (c.vote_count || 0), 0);
    for (const c of candidates) {
      const pct = total > 0 ? ((c.vote_count / total) * 100).toFixed(1) : "0.0";
      rows.push([cat.name, c.name, c.vote_count?.toString() || "0", `${pct}%`]);
    }
    rows.push([]); // blank line between categories
  }

  // Convert to CSV string
  const csv = rows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // Trigger download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${event.slug || "results"}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
