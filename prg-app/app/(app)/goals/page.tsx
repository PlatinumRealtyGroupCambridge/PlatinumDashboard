import { redirect } from "next/navigation";
import { getCurrentViewer } from "@/lib/auth";
import { getMeetingManagementData } from "@/lib/get-meeting-data";
import GoalsApp from "@/components/GoalsApp";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/login");

  const data = await getMeetingManagementData({ id: viewer.id, isAdmin: viewer.isAdmin });

  return (
    <GoalsApp initialGoals={data.goals} users={data.users} currentUserId={viewer.id} series={data.series} />
  );
}
