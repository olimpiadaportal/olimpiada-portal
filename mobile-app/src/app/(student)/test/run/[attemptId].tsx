// The shared timed player (kind='test' AND kind='olympiad' — migration 047).
// The stack layout already hides the header and disables the back gesture;
// the runner adds its own leave guard (hardware back + beforeRemove).
import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { TestRunnerScreen } from "@/features/tests/TestRunnerScreen";
import { isUuid } from "@/features/tests/logic";

export default function StudentTestRun() {
  const params = useLocalSearchParams<{ attemptId?: string; resumed?: string }>();
  const attemptId = typeof params.attemptId === "string" ? params.attemptId : "";
  if (!isUuid(attemptId)) return <Redirect href="/(student)/(tabs)/tests" />;
  return <TestRunnerScreen attemptId={attemptId} resumed={params.resumed === "1"} />;
}
