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
  const [viewer, data] = await Promise.all([getCurrentViewer(), getMeetingManagementData()]);

  const openInstanceId = typeof params.open === "string" ? params.open : null;

  if (!viewer) {
    return <p>No team members have been set up yet.</p>;
  }

  return (
    <MeetingApp
      initialData={data}
      currentUserId={viewer.id}
      zoomLink={ZOOM_LINK}
      initialOpenInstanceId={openInstanceId}
    />
  );
}
