import { redirect } from "next/navigation";
import { getCurrentViewer } from "@/lib/auth";
import { getMeetingManagementData } from "@/lib/get-meeting-data";
import { ZOOM_LINK } from "@/lib/sections";
import MeetingApp from "@/components/MeetingApp";

export const dynamic = "force-dynamic";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const viewer = await getCurrentViewer();
  if (!viewer) redirect("/login");

  const data = await getMeetingManagementData({ id: viewer.id, isAdmin: viewer.isAdmin });

  const openInstanceId = typeof params.open === "string" ? params.open : null;

  return (
    <MeetingApp
      initialData={data}
      currentUserId={viewer.id}
      zoomLink={ZOOM_LINK}
      initialOpenInstanceId={openInstanceId}
    />
  );
}
