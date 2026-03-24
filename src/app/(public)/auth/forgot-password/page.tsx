import ForgotPasswordClient from "./forgot-password-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
