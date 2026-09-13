import { beforeEach, describe, expect, it } from "vitest";
import { AUTH_TOKEN_KEY, REMEMBER_ME_KEY, clearAuthToken, getAuthToken, setAuthToken } from "@/lib/api";

describe("authentication token storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("keeps the active account isolated in the current tab", () => {
    sessionStorage.setItem(AUTH_TOKEN_KEY, "tab-account-token");
    localStorage.setItem(AUTH_TOKEN_KEY, "different-remembered-account-token");

    expect(getAuthToken()).toBe("tab-account-token");
  });

  it("stores every active login in the current tab", () => {
    setAuthToken("current-tab-token", false);

    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe("current-tab-token");
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it("restores a remembered login into an isolated tab session", () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "remembered-token");

    expect(getAuthToken()).toBe("remembered-token");
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe("remembered-token");
  });

  it("clears active and remembered authentication during logout", () => {
    setAuthToken("logout-token", true);

    clearAuthToken();

    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REMEMBER_ME_KEY)).toBeNull();
    expect(getAuthToken()).toBeNull();
  });
});
