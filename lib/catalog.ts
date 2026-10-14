import catalogJson from "@/data/catalog.json";

export interface Service {
  id: string;
  name: string;
  description: string;
  billing: "one_off" | "monthly";
  price: number;
  allowed_months?: number[];
  deliverables: string[];
  kpis: string[];
  duration_weeks?: number;
}

export interface Selection { service_id: string; months?: number; }
export interface PricedLine { service: Service; months: number | null; total: number; }

export const catalog = catalogJson as { currency: string; services: Service[] };

export function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: catalog.currency, maximumFractionDigits: 0 }).format(n);
}

/**
 * The pricing control from slide 6: the AI only chooses service IDs (and a term
 * from the allowed list). Unknown IDs are rejected; every number comes from the catalogue.
 */
export function priceSelections(selections: Selection[]): { lines: PricedLine[]; total: number; rejected: string[] } {
  const lines: PricedLine[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const sel of selections) {
    const service = catalog.services.find((s) => s.id === sel.service_id);
    if (!service || seen.has(service.id)) { rejected.push(sel.service_id); continue; }
    seen.add(service.id);
    if (service.billing === "monthly") {
      const allowed = service.allowed_months ?? [3];
      const months = allowed.includes(Number(sel.months)) ? Number(sel.months) : allowed[0];
      lines.push({ service, months, total: service.price * months });
    } else {
      lines.push({ service, months: null, total: service.price });
    }
  }
  return { lines, total: lines.reduce((a, l) => a + l.total, 0), rejected };
}

export function investmentText(lines: PricedLine[], total: number): string {
  const rows = lines.map((l) =>
    l.months
      ? `• ${l.service.name}: ${money(l.service.price)}/month × ${l.months} months = ${money(l.total)}`
      : `• ${l.service.name}: ${money(l.total)} (one-off)`,
  );
  return `${rows.join("\n")}\n\nTotal investment: ${money(total)}`;
}
