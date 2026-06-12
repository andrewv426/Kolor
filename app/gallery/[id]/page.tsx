import { AppShell } from '@/components/AppShell';
import { InspectScreen } from '@/components/screens/InspectScreen';

export default async function InspectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <InspectScreen submissionId={id} />
    </AppShell>
  );
}
