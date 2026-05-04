import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CIVIL_STATUS_OPTIONS, REGION_OPTIONS, RESIDENCE_TYPE_OPTIONS, SEX_OPTIONS, type TracerSectionProps } from "./tracer-form-types";

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

export default function SectionA({ form, errors, setField, onNext }: TracerSectionProps) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-navy-dark">A. General Information</h2>
        <p className="mt-1 text-sm text-muted-foreground">Core respondent information required for the CHED Graduate Tracer Survey.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="1. Full Name" error={errors.fullName} required>
          <Input value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} />
        </Field>
        <Field label="3. E-mail Address" error={errors.email} required>
          <Input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} />
        </Field>
      </div>

      <Field label="2. Permanent Address" error={errors.permanentAddress} required>
        <Input value={form.permanentAddress} onChange={(event) => setField("permanentAddress", event.target.value)} />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="4. Telephone or Contact Number(s)" error={errors.telephoneNumber}>
          <Input value={form.telephoneNumber} onChange={(event) => setField("telephoneNumber", event.target.value)} />
        </Field>
        <Field label="5. Mobile Number" error={errors.mobileNumber} required>
          <Input value={form.mobileNumber} onChange={(event) => setField("mobileNumber", event.target.value)} />
        </Field>
      </div>

      <Field label="6. Civil Status" error={errors.civilStatus} required>
        <RadioGroup name="civilStatus" options={CIVIL_STATUS_OPTIONS} value={form.civilStatus} onChange={(value) => setField("civilStatus", value)} />
      </Field>

      <Field label="7. Sex" error={errors.sex} required>
        <RadioGroup name="sex" options={SEX_OPTIONS} value={form.sex} onChange={(value) => setField("sex", value)} />
      </Field>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="8. Birthday - Month" error={errors.birthdayMonth} required>
          <Input value={form.birthdayMonth} onChange={(event) => setField("birthdayMonth", event.target.value)} placeholder="MM" />
        </Field>
        <Field label="8. Birthday - Day" error={errors.birthdayDay} required>
          <Input value={form.birthdayDay} onChange={(event) => setField("birthdayDay", event.target.value)} placeholder="DD" />
        </Field>
        <Field label="8. Birthday - Year" error={errors.birthdayYear} required>
          <Input value={form.birthdayYear} onChange={(event) => setField("birthdayYear", event.target.value)} placeholder="YYYY" />
        </Field>
      </div>

      <Field label="9. Region of Origin" error={errors.regionOfOrigin} required>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {REGION_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <input type="radio" name="regionOfOrigin" value={option} checked={form.regionOfOrigin === option} onChange={() => setField("regionOfOrigin", option)} className="h-4 w-4" />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="10. Province" error={errors.province} required>
          <Input value={form.province} onChange={(event) => setField("province", event.target.value)} />
        </Field>
        <Field label="11. Location of Residence" error={errors.residenceType} required>
          <RadioGroup
            name="residenceType"
            options={RESIDENCE_TYPE_OPTIONS.filter(Boolean)}
            value={form.residenceType}
            onChange={(value) => setField("residenceType", value)}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onNext}>
          Next
        </Button>
      </div>
    </section>
  );
}
