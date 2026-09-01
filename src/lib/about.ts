import { API_URL, readApiResponse } from "@/lib/api";
import type { SystemSettings } from "@/context/SystemSettingsContext";
import type { CourseOption } from "@/lib/courseCatalog";

export type AboutContentType = "history" | "milestone" | "leadership" | "service";

export interface InstitutionServiceItem {
  id: number;
  serviceId: number;
  title: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
}

export interface AboutContentItem {
  id: number;
  type: AboutContentType;
  year: string;
  title: string;
  subtitle: string;
  description: string;
  organization: string;
  department: string;
  credentials: string;
  category: string;
  imageUrl: string;
  icon: string;
  displayOrder: number;
  isActive: boolean;
  items?: InstitutionServiceItem[];
}

export interface AboutPageData {
  institution: SystemSettings;
  programs: CourseOption[];
  history: AboutContentItem[];
  milestones: AboutContentItem[];
  leadership: AboutContentItem[];
  services: AboutContentItem[];
}

export const fetchAboutPageData = async (signal?: AbortSignal) => {
  const response = await fetch(`${API_URL}/about`, { signal });
  return readApiResponse<AboutPageData>(response);
};
