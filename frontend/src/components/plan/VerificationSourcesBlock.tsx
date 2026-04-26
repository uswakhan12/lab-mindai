import type { FullPlan, PlanVerificationSection } from "@/types/plan";
import { ExternalLink } from "lucide-react";

interface Props {
  plan: FullPlan;
  section: PlanVerificationSection;
}

export function VerificationSourcesBlock({ plan, section }: Props) {
  const items = plan.verificationSources?.[section];
  if (!items?.length) return null;

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 mb-6" data-print-card>
      <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
        Verify this section (Tavily)
      </p>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        Independent web results to sanity-check catalog choices, cost context, timelines, QC norms,
        and safety docs before you commit budget or bench time.
      </p>
      <ul className="space-y-3">
        {items.map((s, i) => (
          <li key={`${s.url}-${i}`} className="text-sm">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline break-words"
            >
              <span className="min-w-0">{s.title}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </a>
            {s.validationStatus || typeof s.confidence === "number" ? (
              <p className="text-xs mt-1">
                <span
                  className={
                    s.validationStatus === "validated" ? "text-emerald-400" : "text-amber-400"
                  }
                >
                  {s.validationStatus === "validated"
                    ? "Llama 8B validated"
                    : "Llama 8B weak match"}
                </span>
                {typeof s.confidence === "number" ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · confidence {(s.confidence * 100).toFixed(0)}%
                  </span>
                ) : null}
              </p>
            ) : null}
            {s.snippet ? (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-3 leading-relaxed">
                {s.snippet}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
