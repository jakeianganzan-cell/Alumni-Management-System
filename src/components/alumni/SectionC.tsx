import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADVANCE_STUDY_REASON_OPTIONS, type TracerSectionProps } from "./tracer-form-types";

function Field({ label, error, required = false, children }: { label: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-navy-dark">
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

export default function SectionC({ form, errors, setField, toggleArrayValue, addTableRow, removeTableRow, updateTableRow, onBack, onNext }: TracerSectionProps) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-navy-dark">C. Training(s) / Advance Studies Attended After College</h2>
        <p className="mt-1 text-sm text-muted-foreground">Professional trainings and reasons for pursuing advance studies.</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-navy-dark">15a. Trainings / Advance Studies</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => addTableRow("trainings")}>
            <Plus className="mr-1 h-4 w-4" />
            Add Row
          </Button>
        </div>
        <div className="space-y-3">
          {form.trainings.map((row, index) => (
            <div key={`training-${index}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-navy-dark">Training #{index + 1}</p>
                {form.trainings.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeTableRow("trainings", index)}>
                    <Minus className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Title">
                  <Input value={row.title} onChange={(event) => updateTableRow("trainings", index, "title", event.target.value)} />
                </Field>
                <Field label="Duration/Credits">
                  <Input value={row.durationCredits} onChange={(event) => updateTableRow("trainings", index, "durationCredits", event.target.value)} />
                </Field>
                <Field label="Institution">
                  <Input value={row.institution} onChange={(event) => updateTableRow("trainings", index, "institution", event.target.value)} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium text-navy-dark">15b. What made you pursue advance studies?</Label>
        <div className="grid gap-3 md:grid-cols-3">
          {ADVANCE_STUDY_REASON_OPTIONS.map((option) => (
            <label key={option} className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm">
              <input
                type="checkbox"
                checked={form.advanceStudyReason === option}
                onChange={() => setField("advanceStudyReason", form.advanceStudyReason === option ? "" : option)}
                className="mt-1 h-4 w-4"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <Field label="15b. Others, please specify" error={errors.advanceStudyReasonOther}>
          <Input value={form.advanceStudyReasonOther} onChange={(event) => setField("advanceStudyReasonOther", event.target.value)} />
        </Field>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onNext}>
          Next
        </Button>
      </div>
    </section>
  );
}
