import { getCurrentViewer } from "@/lib/auth";
import { getMeetingManagementData } from "@/lib/get-meeting-data";
import TodosApp from "@/components/TodosApp";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const [viewer, data] = await Promise.all([getCurrentViewer(), getMeetingManagementData()]);

  if (!viewer) {
    return <p>No team members have been set up yet.</p>;
  }

  return (
    <TodosApp initialTasks={data.tasks} users={data.users} currentUserId={viewer.id} series={data.series} />
  );
}
