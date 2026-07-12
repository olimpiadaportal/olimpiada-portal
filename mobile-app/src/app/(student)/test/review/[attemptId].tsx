// Post-grading answer review (filter tabs, keys + explanations) — web
// /child/test/review parity. The payload is memory-only (never persisted).
import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { TestReviewScreen } from "@/features/tests/TestReviewScreen";
import { isUuid } from "@/features/tests/logic";

export default function StudentTestReview() {
  const params = useLocalSearchParams<{ attemptId?: string }>();
  const attemptId = typeof params.attemptId === "string" ? params.attemptId : "";
  if (!isUuid(attemptId)) return <Redirect href="/(student)/(tabs)/tests" />;
  return <TestReviewScreen attemptId={attemptId} />;
}
