export type HomepageMediaType = "image" | "video" | "youtube";

export interface HomepageMediaSlide {
  id: number | string;
  title: string;
  caption?: string | null;
  mediaType?: HomepageMediaType | string | null;
  mediaUrl?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  isHighlighted?: boolean;
  displayOrder?: number;
  status?: string | null;
}

export const OPEN_HOMEPAGE_MEDIA_DIALOG_EVENT = "admin:open-homepage-media-dialog";
export const HOMEPAGE_MEDIA_UPDATED_EVENT = "admin:homepage-media-updated";

export function openHomepageMediaDialog(slide?: HomepageMediaSlide) {
  window.dispatchEvent(
    new CustomEvent<{ slide?: HomepageMediaSlide }>(OPEN_HOMEPAGE_MEDIA_DIALOG_EVENT, {
      detail: { slide },
    }),
  );
}

export function notifyHomepageMediaUpdated() {
  window.dispatchEvent(new Event(HOMEPAGE_MEDIA_UPDATED_EVENT));
}
