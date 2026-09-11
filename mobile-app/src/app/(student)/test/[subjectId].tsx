// Test setup (topic/subtopic picker + instructions consent gate) for one
// subject — web /child/test/[subjectId] parity. Invalid ids bounce home.
import React from "react";
import { useLocalSearchParams } from "expo-router";
import { TestSetupScreen } from "@/features/tests/TestSetupScreen";
import { TabRedirect } from "@/lib/TabRedirect";
import { isUuid } from "@/features/tests/logic";

export default function StudentTestSetup() {
  const params = useLocalSearchParams<{ subjectId?: string }>();
  const subjectId = typeof params.subjectId === "string" ? params.subjectId : "";
  if (!isUuid(subjectId)) return <TabRedirect href="/(student)/(tabs)/tests" />;
  return <TestSetupScreen subjectId={subjectId} />;
}
