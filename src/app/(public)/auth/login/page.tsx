import LoginClient from "./login-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default function LoginPage() {
  return <LoginClient />;
}
