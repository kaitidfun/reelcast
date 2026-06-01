export type LibraryProduct = {
  id: string;
  name: string;
  thumbnail: string;
  primaryImageUrl: string | null;
  brandLogoUrl: string | null;
  highlights: string;
  campaignName: string;
};

export type LibraryCampaign = {
  id: string;
  name: string;
  bannerColor: string;
  bannerUrl: string | null;
  emoji: string;
  products: LibraryProduct[];
};

export type GenerationStatus = "idle" | "generating" | "done";

export type GuideOption = { label: string; description: string };

export type CreatorMode = "generate" | "upload";
