import InviteAcceptance from "./invite-acceptance";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteAcceptance token={token} />;
}
