import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, ExternalLink, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface Props {
  hypothesis: string;
  onComplete: () => void;
}

interface Reference {
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi: string;
  relevance: string;
}

const MOCK_REFERENCES: Reference[] = [
  {
    title:
      "Trehalose enhances osmotic stability and post-thaw recovery of mammalian cells without intracellular delivery",
    authors: "Eroglu A, Russo MJ, Bieganski R, et al.",
    journal: "Nature Biotechnology",
    year: 2000,
    doi: "10.1038/72608",
    relevance:
      "Foundational study showing extracellular trehalose alone yields modest viability gains — supports your direct comparison.",
  },
  {
    title:
      "Comparative cryoprotective efficacy of disaccharides versus DMSO in human cell line preservation",
    authors: "Stewart S, He X.",
    journal: "Cryobiology",
    year: 2019,
    doi: "10.1016/j.cryobiol.2019.04.003",
    relevance:
      "Closest prior work — tested sucrose & trehalose vs DMSO in HepG2, not HeLa. Your specific cell line × ≥15pp endpoint is unaddressed.",
  },
  {
    title:
      "Intracellular trehalose loading via genetically engineered transporters improves cryosurvival",
    authors: "Chen T, Acker JP, Eroglu A, et al.",
    journal: "Cell Preservation Technology",
    year: 2021,
    doi: "10.1089/cpt.2021.0014",
    relevance:
      "Adjacent approach (engineered uptake). Differentiates your protocol — you propose a simple substitution, not a transporter system.",
  },
];

export function Stage2Literature({ onComplete }: Props) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const duration = 3000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(() => setDone(true), 200);
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  if (!done) {
    return (
      <div className="rounded-2xl border border-border bg-card/50 backdrop-blur p-10 animate-fade-in">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Library className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">Searching 200M+ papers across PubMed, arXiv, Semantic Scholar…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Embedding hypothesis · matching abstracts · ranking by methodological proximity
            </p>
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
        <div className="flex justify-between mt-3 text-xs text-muted-foreground font-mono">
          <span>{Math.round(progress)}%</span>
          <span>{Math.round((progress / 100) * 207_412_883).toLocaleString()} / 207,412,883 indexed</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Novelty Assessment</h3>
          </div>
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
            🟡 Similar Work Exists
          </Badge>
        </div>
        <p className="text-foreground/90 leading-relaxed">
          Three closely related studies were identified, but none test your <em>exact</em> combination of
          cell line (HeLa), cryoprotectant (trehalose substitution), and quantitative endpoint
          (≥15 percentage point viability improvement vs. 10% DMSO). Your hypothesis is{" "}
          <strong className="text-foreground">methodologically novel</strong> within an active research area —
          ideal positioning for a reproducible, publishable result.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground px-1">
          Top relevant prior work
        </p>
        {MOCK_REFERENCES.map((ref, i) => (
          <a
            key={ref.doi}
            href={`https://doi.org/${ref.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-border bg-card/50 hover:bg-card hover:border-primary/40 transition-all p-5 group animate-fade-in"
            style={{ animationDelay: `${i * 100}ms`, animationFillMode: "backwards" }}
          >
            <div className="flex items-start justify-between gap-4 mb-2">
              <h4 className="font-medium text-foreground/95 leading-snug group-hover:text-primary transition-colors">
                {ref.title}
              </h4>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-muted-foreground mb-1">{ref.authors}</p>
            <p className="text-xs text-muted-foreground font-mono mb-3">
              {ref.journal} · {ref.year} · doi:{ref.doi}
            </p>
            <p className="text-sm text-foreground/80 border-l-2 border-primary/40 pl-3 leading-relaxed">
              {ref.relevance}
            </p>
          </a>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          onClick={onComplete}
          size="lg"
          className="bg-primary-gradient hover:opacity-95 shadow-glow h-12 px-6 rounded-xl group"
        >
          Generate Full Experiment Plan
          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Button>
      </div>
    </div>
  );
}
