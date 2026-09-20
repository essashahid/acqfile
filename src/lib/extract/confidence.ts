import { ROUTING_THRESHOLDS } from "@/lib/config";
import type { Candidate, Scored, Validation, Verdict } from "./candidate";
import { agreement } from "./values";
const round = (n: number) => Math.round(n * 10000) / 10000;
export const support = (status: Verdict["status"]) => (status === "supported" ? 1 : status === "partially_supported" ? 0.5 : 0);
/** A39: confidence and routing computed in code, never taken from a model's self-report. */
export function score(candidate: Candidate, validation: Validation, verdict: Verdict | null): Scored {
  const reasons: string[] = validation.messages.map((m) => m.code);
  const thresholds = ROUTING_THRESHOLDS;
  if (candidate.method === "acroform") {
    const ok = candidate.mapped && validation.score === 1;
    return { attribute: candidate.attribute, method: "acroform", confidence: ok ? 1 : validation.score, components: { mapping_known: candidate.mapped ? 1 : 0, deterministic_validation: validation.score }, routing: !validation.locators_ok ? "blocked" : ok ? "auto_accepted" : "review", reasons };
  }
  const v = verdict ?? { status: "unsupported" as const, corrected_value: null, contradiction: false, specificity: 0, reason: "No verification" };
  const corrected = v.corrected_value === null && v.status === "supported" ? candidate.value : v.corrected_value;
  const components: Record<string, number> = candidate.method === "text"
    ? { exact_evidence: validation.exact, deterministic_validation: validation.score, verifier_support: support(v.status), cross_pass_agreement: agreement(candidate.value, corrected), evidence_specificity: Math.min(1, Math.max(0, v.specificity)) }
    : { dual_read_agreement: agreement(candidate.value, candidate.second_read) === 1 ? 1 : 0, deterministic_validation: validation.score, verifier_support: support(v.status), evidence_specificity: Math.min(1, Math.max(0, v.specificity)) };
  const confidence = round(candidate.method === "text"
    ? 0.3 * components.exact_evidence! + 0.2 * components.deterministic_validation! + 0.25 * components.verifier_support! + 0.15 * components.cross_pass_agreement! + 0.1 * components.evidence_specificity!
    : 0.35 * components.dual_read_agreement! + 0.25 * components.deterministic_validation! + 0.3 * components.verifier_support! + 0.1 * components.evidence_specificity!);
  let routing: Scored["routing"];
  if (!validation.locators_ok) { routing = "blocked"; reasons.push("unknown_locator"); }
  else if (candidate.method === "text" && validation.exact === 0) { routing = "blocked"; reasons.push("unsupported_evidence"); }
  else if (v.status === "unsupported") { routing = "blocked"; reasons.push("verifier_unsupported"); }
  else if (v.contradiction) { routing = "blocked"; reasons.push("contradiction"); }
  else if (confidence < thresholds.review) { routing = "blocked"; reasons.push("below_review_threshold"); }
  else if (candidate.method === "vision") { routing = "review"; reasons.push("vision_never_auto_accepts"); }
  else if (confidence < thresholds.autoAccept || validation.score < 1) { routing = "review"; if (confidence < thresholds.autoAccept) reasons.push("below_auto_accept"); }
  else routing = "auto_accepted";
  if (v.status === "partially_supported" && routing === "auto_accepted") { routing = "review"; reasons.push("partially_supported"); }
  return { attribute: candidate.attribute, method: candidate.method, confidence, components, routing, reasons };
}
/** A39 classification confidence for a classifier proposal, computed from cue agreement, quote verification and the uncertain flag. */
export function classificationConfidence(input: { deterministic: boolean; cueAgrees: boolean | null; quoteFound: boolean; uncertain: boolean }) {
  if (input.deterministic) return 1;
  return round(0.4 * (input.cueAgrees === null ? 0.5 : input.cueAgrees ? 1 : 0) + 0.4 * (input.quoteFound ? 1 : 0) + 0.2 * (input.uncertain ? 0 : 1));
}
