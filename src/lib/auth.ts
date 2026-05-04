import { clearAuthToken, getAuthToken, setAuthToken } from "@/lib/api";

export const getToken = (): string | null => {
  return getAuthToken();
};

export const setToken = (token: string, rememberMe = true) => {
  setAuthToken(token, rememberMe);
};

export const logout = () => {
  clearAuthToken();
  localStorage.removeItem("user");
  window.location.href = "/";
};
