import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TracerForm from "@/components/alumni/TracerForm";
import { createEmptyTracerForm } from "@/components/alumni/tracer-form-types";

const refreshProfile = vi.fn();
const authenticatedUser = { id: "mobile-tracer-user", email: "mobile@example.test" };
const alumniProfile = { name: "Mobile Alumni", course: "BSIT", batch: "2026" };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: authenticatedUser,
    profile: alumniProfile,
    refreshProfile,
  }),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    payload?: unknown;

    constructor(message: string, status: number, payload?: unknown) {
      super(message);
      this.status = status;
      this.payload = payload;
    }
  },
  API_URL: "http://api.example.test/api",
  getAuthHeaders: () => ({ authorization: "Bearer test-token" }),
  readApiResponse: async (response: Response) => response.json(),
}));

const submittedPayload = createEmptyTracerForm({
  fullName: "Mobile Alumni",
  permanentAddress: "Test City",
  email: "mobile@example.test",
  mobileNumber: "+63 912 345 6789",
  civilStatus: "Single",
  sex: "Female",
  birthdayMonth: "January",
  birthdayDay: "15",
  birthdayYear: "2000",
  regionOfOrigin: "Region 10",
  province: "Misamis Oriental",
  residenceType: "City",
  educationalAttainments: [{ degreeSpecialization: "BSIT", school: "Salay Community College", yearGraduated: "2026", honorsAwards: "" }],
  presentlyEmployed: "Not Employed",
  unemploymentReasons: ["Family concern"],
});

describe("Graduate Tracer mobile form", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      submission: { id: 1, user_id: "mobile-tracer-user", ched_payload: submittedPayload },
      draft: null,
      allowResubmission: true,
      canSubmit: true,
    }), { status: 200, headers: { "content-type": "application/json" } })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders the responsive form and opens every CHED section at phone width", async () => {
    const { container } = render(<TracerForm />);

    await screen.findByRole("heading", { name: "A. General Information" });
    expect(container.querySelector(".mobile-compact-tracer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Section B/i }));
    await screen.findByRole("heading", { name: "B. Educational Background" });

    fireEvent.click(screen.getByRole("button", { name: /Section C/i }));
    await screen.findByRole("heading", { name: /C. Training/i });

    fireEvent.click(screen.getByRole("button", { name: /Section D/i }));
    await screen.findByRole("heading", { name: "D. Employment Data" });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "http://api.example.test/api/tracer/my-form",
      expect.objectContaining({ headers: expect.any(Object) }),
    ));
  }, 10_000);
});
