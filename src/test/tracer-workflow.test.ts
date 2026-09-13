import { describe, expect, it } from "vitest";
import { validateTracerPayload } from "../../shared/tracerValidation";
import { selectTracerFormPayload } from "@/components/alumni/tracer-draft";
import { createEmptyTracerForm, type TracerFormValues } from "@/components/alumni/tracer-form-types";

const validTracerForm = (): TracerFormValues => createEmptyTracerForm({
  fullName: "Test Alumni",
  permanentAddress: "Test City",
  email: "tracer@example.test",
  mobileNumber: "+63 912 345 6789",
  civilStatus: "Single",
  sex: "Female",
  birthdayMonth: "January",
  birthdayDay: "15",
  birthdayYear: "2000",
  regionOfOrigin: "Region 10",
  province: "Misamis Oriental",
  residenceType: "City",
  educationalAttainments: [{
    degreeSpecialization: "Bachelor of Science in Information Technology",
    school: "Salay Community College",
    yearGraduated: "2026",
    honorsAwards: "",
  }],
  presentlyEmployed: "Not Employed",
  unemploymentReasons: ["Family concern"],
});

describe("Graduate Tracer workflow validation", () => {
  it("accepts a complete four-section CHED tracer response", () => {
    expect(validateTracerPayload(validTracerForm())).toEqual({});
  });

  it("validates required and invalid Section A identity fields", () => {
    const form = validTracerForm();
    form.fullName = "";
    form.email = "invalid-email";
    form.mobileNumber = "123";
    form.birthdayYear = "26";
    form.birthdayDay = "40";

    const errors = validateTracerPayload(form);
    expect(errors).toMatchObject({
      fullName: expect.any(String),
      email: expect.any(String),
      mobileNumber: expect.any(String),
      birthdayYear: expect.any(String),
      birthdayDay: expect.any(String),
    });
  });

  it("rejects impossible birthdays and future graduation years", () => {
    const form = validTracerForm();
    form.birthdayMonth = "February";
    form.birthdayDay = "31";
    form.educationalAttainments[0].yearGraduated = String(new Date().getFullYear() + 1);

    const errors = validateTracerPayload(form);
    expect(errors.birthdayDay).toBe("Enter a valid birthday date.");
    expect(errors.educationalAttainments).toContain("non-future");
  });

  it("requires a Philippine mobile number and rejects malformed payloads", () => {
    const form = validTracerForm();
    form.mobileNumber = "+1 202 555 0199";

    expect(validateTracerPayload(form).mobileNumber).toContain("Philippine");
    expect(validateTracerPayload("not-a-form").fullName).toBeTruthy();
    expect(validateTracerPayload([]).fullName).toBeTruthy();
  });

  it("validates Section B education rows and conditional course reasons", () => {
    const form = validTracerForm();
    form.educationalAttainments[0].yearGraduated = "invalid";
    form.reasonsForCourse = ["Others"];

    const errors = validateTracerPayload(form);
    expect(errors.educationalAttainments).toBeTruthy();
    expect(errors.reasonsForCourseOther).toBeTruthy();
  });

  it("validates Section C training and advance-study details", () => {
    const form = validTracerForm();
    form.trainings = [{ title: "Graduate training", durationCredits: "", institution: "", advancedStudiesLevel: "", advancedStudiesStatus: "" }];
    form.advanceStudyReason = "Others";

    const errors = validateTracerPayload(form);
    expect(errors.trainings).toBeTruthy();
    expect(errors.advanceStudyReasonOther).toBeTruthy();
  });

  it("validates the conditional Section D employment workflow", () => {
    const form = validTracerForm();
    form.presentlyEmployed = "Employed";
    form.unemploymentReasons = [];

    const errors = validateTracerPayload(form);
    for (const field of [
      "presentEmploymentStatus",
      "presentOccupation",
      "industry",
      "workLocation",
      "firstJobAfterCollege",
      "firstJobRelatedToCourse",
      "firstJobDuration",
      "firstJobFindingWays",
      "timeToLandFirstJob",
      "jobLevelFirstJob",
      "jobLevelCurrentJob",
      "initialGrossMonthlyEarning",
      "curriculumRelevantToFirstJob",
    ]) {
      expect(errors[field]).toBeTruthy();
    }
  });
});

describe("Graduate Tracer draft recovery", () => {
  it("recovers a saved draft before an older submitted response", () => {
    const submission = { ched_payload: { ...validTracerForm(), fullName: "Submitted Name" } };
    const draft = { ched_payload: { ...validTracerForm(), fullName: "Draft Name" } };

    expect(selectTracerFormPayload(submission, draft)?.fullName).toBe("Draft Name");
  });

  it("loads the submitted response when no draft exists", () => {
    const submission = { ched_payload: { ...validTracerForm(), fullName: "Submitted Name" } };

    expect(selectTracerFormPayload(submission, null)?.fullName).toBe("Submitted Name");
  });
});
