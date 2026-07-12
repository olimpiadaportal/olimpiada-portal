// Skeleton for the public Contact page (title, lead, info card + map frame).
import { Skeleton, SkeletonShell, skeletonStyles as s } from "@/components/skeletons";
import { ContactSkeleton } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <SkeletonShell className={s.stack} style={{ gap: 14 }}>
      <Skeleton w={220} h={28} />
      <Skeleton w="55%" h={14} style={{ maxWidth: 440 }} />
      <ContactSkeleton />
    </SkeletonShell>
  );
}
