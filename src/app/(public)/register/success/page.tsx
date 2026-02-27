import SuccessClient from "./success-client";

// Force dynamic rendering so this page is never prerendered/cached
export const dynamic = "force-dynamic";

export default function SuccessPage() {
  return <SuccessClient />;
}
