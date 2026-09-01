import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read file."));
  reader.onerror = () => reject(new Error("Unable to read file."));
  reader.readAsDataURL(file);
});

export const uploadBrandingFile = async (file: File) => {
  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch(`${API_URL}/admin/system-settings/upload`, {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ fileName: file.name, dataUrl }),
  });
  const data = await readApiResponse<{ path: string }>(response);
  return data.path;
};
