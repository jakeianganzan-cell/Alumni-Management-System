import type { TracerFormValues } from "./tracer-form-types";

interface TracerPayloadRecord {
  ched_payload?: TracerFormValues | null;
}

export const selectTracerFormPayload = (
  submission: TracerPayloadRecord | null | undefined,
  draft: TracerPayloadRecord | null | undefined,
) => {
  if (draft?.ched_payload && typeof draft.ched_payload === "object") {
    return draft.ched_payload;
  }

  if (submission?.ched_payload && typeof submission.ched_payload === "object") {
    return submission.ched_payload;
  }

  return null;
};
