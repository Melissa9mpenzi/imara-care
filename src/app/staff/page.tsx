import { redirect } from "next/navigation";

export default async function StaffPage() {
  redirect("/?section=staff");
}
