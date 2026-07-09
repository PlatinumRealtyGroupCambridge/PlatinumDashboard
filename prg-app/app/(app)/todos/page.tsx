import { redirect } from "next/navigation";
import { getCurrentViewer } from "@/lib/auth";
import { getMeetingManagementData } from "@/lib/get-meeting-data";
import TodosApp from "@/components/TodosApp";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/login");

  const data = await getMeetingManagementData({ id: viewer.id, isAdmin: viewer.isAdmin });

  return (
    <TodosApp initialTasks={data.tasks} users={data.users} currentUserId={viewer.id} series={data.series} />
  );
}
