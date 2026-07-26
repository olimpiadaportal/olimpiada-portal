// Round 47 — best/weakest topic ranking. The old reduce-to-max/min approach
// produced a bare "—" when nothing qualified and, when exactly ONE topic
// qualified, named the SAME topic as both best and weakest. On the dev data
// set every student hit one of those two cases, so the feature had never once
// produced a usable pair.
import {
  MIN_TOPIC_SAMPLE,
  MIN_TOPICS_TO_COMPARE,
  computeTopicStanding,
  topicStandingHint,
  type TopicRow,
} from "@/features/analytics/helpers";

const row = (topic: string, answered: number, accuracy: number): TopicRow => ({
  topic,
  answered,
  accuracy,
});

// The real dictionary shape — {a}/{n}/{p} are filled by the helper.
const t = (k: string) =>
  ({
    "ana.topic.needSample": "needs {n} answers ({a}/{n})",
    "ana.topic.needTopics": "needs {n} topics",
    "ana.topic.allEqual": "all at {p}%",
  })[k] ?? k;

describe("computeTopicStanding", () => {
  it("ranks best vs weakest once two topics clear the sample", () => {
    const s = computeTopicStanding([
      row("Reading", 5, 80),
      row("Grammar", 4, 25),
      row("Listening", 3, 50),
    ]);
    expect(s.kind).toBe("ready");
    if (s.kind !== "ready") throw new Error("unreachable");
    expect(s.best.topic).toBe("Reading");
    expect(s.weak.topic).toBe("Grammar");
    expect(topicStandingHint(s, t)).toBeNull();
  });

  it("ignores topics below the answered threshold when ranking", () => {
    // Grammar has the worst accuracy but only 2 answers — it must not be
    // crowned "weakest" off a sample that small.
    const s = computeTopicStanding([
      row("Reading", 5, 80),
      row("Grammar", MIN_TOPIC_SAMPLE - 1, 0),
      row("Listening", 3, 50),
    ]);
    expect(s.kind).toBe("ready");
    if (s.kind !== "ready") throw new Error("unreachable");
    expect(s.weak.topic).toBe("Listening");
  });

  it("reports progress when NO topic has enough answers (the reported bug)", () => {
    // The exact dev-data shape: one topic, 2 answered, threshold 3.
    const s = computeTopicStanding([row("Communication", 2, 50)]);
    expect(s).toEqual({ kind: "needSample", have: 2, needed: MIN_TOPIC_SAMPLE });
    expect(topicStandingHint(s, t)).toBe("needs 3 answers (2/3)");
  });

  it("reports zero progress for a child with no answered questions at all", () => {
    const s = computeTopicStanding([]);
    expect(s).toEqual({ kind: "needSample", have: 0, needed: MIN_TOPIC_SAMPLE });
  });

  it("refuses to name one topic both best AND weakest", () => {
    const s = computeTopicStanding([row("Toplama", 25, 96), row("Reading", 1, 0)]);
    expect(s).toEqual({
      kind: "needTopics",
      qualified: 1,
      needed: MIN_TOPICS_TO_COMPARE,
    });
    expect(topicStandingHint(s, t)).toBe("needs 2 topics");
  });

  it("refuses to rank when every qualifying topic has identical accuracy", () => {
    const s = computeTopicStanding([
      row("Reading", 4, 60),
      row("Grammar", 5, 60),
      row("Listening", 3, 60),
    ]);
    expect(s).toEqual({ kind: "allEqual", accuracy: 60 });
    expect(topicStandingHint(s, t)).toBe("all at 60%");
  });

  it("breaks accuracy ties deterministically by topic name", () => {
    const forward = computeTopicStanding([
      row("Zoology", 3, 90),
      row("Algebra", 3, 90),
      row("Botany", 3, 10),
    ]);
    const reversed = computeTopicStanding([
      row("Botany", 3, 10),
      row("Algebra", 3, 90),
      row("Zoology", 3, 90),
    ]);
    expect(forward).toEqual(reversed);
    if (forward.kind !== "ready") throw new Error("unreachable");
    expect(forward.best.topic).toBe("Algebra");
  });
});
