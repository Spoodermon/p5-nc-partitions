import { annularKrewerasComplement, annularPermutationToString, type AnnularPermutation, type RandomSource } from "../math";
import { routeAnnularPermutation } from "../geometry/annular-routing";
import { annularRoutingFailureMessage, processAnnularInput, type AcceptedAnnularInput, type AnnularInputInterpretation } from "./annularController";
import { routeAwareRandomAnnularPermutation, type AnnularRandomMode } from "./randomAnnular";

export type AnnularTask =
  | { readonly kind: "input"; readonly p: string; readonly q: string; readonly notation: string; readonly interpretation: AnnularInputInterpretation }
  | { readonly kind: "complement"; readonly permutation: AnnularPermutation }
  | { readonly kind: "random"; readonly p: number; readonly q: number; readonly mode: AnnularRandomMode; readonly singletonCycles: "allow" | "forbid" };

export type AnnularTaskResult =
  | { readonly ok: true; readonly accepted: AcceptedAnnularInput; readonly message?: string }
  | { readonly ok: false; readonly message: string };

/** Executed in a worker; all mathematical and resource governors remain in force. */
export function executeAnnularTask(
  task: AnnularTask,
  progress: (message: string) => void = () => {},
  random: RandomSource = Math.random,
): AnnularTaskResult {
  if (task.kind === "random") {
    let attempts = 0;
    const generated = routeAwareRandomAnnularPermutation(task.p, task.q, task.mode, random, (permutation) => {
      progress(`Routing random ANC — attempt ${++attempts} of 4…`);
      return routeAnnularPermutation(permutation);
    }, { singletonCycles: task.singletonCycles });
    const qualifier = task.singletonCycles === "forbid" ? " singleton-free" : "";
    if (!generated.ok) return {
      ok: false,
      message: generated.lastFailure
        ? `${annularRoutingFailureMessage(generated.lastFailure)} Random ANC tried ${generated.attempts} bounded connected${qualifier} candidates; the previous diagram was retained.`
        : `No distinct connected${qualifier} random ANC candidate could be generated; the previous diagram was retained.`,
    };
    const notation = annularPermutationToString(generated.permutation);
    const distribution = generated.density[0]?.toUpperCase() + generated.density.slice(1);
    const message = generated.usedMinimalFallback
      ? `Showing ${distribution} minimal connected${qualifier} fallback after ${generated.attempts} bounded attempts.`
      : generated.usedSparseFallback
        ? `Showing ${distribution}${qualifier} fallback after ${generated.attempts} bounded attempts.`
        : `Showing ${distribution} connected${qualifier} ANC after ${generated.attempts} bounded attempt${generated.attempts === 1 ? "" : "s"}.`;
    return { ok: true, message, accepted: {
      ok: true, permutation: generated.permutation, routed: generated.routed,
      interpretation: "strict-permutation", sourceNotation: notation, resolvedNotation: notation,
      canonicalNotation: notation, wasAutoOriented: false,
    } };
  }
  const complement = task.kind === "complement" ? annularKrewerasComplement(task.permutation) : null;
  const input = task.kind === "input" ? task : {
    p: String(complement!.p), q: String(complement!.q),
    notation: annularPermutationToString(complement!), interpretation: "strict-permutation" as const,
  };
  progress(input.interpretation === "canonical-blocks" ? "Finding a canonical orientation…" : "Checking permutation…");
  const result = processAnnularInput(input.p, input.q, input.notation, (permutation) => {
    progress(task.kind === "complement" ? "Routing complement…" : "Routing diagram…");
    return routeAnnularPermutation(permutation);
  }, input.interpretation);
  return result.ok ? { ok: true, accepted: result } : { ok: false, message: result.error.message };
}
