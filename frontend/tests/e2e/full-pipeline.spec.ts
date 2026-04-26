import { test, expect } from "@playwright/test";
import { generateMockPlan } from "../../src/lib/plan-generator";

test.describe("Full generate pipeline (mocked live APIs)", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    const hypothesis =
      "Replacing sucrose with trehalose improves post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard DMSO protocol.";
    const plan = generateMockPlan(hypothesis);
    const qc = {
      noveltySignal: "similar_exists" as const,
      noveltyExplanation:
        "E2E mock: related cryopreservation work exists; endpoint combination remains distinct.",
      references: plan.literatureQC.references.slice(0, 2),
      noveltyDiagnostics: {
        version: 1,
        evidenceTier: "close_analog",
        noveltySignal: "similar_exists",
        topRetrievalScore: 0.84,
        topHypothesisOverlap: 0.22,
        topTrigramSimilarity: 0.17,
        topCombinedEvidence: 0.46,
        protocolToPacketAlignment: 0.12,
        rerankMethod: "e2e_mock",
        hasProtocolRepositoryHit: true,
        hasVendorOrResourceHit: false,
        rulesTriggered: [
          "E2E: high score + overlap → close analog (not duplicate protocol proof).",
        ],
        signalAlignmentNote: "E2E mock: similar_exists aligns with close_analog tier.",
        perReference: plan.literatureQC.references.slice(0, 2).map((r, i) => ({
          index: i,
          title: r.title,
          url: "#",
          retrievalScore: 0.82 - i * 0.02,
          hypothesisTokenOverlap: 0.2,
          hostKind: i === 0 ? "protocol_repository" : "peer_literature",
        })),
      },
    };
    const scientificMechanistic = {
      version: 1,
      disclaimer: "E2E mock mechanistic validation (not clinical advice).",
      concentrations: [{ value: 0.5, unit: "mg/l", raw: "0.5 mg/L" }],
      assayCompatibility: [
        {
          claim: "0.5 mg/L",
          assayClass: "CRP / inflammation immunoassay",
          benchmark: { min: 0.03, max: 2, note: "ELISA-class band" },
          passesHeuristic: true,
          detail: "Within plausible ELISA-sensitive band for demo.",
        },
      ],
      powerSketch: {
        effect: { delta: 0.15, kind: "absolute_pp" },
        recommendedNPerGroup: 12,
        reportedMeetsHeuristic: true,
        note: "E2E mock power sketch.",
      },
      protocolEvidence: { stepsAnnotated: 9 },
    };

    await page.route("**/api/literature-qc", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(qc),
      });
    });

    await page.route("**/api/experiment-plan", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = {
        version: 1,
        requestId: "e2e-mock",
        tenantId: "default",
        plan,
        modelFlow: {
          planningModel: "mock:e2e",
          retrievalModel: "mock",
          retrievalOutlineUsed: false,
        },
        feedbackSummary: {
          priorFeedbackCount: 0,
          feedbackMatch: {
            method: "ontology_tags + keyword_cosine + domain",
            ontologyTags: ["cell_culture"],
            similarReviewCount: 0,
          },
          appliedHighlights: [],
          incorporationReport: [],
          feedbackLearningReport: {
            version: 1,
            enabled: false,
            reason: "no_prior_reviews_in_prompt",
          },
        },
        qualityChecks: {
          scoreOutOf10: 8.5,
          gatesPassed: true,
          dimensions: { completeness: 8.5, evidenceGrounding: 8.5, operationalRealism: 8.5 },
          evidenceCoverage: {},
          warnings: [],
          errors: [],
        },
        executionReadiness: {
          version: 1,
          scoreOutOf10: 8.4,
          tier: "pilot_ready",
          headline: "E2E mock: pilot-ready — resolve checklist items before full procurement.",
          checklist: [
            { id: "qc_gates", ok: true, detail: "Automated quality gates passed." },
            { id: "protocol_granularity", ok: true, detail: "6+ protocol steps." },
            { id: "materials_breadth", ok: true, detail: "8+ material lines." },
          ],
          summary: {
            passedChecks: 10,
            totalChecks: 12,
            protocolSteps: 9,
            materialLines: 10,
            validatedSourceSections: 4,
          },
        },
        scientificMechanistic,
        metadata: { generatedAt: new Date().toISOString(), generationLatencyMs: 1 },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
  });

  test("advances Stage 1 → Literature QC → Plan (mocked)", async ({ page }) => {
    const hypothesis =
      "Replacing sucrose with trehalose improves post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard DMSO protocol.";
    await page.goto(`/generate?h=${encodeURIComponent(hypothesis)}`);
    await expect(page.getByText(hypothesis)).toBeVisible();
    await page.getByTestId("stage1-run-lit-qc").click();
    await expect(page.getByRole("heading", { name: /novelty assessment/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Evidence classification")).toBeVisible();
    await page.getByTestId("stage2-generate-plan").click();
    await expect(page.getByTestId("plan-ready-header")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("mechanistic-validation-panel")).toBeVisible();
    await expect(page.getByTestId("execution-readiness-panel")).toBeVisible();
  });
});
