import type { FullPlan, PlanVerificationSection } from "@/types/plan";
import { VERIFY_BLOCK_STYLE } from "@/lib/planAccents";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  plan: FullPlan;
  section: PlanVerificationSection;
}

export function VerificationSourcesBlock({ plan, section }: Props) {
  const items = plan.verificationSources?.[section];
  if (!items?.length) return null;

  const st = VERIFY_BLOCK_STYLE[section];

  return (
    <div className={cn("rounded-xl border p-4 mb-6", st.box)} data-print-card>
      <p className={cn("text-xs font-semibold uppercase tracking-widest mb-1", st.kicker)}>
        Web source cross-check (Tavily)
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
              className={cn("font-medium underline-offset-2 hover:underline break-words", st.link)}
            >
              <span className="align-middle">{s.title}</span>
              <ExternalLink
                className="h-3.5 w-3.5 align-middle inline-block opacity-70 ml-0.5 shrink-0"
                data-print-hide
                aria-hidden
              />
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
