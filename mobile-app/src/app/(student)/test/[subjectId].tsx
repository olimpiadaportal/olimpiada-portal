// Test setup (topic/subtopic picker + instructions consent gate) for one
// subject — web /child/test/[subjectId] parity. Invalid ids bounce home.
import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { TestSetupScreen } from "@/features/tests/TestSetupScreen";
import { isUuid } from "@/features/tests/logic";

export default function StudentTestSetup() {
  const params = useLocalSearchParams<{ subjectId?: string }>();
  const subjectId = typeof params.subjectId === "string" ? params.subjectId : "";
  if (!isUuid(subjectId)) return <Redirect href="/(student)/(tabs)/tests" />;
  return <TestSetupScreen subjectId={subjectId} />;
}
