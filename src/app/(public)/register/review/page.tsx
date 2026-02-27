import ReviewClient from "./review-client";

// Force dynamic rendering so this page is never prerendered/cached
export const dynamic = "force-dynamic";

export default function ReviewPage() {
  return <ReviewClient />;
}
