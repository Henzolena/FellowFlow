import ReviewClient from "./review-client";

// Force dynamic rendering and disable all caching
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default function ReviewPage() {
  return <ReviewClient />;
}
