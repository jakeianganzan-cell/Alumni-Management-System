import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TracerSectionDProps } from "./tracer-form-types";

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

function RadioGroup({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label key={option} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} className="h-4 w-4" />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-navy-dark">{label}</Label>
      <div className="grid gap-3 md:grid-cols-2">
        {options.map((option) => (
          <label key={option} className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm">
            <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} className="mt-1 h-4 w-4" />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function SectionD({ form, errors, setField, toggleArrayValue, addTableRow, removeTableRow, updateTableRow, onBack, onSubmit, submitting, hasExistingResponse, options }: TracerSectionDProps) {
  const isEmployed = form.presentlyEmployed === "Employed";
  const isNotEmployed = form.presentlyEmployed === "Not Employed" || form.presentlyEmployed === "Never Employed";
  const showCurrentJobOnly = isEmployed;
  const showFirstJobBranch = isEmployed && form.firstJobAfterCollege !== "";
  const showAcceptingReasons = showFirstJobBranch && form.firstJobRelatedToCourse === "Yes";
  const showCompetencies = showCurrentJobOnly && form.curriculumRelevantToFirstJob === "Yes";

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-navy-dark">D. Employment Data</h2>
        <p className="mt-1 text-sm text-muted-foreground">Employment status, first-job outcomes, curriculum relevance, and alumni referrals.</p>
      </div>

      <Field label="16. Employment Status" error={errors.presentlyEmployed} required>
        <RadioGroup name="presentlyEmployed" options={["Employed", "Not Employed", "Never Employed"]} value={form.presentlyEmployed} onChange={(value) => setField("presentlyEmployed", value)} />
      </Field>

      {isNotEmployed ? (
        <>
          <CheckboxGroup label="17. Reason(s) why you are not yet employed" options={options.unemploymentReasons} selected={form.unemploymentReasons} onToggle={(value) => toggleArrayValue("unemploymentReasons", value)} />
          <Field label="17. Other reason(s), please specify" error={errors.unemploymentReasonsOther}>
            <Input value={form.unemploymentReasonsOther} onChange={(event) => setField("unemploymentReasonsOther", event.target.value)} />
          </Field>
        </>
      ) : null}

      {showCurrentJobOnly ? (
        <>
          <Field label="18. Present Employment Status" error={errors.presentEmploymentStatus} required>
            <RadioGroup name="presentEmploymentStatus" options={options.employmentStatuses} value={form.presentEmploymentStatus} onChange={(value) => setField("presentEmploymentStatus", value)} />
          </Field>

          {form.presentEmploymentStatus === "Self-employed" ? (
            <Field label="18. If self-employed, what skills acquired in college were you able to apply?" error={errors.selfEmployedSkills} required>
              <Textarea value={form.selfEmployedSkills} onChange={(event) => setField("selfEmployedSkills", event.target.value)} rows={3} />
            </Field>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="19. Present Occupation" error={errors.presentOccupation} required>
              <Input value={form.presentOccupation} onChange={(event) => setField("presentOccupation", event.target.value)} />
            </Field>
            <Field label="20. Major Line of Business / Industry" error={errors.industry} required>
              <select value={form.industry} onChange={(event) => setField("industry", event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select industry</option>
                {options.businessLines.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Company / Organization Name and Address" error={errors.companyNameAddress}>
            <Textarea value={form.companyNameAddress} onChange={(event) => setField("companyNameAddress", event.target.value)} rows={3} />
          </Field>

          <Field label="21. Place of Work" error={errors.workLocation} required>
            <RadioGroup
              name="workLocation"
              options={options.workLocations.filter(Boolean)}
              value={form.workLocation}
              onChange={(value) => setField("workLocation", value)}
            />
          </Field>

          <Field label="22. Is this your first job after college?" error={errors.firstJobAfterCollege} required>
            <RadioGroup name="firstJobAfterCollege" options={["Yes", "No"]} value={form.firstJobAfterCollege} onChange={(value) => setField("firstJobAfterCollege", value)} />
          </Field>

          {showFirstJobBranch ? (
            <>
              {form.firstJobAfterCollege === "Yes" ? (
                <>
                  <CheckboxGroup label="23. What are your reason(s) for staying on the job?" options={options.stayingReasons} selected={form.reasonsForStaying} onToggle={(value) => toggleArrayValue("reasonsForStaying", value)} />
                  <Field label="23. Other reason(s), please specify" error={errors.reasonsForStayingOther}>
                    <Input value={form.reasonsForStayingOther} onChange={(event) => setField("reasonsForStayingOther", event.target.value)} />
                  </Field>
                </>
              ) : null}

              <Field label="24. Is your first job related to the course you took up in college?" error={errors.firstJobRelatedToCourse} required>
                <RadioGroup name="firstJobRelatedToCourse" options={["Yes", "No"]} value={form.firstJobRelatedToCourse} onChange={(value) => setField("firstJobRelatedToCourse", value)} />
              </Field>

              {showAcceptingReasons ? (
                <>
                  <CheckboxGroup label="25. What were your reasons for accepting the job?" options={options.acceptingReasons} selected={form.reasonsForAcceptingJob} onToggle={(value) => toggleArrayValue("reasonsForAcceptingJob", value)} />
                  <Field label="25. Other reason(s), please specify" error={errors.reasonsForAcceptingJobOther}>
                    <Input value={form.reasonsForAcceptingJobOther} onChange={(event) => setField("reasonsForAcceptingJobOther", event.target.value)} />
                  </Field>
                </>
              ) : null}

              {form.firstJobAfterCollege === "No" || form.firstJobRelatedToCourse === "No" ? (
                <>
                  <CheckboxGroup label="26. What were your reason(s) for changing job?" options={options.changingReasons} selected={form.reasonsForChangingJob} onToggle={(value) => toggleArrayValue("reasonsForChangingJob", value)} />
                  <Field label="26. Other reason(s), please specify" error={errors.reasonsForChangingJobOther}>
                    <Input value={form.reasonsForChangingJobOther} onChange={(event) => setField("reasonsForChangingJobOther", event.target.value)} />
                  </Field>
                </>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="27. How long did you stay in your first job?" error={errors.firstJobDuration} required>
                  <select value={form.firstJobDuration} onChange={(event) => setField("firstJobDuration", event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Select duration</option>
                    {options.durationOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="27. Others, please specify" error={errors.firstJobDurationOther}>
                  <Input value={form.firstJobDurationOther} onChange={(event) => setField("firstJobDurationOther", event.target.value)} />
                </Field>
              </div>

              <CheckboxGroup label="28. How did you find your first job?" options={options.findingWays} selected={form.firstJobFindingWays} onToggle={(value) => toggleArrayValue("firstJobFindingWays", value)} />
              <Field label="28. Others, please specify" error={errors.firstJobFindingWaysOther}>
                <Input value={form.firstJobFindingWaysOther} onChange={(event) => setField("firstJobFindingWaysOther", event.target.value)} />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="29. How long did it take you to land your first job?" error={errors.timeToLandFirstJob} required>
                  <select value={form.timeToLandFirstJob} onChange={(event) => setField("timeToLandFirstJob", event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Select timeline</option>
                    {options.timeToJobOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="29. Others, please specify" error={errors.timeToLandFirstJobOther}>
                  <Input value={form.timeToLandFirstJobOther} onChange={(event) => setField("timeToLandFirstJobOther", event.target.value)} />
                </Field>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-navy-dark">30. Job Level Position</Label>
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-navy-dark">Job Level</th>
                        <th className="px-4 py-3 text-left font-semibold text-navy-dark">30.1 First Job</th>
                        <th className="px-4 py-3 text-left font-semibold text-navy-dark">30.2 Current or Present Job</th>
                      </tr>
                    </thead>
                    <tbody>
                      {options.jobLevels.filter(Boolean).map((option) => (
                        <tr key={option} className="border-t border-slate-200">
                          <td className="px-4 py-3" data-label="Job Level">{option}</td>
                          <td className="px-4 py-3" data-label="30.1 First Job">
                            <input type="radio" name="jobLevelFirstJob" checked={form.jobLevelFirstJob === option} onChange={() => setField("jobLevelFirstJob", option)} className="h-4 w-4" />
                          </td>
                          <td className="px-4 py-3" data-label="30.2 Current or Present Job">
                            <input type="radio" name="jobLevelCurrentJob" checked={form.jobLevelCurrentJob === option} onChange={() => setField("jobLevelCurrentJob", option)} className="h-4 w-4" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {errors.jobLevelFirstJob ? <p className="text-xs text-rose-600">{errors.jobLevelFirstJob}</p> : null}
                {errors.jobLevelCurrentJob ? <p className="text-xs text-rose-600">{errors.jobLevelCurrentJob}</p> : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="31. Initial Gross Monthly Earning" error={errors.initialGrossMonthlyEarning} required>
                  <RadioGroup name="initialGrossMonthlyEarning" options={options.incomeRanges} value={form.initialGrossMonthlyEarning} onChange={(value) => setField("initialGrossMonthlyEarning", value)} />
                </Field>
                <Field label="32. Was the curriculum you had in college relevant to your first job?" error={errors.curriculumRelevantToFirstJob} required>
                  <RadioGroup
                    name="curriculumRelevantToFirstJob"
                    options={["Yes", "No"]}
                    value={form.curriculumRelevantToFirstJob}
                    onChange={(value) => setField("curriculumRelevantToFirstJob", value)}
                  />
                </Field>
              </div>

              {showCompetencies ? (
                <>
                  <CheckboxGroup label="33. What competencies learned in college did you find very useful in your first job?" options={options.competencies} selected={form.usefulCompetencies} onToggle={(value) => toggleArrayValue("usefulCompetencies", value)} />
                  <Field label="33. Other skills, please specify" error={errors.usefulCompetenciesOther}>
                    <Input value={form.usefulCompetenciesOther} onChange={(event) => setField("usefulCompetenciesOther", event.target.value)} />
                  </Field>
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      <Field label="34. Suggestions to further improve your course curriculum" error={errors.curriculumSuggestions}>
        <Textarea value={form.curriculumSuggestions} onChange={(event) => setField("curriculumSuggestions", event.target.value)} rows={5} />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-navy-dark">Alumni Referrals</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => addTableRow("referrals")}>
            <Plus className="mr-1 h-4 w-4" />
            Add Referral
          </Button>
        </div>
        <div className="space-y-3">
          {form.referrals.map((row, index) => (
            <div key={`referral-${index}`} className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-navy-dark">Referral #{index + 1}</p>
                {form.referrals.length > 1 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeTableRow("referrals", index)}>
                    <Minus className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Name">
                  <Input value={row.name} onChange={(event) => updateTableRow("referrals", index, "name", event.target.value)} />
                </Field>
                <Field label="Address">
                  <Input value={row.address} onChange={(event) => updateTableRow("referrals", index, "address", event.target.value)} />
                </Field>
                <Field label="Contact Number">
                  <Input value={row.contactNumber} onChange={(event) => updateTableRow("referrals", index, "contactNumber", event.target.value)} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Saving..." : hasExistingResponse ? "Update CHED Tracer Form" : "Submit CHED Tracer Form"}
        </Button>
      </div>
    </section>
  );
}
