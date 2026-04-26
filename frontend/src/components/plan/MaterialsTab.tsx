import { useMemo, useState } from "react";
import type { FullPlan, Material, MaterialCategory } from "@/types/plan";
import { VerificationSourcesBlock } from "./VerificationSourcesBlock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type SortKey = keyof Material | "none";

export function MaterialsTab({ plan }: { plan: FullPlan }) {
  const [sortKey, setSortKey] = useState<SortKey>("none");
  const [asc, setAsc] = useState(true);

  const materials = plan.experimentPlan.materials;
  const sorted = useMemo(() => {
    if (sortKey === "none") return materials;
    return [...materials].sort((a, b) => {
      const av = a[sortKey],
        bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return asc ? cmp : -cmp;
    });
  }, [materials, sortKey, asc]);

  const subtotals = useMemo(() => {
    const out: Record<MaterialCategory, number> = { Reagent: 0, Equipment: 0, Consumable: 0 };
    for (const m of materials) out[m.category] += m.totalCostUSD;
    return out;
  }, [materials]);

  const total = materials.reduce((s, m) => s + m.totalCostUSD, 0);
  const hasGrounding = materials.some(
    (m) => m.grounding && typeof m.grounding.sourceUrl === "string",
  );
  const hasQuoteMeta = materials.some(
    (m) => Boolean(m.lastVerifiedAt) || m.quoteSourceType != null || m.stalenessDays != null,
  );

  const onSort = (key: SortKey) => {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const exportCSV = () => {
    const header = [
      "Item",
      "Specification",
      "Quantity",
      "Supplier",
      "Catalog #",
      "Unit Price USD",
      "Total USD",
      "Category",
      "Lead Time (weeks)",
    ];
    const rows = materials.map((m) => [
      m.item,
      m.specification,
      m.quantity,
      m.supplier,
      m.catalogNumber,
      m.unitPriceUSD,
      m.totalCostUSD,
      m.category,
      m.leadTimeWeeks,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "labmind-materials.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Materials exported to CSV");
  };

  return (
    <div className="space-y-5">
      <VerificationSourcesBlock plan={plan} section="materials" />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            {materials.length} line items across reagents, equipment, and consumables.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} data-print-hide>
          <Download className="h-4 w-4 mr-2" />
          Export to CSV
        </Button>
      </div>

      <div
        className="rounded-xl border border-border bg-card/40 backdrop-blur overflow-hidden"
        data-print-card
      >
        <div className="overflow-x-auto">
          <table
            className={`w-full text-sm ${hasGrounding || hasQuoteMeta ? "min-w-[1040px]" : "min-w-[760px]"}`}
          >
            <thead className="bg-card border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <Th label="Item" onClick={() => onSort("item")} />
                <Th label="Specification" />
                <Th label="Qty" />
                <Th label="Supplier" onClick={() => onSort("supplier")} />
                <Th label="Catalog #" />
                {hasGrounding ? <Th label="Packet provenance" /> : null}
                {hasQuoteMeta ? <Th label="Quote freshness" /> : null}
                <Th label="Unit $" onClick={() => onSort("unitPriceUSD")} align="right" />
                <Th label="Total $" onClick={() => onSort("totalCostUSD")} align="right" />
                <Th label="Lead" onClick={() => onSort("leadTimeWeeks")} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((m, i) => {
                const longLead = m.leadTimeWeeks > 1;
                return (
                  <tr key={i} className="hover:bg-card/60 transition-colors">
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-foreground">{m.item}</p>
                      <Badge
                        variant="outline"
                        className="mt-1 text-[10px] uppercase tracking-wider border-border bg-card/50"
                      >
                        {m.category}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 align-top text-muted-foreground text-xs leading-relaxed">
                      {m.specification}
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">{m.quantity}</td>
                    <td className="px-3 py-3 align-top text-muted-foreground">{m.supplier}</td>
                    <td className="px-3 py-3 align-top">
                      <span className="font-mono text-xs text-foreground/90">
                        {m.catalogNumber}
                      </span>
                      <span
                        className="block text-[10px] text-amber-400/80 mt-0.5"
                        title="Verify current catalog and pricing before ordering"
                      >
                        ⚠ Verify before ordering
                      </span>
                    </td>
                    {hasGrounding ? (
                      <td className="px-3 py-3 align-top max-w-[200px] text-xs text-muted-foreground">
                        {m.grounding?.sourceUrl && m.grounding.sourceUrl !== "PENDING" ? (
                          <>
                            <a
                              href={m.grounding.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline break-all line-clamp-2"
                            >
                              {m.grounding.sourceTitle || "Ref"}
                            </a>
                            {m.grounding.confidence ? (
                              <span className="block text-[10px] mt-0.5 text-foreground/70">
                                {m.grounding.confidence} confidence
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground/80">PENDING</span>
                        )}
                      </td>
                    ) : null}
                    {hasQuoteMeta ? (
                      <td className="px-3 py-3 align-top text-xs text-muted-foreground max-w-[160px]">
                        {m.lastVerifiedAt ? (
                          <span className="font-mono text-[10px] text-foreground/85 block">
                            {String(m.lastVerifiedAt).slice(0, 10)}
                          </span>
                        ) : (
                          <span className="text-amber-400/90">—</span>
                        )}
                        {m.quoteSourceType ? (
                          <Badge
                            variant="outline"
                            className="mt-1 text-[9px] border-border font-normal"
                          >
                            {m.quoteSourceType}
                          </Badge>
                        ) : null}
                        {typeof m.stalenessDays === "number" ? (
                          <span className="block text-[10px] mt-0.5">
                            {m.stalenessDays}d stale
                            {m.stalenessDays > 90 ? (
                              <AlertTriangle className="inline h-3 w-3 ml-0.5 text-amber-400" />
                            ) : null}
                          </span>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="px-3 py-3 align-top text-right font-mono">
                      ${m.unitPriceUSD.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 align-top text-right font-mono font-medium">
                      ${m.totalCostUSD.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      <span
                        className={
                          longLead
                            ? "inline-flex items-center gap-1 text-amber-400 font-mono text-xs"
                            : "text-muted-foreground font-mono text-xs"
                        }
                      >
                        {longLead && <AlertTriangle className="h-3 w-3" />}
                        {m.leadTimeWeeks}w
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <SubCard label="Reagents" value={subtotals.Reagent} />
        <SubCard label="Equipment" value={subtotals.Equipment} />
        <SubCard label="Consumables" value={subtotals.Consumable} />
        <SubCard label="Total" value={total} highlight />
      </div>
    </div>
  );
}

function Th({
  label,
  onClick,
  align = "left",
}: {
  label: string;
  onClick?: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      {onClick ? (
        <button
          onClick={onClick}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {label}
          <ArrowUpDown className="h-3 w-3" />
        </button>
      ) : (
        label
      )}
    </th>
  );
}

function SubCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card/40"}`}
      data-print-card
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p
        className={`font-display font-semibold ${highlight ? "text-2xl text-gradient" : "text-xl"}`}
      >
        ${value.toLocaleString()}
      </p>
    </div>
  );
}
