// Skeleton for the unified login page (420px column: brand eyebrow, title,
// student/parent tabs, credential form).
import { AuthFormSkeleton } from "@/components/skeletons/pages";

export default function Loading() {
  return <AuthFormSkeleton maxWidth={420} tabs fields={2} />;
}
