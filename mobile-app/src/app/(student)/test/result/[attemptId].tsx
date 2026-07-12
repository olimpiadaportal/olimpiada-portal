// Attempt result (score / % / breakdown / per-topic bars) — web
// /child/test/result parity; olympiad attempts use olympiad wording.
import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { TestResultScreen } from "@/features/tests/TestResultScreen";
import { isUuid } from "@/features/tests/logic";

export default function StudentTestResult() {
  const params = useLocalSearchParams<{ attemptId?: string }>();
  const attemptId = typeof params.attemptId === "string" ? params.attemptId : "";
  if (!isUuid(attemptId)) return <Redirect href="/(student)/(tabs)/tests" />;
  return <TestResultScreen attemptId={attemptId} />;
}
