import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("hrms_session_id")?.value;
  if (!sessionId) {
    redirect("/login");
  }
  redirect("/dashboard");
}
