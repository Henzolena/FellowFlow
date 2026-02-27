import SuccessClient from "./success-client";

// Force dynamic rendering so Netlify never caches stale HTML with old chunk refs
export const dynamic = "force-dynamic";

export default function SuccessPage() {
  return <SuccessClient />;
}
