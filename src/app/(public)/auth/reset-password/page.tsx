import ResetPasswordClient from "./reset-password-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
