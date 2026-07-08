import { getCurrentViewer } from "@/lib/auth";
import { getMeetingManagementData } from "@/lib/get-meeting-data";
import GoalsApp from "@/components/GoalsApp";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const [viewer, data] = await Promise.all([getCurrentViewer(), getMeetingManagementData()]);

  if (!viewer) {
    return <p>No team members have been set up yet.</p>;
  }

  return (
    <GoalsApp initialGoals={data.goals} users={data.users} currentUserId={viewer.id} series={data.series} />
  );
}
