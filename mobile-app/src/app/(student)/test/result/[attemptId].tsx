// Attempt result (score / % / breakdown / per-topic bars) — web
// /child/test/result parity; olympiad attempts use olympiad wording.
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { TestResultScreen } from "@/features/tests/TestResultScreen";
import { TabRedirect } from "@/lib/TabRedirect";
import { isUuid } from "@/features/tests/logic";

export default function StudentTestResult() {
  const params = useLocalSearchParams<{ attemptId?: string }>();
  const attemptId = typeof params.attemptId === "string" ? params.attemptId : "";
  if (!isUuid(attemptId)) return <TabRedirect href="/(student)/(tabs)/tests" />;
  return <TestResultScreen attemptId={attemptId} />;
}
