import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TracerForm from "@/components/alumni/TracerForm";
import { createEmptyTracerForm, type TracerFormValues } from "@/components/alumni/tracer-form-types";

const refreshProfile = vi.fn();
const authenticatedUser = { id: "tracer-api-user", email: "api-alumni@example.test" };
const alumniProfile = { name: "API Alumni", course: "BSIT", batch: "2026" };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authenticatedUser, profile: alumniProfile, refreshProfile }),
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;
    payload?: unknown;

    constructor(message: string, status: number, payload?: unknown) {
      super(message);
      this.status = status;
      this.payload = payload;
    }
  }

  return {
    API_URL: "http://api.example.test/api",
    ApiError,
    getAuthHeaders: () => ({ authorization: "Bearer test-token" }),
    readApiResponse: async (response: Response) => {
      const payload = await response.json();
      if (!response.ok) throw new ApiError(payload?.error || "Request failed", response.status, payload);
      return payload;
    },
  };
});

const validPayload = (overrides: Partial<TracerFormValues> = {}) => createEmptyTracerForm({
  fullName: "Recovered Draft Alumni",
  permanentAddress: "Test City",
  email: "api-alumni@example.test",
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
    degreeSpecialization: "BSIT",
    school: "Salay Community College",
    yearGraduated: "2026",
    honorsAwards: "",
  }],
  presentlyEmployed: "Not Employed",
  unemploymentReasons: ["Family concern"],
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

type RequestHandler = (url: string, init?: RequestInit) => Promise<Response>;
let requestHandler: RequestHandler;

const draftEnvelope = (payload: TracerFormValues) => ({
  submission: null,
  draft: { id: 1, user_id: authenticatedUser.id, ched_payload: payload, updated_at: "2026-09-13T00:00:00.000Z" },
  allowResubmission: true,
  canSubmit: true,
});

describe("Graduate Tracer API form behavior", () => {
  beforeEach(() => {
    refreshProfile.mockReset();
    requestHandler = async () => jsonResponse(draftEnvelope(validPayload()));
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) => requestHandler(String(input), init)));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("populates a server draft and saves the current form through the draft API", async () => {
    requestHandler = async (url, init) => {
      if (url.endsWith("/tracer/save-draft") && init?.method === "POST") {
        return jsonResponse({ success: true, draft: draftEnvelope(validPayload()).draft });
      }
      return jsonResponse(draftEnvelope(validPayload()));
    };

    render(<TracerForm />);
    expect(await screen.findByDisplayValue("Recovered Draft Alumni")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "http://api.example.test/api/tracer/save-draft",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("Recovered Draft Alumni") }),
    ));
  }, 10_000);

  it("displays client validation messages beside invalid Section A fields", async () => {
    requestHandler = async () => jsonResponse(draftEnvelope(validPayload({
      email: "invalid-email",
      mobileNumber: "+1 202 555 0199",
    })));

    render(<TracerForm />);
    await screen.findByDisplayValue("invalid-email");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid Philippine mobile number.")).toBeInTheDocument();
  }, 10_000);

  it("submits the complete form to the final tracer endpoint", async () => {
    const payload = validPayload();
    requestHandler = async (url, init) => {
      if (url.endsWith("/tracer/submit") && init?.method === "POST") {
        return jsonResponse({
          success: true,
          submission: { id: 2, user_id: authenticatedUser.id, ched_payload: payload, submission_status: "completed" },
        });
      }
      return jsonResponse(draftEnvelope(payload));
    };

    render(<TracerForm />);
    await screen.findByDisplayValue("Recovered Draft Alumni");
    fireEvent.click(screen.getByRole("button", { name: /Section D/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit CHED Tracer Form" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "http://api.example.test/api/tracer/submit",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("Recovered Draft Alumni") }),
    ));
    expect(refreshProfile).toHaveBeenCalledOnce();
  }, 10_000);

  it("shows structured server validation beside the rejected field", async () => {
    const payload = validPayload();
    requestHandler = async (url, init) => {
      if (url.endsWith("/tracer/submit") && init?.method === "POST") {
        return jsonResponse({
          error: "Please correct invalid entries.",
          fields: { email: "The server rejected this Alumni email." },
        }, 400);
      }
      return jsonResponse(draftEnvelope(payload));
    };

    render(<TracerForm />);
    await screen.findByDisplayValue("Recovered Draft Alumni");
    fireEvent.click(screen.getByRole("button", { name: /Section D/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit CHED Tracer Form" }));

    expect(await screen.findByRole("heading", { name: "A. General Information" })).toBeInTheDocument();
    expect(screen.getByText("The server rejected this Alumni email.")).toBeInTheDocument();
  }, 10_000);
});
