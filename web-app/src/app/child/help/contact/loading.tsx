// Skeleton for the arena Contact page (info card + map frame, .contact-equal).
import { Skeleton, SkeletonShell } from "@/components/skeletons";
import { ContactSkeleton } from "@/components/skeletons/pages";

export default function Loading() {
  return (
    <SkeletonShell className="prose help-page">
      <Skeleton w={200} h={26} />
      <ContactSkeleton />
    </SkeletonShell>
  );
}
