import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { EditorScreen } from '@/components/screens/EditorScreen';

export default function EditPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="screen" aria-busy />}>
        <EditorScreen />
      </Suspense>
    </AppShell>
  );
}
