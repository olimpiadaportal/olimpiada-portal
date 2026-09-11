// Post-grading answer review (filter tabs, keys + explanations) — web
// /child/test/review parity. The payload is memory-only (never persisted).
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { TestReviewScreen } from "@/features/tests/TestReviewScreen";
import { TabRedirect } from "@/lib/TabRedirect";
import { isUuid } from "@/features/tests/logic";

export default function StudentTestReview() {
  const params = useLocalSearchParams<{ attemptId?: string }>();
  const attemptId = typeof params.attemptId === "string" ? params.attemptId : "";
  if (!isUuid(attemptId)) return <TabRedirect href="/(student)/(tabs)/tests" />;
  return <TestReviewScreen attemptId={attemptId} />;
}
