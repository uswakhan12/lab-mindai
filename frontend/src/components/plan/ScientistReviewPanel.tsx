import { useState } from "react";
import type { FullPlan } from "@/types/plan";
import {
  type Review,
  type ReviewSection,
  saveReview,
  saveReviewToBackend,
  cryptoRandomId,
} from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageSquare, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SECTIONS: ReviewSection[] = ["protocol", "materials", "budget", "timeline", "validation"];
const ISSUE_OPTIONS = [
  "Too generic",
  "Wrong concentrations",
  "Unrealistic timeline",
  "Missing steps",
  "Wrong supplier",
  "Cost too high/low",
  "Other",
];
const EXPERTISE = ["PhD Student", "Postdoc", "PI", "Industry Scientist", "CRO Specialist"];

export function ScientistReviewPanel({ plan, hypothesis }: { plan: FullPlan; hypothesis: string }) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ratings, setRatings] = useState<Record<ReviewSection, number>>({
    protocol: 0,
    materials: 0,
    budget: 0,
    timeline: 0,
    validation: 0,
  });
  const [issues, setIssues] = useState<Record<ReviewSection, string>>({
    protocol: "",
    materials: "",
    budget: "",
    timeline: "",
    validation: "",
  });
  const [corrections, setCorrections] = useState<Record<ReviewSection, string>>({
    protocol: "",
    materials: "",
    budget: "",
    timeline: "",
    validation: "",
  });
  const [overall, setOverall] = useState(0);
  const [expertise, setExpertise] = useState("");

  const submit = async () => {
    const r: Review = {
      id: cryptoRandomId(),
      timestamp: new Date().toISOString(),
      hypothesis,
      domain: plan.domain,
      hypothesisKeywords: hypothesis
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .slice(0, 8),
      ratings,
      issues,
      corrections,
      overallRating: overall,
      reviewerExpertise: expertise,
      originalPlanSummary: plan.experimentPlan.title,
    };
    saveReview(r);
    try {
      await saveReviewToBackend(r);
      setSubmitted(true);
      toast.success("Review saved to shared store — future plans will use this feedback.");
    } catch {
      setSubmitted(true);
      toast.success(
        "Review saved locally. Backend save failed, but your current device still learned.",
      );
    }
  };

  if (submitted) {
    return (
      <div
        className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center"
        data-print-hide
      >
        <Check className="h-8 w-8 text-emerald-400 mx-auto mb-3" />
        <p className="font-medium text-emerald-100">
          Your feedback has been saved and will improve future plans for similar experiments.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full h-14"
        data-print-hide
      >
        <MessageSquare className="h-4 w-4 mr-2" />
        🔬 Leave Expert Review
      </Button>
    );
  }

  return (
    <div
      className="rounded-xl border border-border bg-card/50 backdrop-blur p-6 space-y-5"
      data-print-hide
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg text-lab-violet light:text-violet-900">Scientist Review</h3>
          <p className="text-sm text-violet-200/90 light:text-violet-800/90">
            Your corrections train future plans in this domain.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setOpen(false)}
          aria-label="Minimize review form"
        >
          <ChevronDown className="h-4 w-4" />
          Minimize
        </Button>
      </div>
      {SECTIONS.map((s) => (
        <div key={s} className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium capitalize">{s}</p>
            <Stars value={ratings[s]} onChange={(v) => setRatings({ ...ratings, [s]: v })} />
          </div>
          <select
            value={issues[s]}
            onChange={(e) => setIssues({ ...issues, [s]: e.target.value })}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="">What's wrong? (optional)</option>
            {ISSUE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <Textarea
            placeholder="What should it say instead?"
            value={corrections[s]}
            onChange={(e) => setCorrections({ ...corrections, [s]: e.target.value })}
            className="min-h-[60px] text-sm"
          />
        </div>
      ))}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm">Overall</span>
          <Stars value={overall} onChange={setOverall} />
        </div>
        <select
          value={expertise}
          onChange={(e) => setExpertise(e.target.value)}
          className="bg-input border border-border rounded-md px-3 py-2 text-sm"
        >
          <option value="">Your expertise</option>
          {EXPERTISE.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      <Button
        onClick={() => void submit()}
        className="w-full btn-cta"
        disabled={overall === 0}
      >
        Submit Review
      </Button>
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} type="button">
          <Star
            className={cn(
              "h-4 w-4 transition-colors",
              n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
            )}
          />
        </button>
      ))}
    </div>
  );
}
