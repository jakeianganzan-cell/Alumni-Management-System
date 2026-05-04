import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COURSE_REASON_OPTIONS, type TracerSectionProps } from "./tracer-form-types";

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

export default function SectionB({ form, errors, setField, toggleArrayValue, addTableRow, removeTableRow, updateTableRow, onBack, onNext }: TracerSectionProps) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-navy-dark">B. Educational Background</h2>
        <p className="mt-1 text-sm text-muted-foreground">Educational attainment, professional examinations, and reasons for taking the degree.</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-navy-dark">12. Educational Attainment</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => addTableRow("educationalAttainments")}>
            <Plus className="mr-1 h-4 w-4" />
            Add Row
          </Button>
        </div>
        <div className="space-y-3">
          {form.educationalAttainments.map((row, index) => (
            <div key={`education-${index}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-navy-dark">Educational Attainment #{index + 1}</p>
                {form.educationalAttainments.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeTableRow("educationalAttainments", index)}>
                    <Minus className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Degree & Specialization" required={index === 0}>
                  <Input value={row.degreeSpecialization} onChange={(event) => updateTableRow("educationalAttainments", index, "degreeSpecialization", event.target.value)} />
                </Field>
                <Field label="School" required={index === 0}>
                  <Input value={row.school} onChange={(event) => updateTableRow("educationalAttainments", index, "school", event.target.value)} />
                </Field>
                <Field label="Year Graduated" required={index === 0}>
                  <Input value={row.yearGraduated} onChange={(event) => updateTableRow("educationalAttainments", index, "yearGraduated", event.target.value)} />
                </Field>
                <Field label="Honors/Awards">
                  <Input value={row.honorsAwards} onChange={(event) => updateTableRow("educationalAttainments", index, "honorsAwards", event.target.value)} />
                </Field>
              </div>
            </div>
          ))}
        </div>
        {errors.educationalAttainments ? <p className="text-xs text-rose-600">{errors.educationalAttainments}</p> : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-navy-dark">13. Professional Examination(s) Passed</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => addTableRow("professionalExams")}>
            <Plus className="mr-1 h-4 w-4" />
            Add Row
          </Button>
        </div>
        <div className="space-y-3">
          {form.professionalExams.map((row, index) => (
            <div key={`exam-${index}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-navy-dark">Professional Exam #{index + 1}</p>
                {form.professionalExams.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeTableRow("professionalExams", index)}>
                    <Minus className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Exam Name">
                  <Input value={row.examName} onChange={(event) => updateTableRow("professionalExams", index, "examName", event.target.value)} />
                </Field>
                <Field label="Date Taken">
                  <Input value={row.dateTaken} onChange={(event) => updateTableRow("professionalExams", index, "dateTaken", event.target.value)} placeholder="MM/DD/YYYY" />
                </Field>
                <Field label="Rating">
                  <Input value={row.rating} onChange={(event) => updateTableRow("professionalExams", index, "rating", event.target.value)} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-sm font-medium text-navy-dark">14. Reason(s) for taking the course(s) or pursuing degree(s)</Label>
        <div className="grid gap-3 md:grid-cols-2">
          {COURSE_REASON_OPTIONS.map((option) => (
            <label key={option} className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm">
              <input type="checkbox" checked={form.reasonsForCourse.includes(option)} onChange={() => toggleArrayValue("reasonsForCourse", option)} className="mt-1 h-4 w-4" />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <Field label="14. Others, please specify" error={errors.reasonsForCourseOther}>
          <Input value={form.reasonsForCourseOther} onChange={(event) => setField("reasonsForCourseOther", event.target.value)} />
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
