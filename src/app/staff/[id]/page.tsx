import { redirect } from "next/navigation";

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/?section=staff&staffId=${encodeURIComponent(id)}`);
}
