import ReviewClient from "./review-client";

// Force dynamic rendering so Netlify never caches stale HTML with old chunk refs
export const dynamic = "force-dynamic";

export default function ReviewPage() {
  return <ReviewClient />;
}
