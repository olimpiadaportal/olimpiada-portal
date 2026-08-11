"use client";

// ONE implementation of "the admin picked a bulk-import file", shared by the
// three surfaces that offer one: BulkUploadModal (general question bank),
// OlympiadCreateForm (one file per selected grade) and OlympiadGradeBulkAppend
// (append into one existing grade pool).
//
// WHY IT EXISTS
// -------------
// The same twenty lines — .zip name check → parse → row validation →
// unreferenced-image report, then batch id → resolver → uploadEmbeddedMedia →
// discard on failure → re-post the rewritten rows on the same `file` field —
// existed three times and had already drifted: one copy's submit gate forgot
// `items.length > 0`. Every future change to the media phase would have had to
// be made three times, and the copy that was missed would keep working right up
// until it silently uploaded something the server refuses.
//
// SPLIT ON PURPOSE:
//   parseBulkPick      pure, one file  → the three surfaces all call it
//   runBulkMediaPhase  pure-ish, one archive → all three (the create form loops
//                      it per grade and shares ONE batch id across them)
//   useBulkFilePicker  the React state around a SINGLE file input — the two
//                      single-file surfaces; the create form owns a map of
//                      files and composes the two functions instead.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parseBulkFile,
  validateBulkRowsClient,
  type BulkClientMode,
  type ClientCurriculumIndex,
  type ClientTypeRule,
  type RowIssue,
} from "./bulk-client";
import {
  makeZipMediaResolver,
  makeZipRefChecker,
  parseBulkZipFile,
  unreferencedZipImages,
  type ZipBulkParsed,
} from "./zip-bulk";
import { discardUploadedMedia, uploadEmbeddedMedia } from "./bulk-upload-media";
import { verifyImportImage } from "./admin/import-media";
import { buildImportMediaPath } from "./bulk-media-shared";

/** Empty until the admin chooses one — never defaulted to "text", because a
 *  mixed file imported as text-only drops every image and still looks like a
 *  success. */
export type BulkQuestionMode = "" | "text" | "mixed";

export type BulkPickState = {
  fileName: string;
  fileError: string;
  items: unknown[];
  /** The opened archive (mixed only) — the source of the media phase's bytes. */
  zip: ZipBulkParsed | null;
  /** File-level problems that carry no row number (an unused image, say). */
  zipIssues: string[];
};

export const EMPTY_BULK_PICK: BulkPickState = {
  fileName: "",
  fileError: "",
  items: [],
  zip: null,
  zipIssues: [],
};

/**
 * Read one chosen file into the state every surface renders from.
 *
 * The mode decides the FILE TYPE: text-only takes the JSON array untouched,
 * mixed takes a ZIP holding questions.json plus the images it references.
 */
export async function parseBulkPick(
  file: File,
  questionMode: "text" | "mixed",
  tt: (k: string) => string,
): Promise<BulkPickState> {
  const next: BulkPickState = { ...EMPTY_BULK_PICK, fileName: file.name };

  if (questionMode === "mixed") {
    // Checked on the NAME before a byte is read: an admin who picked the wrong
    // file gets the actionable message rather than "not a ZIP".
    if (!/\.zip$/i.test(file.name)) {
      return { ...next, fileError: tt("bulk.err.needZip") };
    }
    const parsedZip = await parseBulkZipFile(file, tt);
    if ("error" in parsedZip) return { ...next, fileError: parsedZip.error };
    const unused = unreferencedZipImages(parsedZip, parsedZip.items);
    return {
      ...next,
      items: parsedZip.items,
      zip: parsedZip,
      zipIssues:
        unused.length === 0
          ? []
          : [tt("bulk.err.zipUnusedImages").replace("{files}", unused.join(", "))],
    };
  }

  const parsed = await parseBulkFile(file, tt);
  if ("error" in parsed) return { ...next, fileError: parsed.error };
  return { ...next, items: parsed.items };
}

export type BulkMediaPhase =
  | { ok: true; items: unknown[]; uploadedPaths: string[] }
  | { ok: false; issues: RowIssue[]; uploadedPaths: string[] };

/**
 * MIXED only: read every referenced image out of the archive, upload each one
 * as its own request and replace it with the uuid the server minted after
 * re-typing the STORED bytes. The import request that follows carries no image
 * bytes at all — its size is O(question count), permanently.
 *
 * `uploadedPaths` is returned on BOTH branches: the caller decides when to
 * discard, because the create form has to unwind EVERY grade's uploads, not
 * just the one that failed.
 */
export async function runBulkMediaPhase(
  items: unknown[],
  zip: ZipBulkParsed,
  tt: (k: string) => string,
  batchId: string,
): Promise<BulkMediaPhase> {
  const { resolve } = makeZipMediaResolver(zip);
  const result = await uploadEmbeddedMedia(
    items,
    batchId,
    (ext) => buildImportMediaPath(batchId, ext),
    verifyImportImage,
    resolve,
  );
  const uploadedPaths = result.uploaded.map((u) => u.path);
  if (result.failures.length > 0) {
    // Nothing is imported when any image fails: a partial import would leave
    // the admin reconciling which questions made it.
    return {
      ok: false,
      uploadedPaths,
      issues: result.failures.map((f) => ({
        row: f.row,
        message: tt(f.messageKey).replace("{file}", f.file ?? ""),
      })),
    };
  }
  return { ok: true, items: result.items, uploadedPaths };
}

/** The rewritten rows, posted on the SAME `file` field so the server action's
 *  parse contract is unchanged — it still receives a JSON File. */
export function jsonImportFile(items: unknown[], fileName: string): File {
  return new File([JSON.stringify(items)], fileName || "import.json", {
    type: "application/json",
  });
}

/**
 * React state for a SINGLE bulk file input: the pick, its row issues, the media
 * phase and the remount key that forces a fresh choice.
 */
export function useBulkFilePicker(opts: {
  dict: Record<string, string>;
  questionMode: BulkQuestionMode;
  mode: BulkClientMode;
  typeRules: ClientTypeRule[];
  /** GENERAL mode only — drives the per-row "Topic not found" pre-check. */
  curriculum?: ClientCurriculumIndex | null;
}) {
  const { dict, questionMode, mode, typeRules } = opts;
  const curriculum = opts.curriculum ?? null;
  const tt = useCallback((k: string) => dict[k] ?? k, [dict]);

  const [pick, setPick] = useState<BulkPickState>(EMPTY_BULK_PICK);
  const [mediaIssues, setMediaIssues] = useState<RowIssue[]>([]);
  // Separate from the action's `pending` so the button can say "uploading
  // images" during the part that happens BEFORE the action is dispatched —
  // otherwise a large batch looks frozen.
  const [uploading, setUploading] = useState(false);
  // Bumping the key remounts the file input (the reliable way to clear it).
  const [fileKey, setFileKey] = useState(0);

  const rowIssues: RowIssue[] = useMemo(
    () =>
      pick.items.length === 0
        ? []
        : validateBulkRowsClient(pick.items, tt, typeRules, mode, curriculum, {
            mixed: questionMode === "mixed",
            zipHas: pick.zip ? makeZipRefChecker(pick.zip) : undefined,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pick, curriculum, mode, questionMode, tt],
  );

  const reset = useCallback(() => {
    setPick(EMPTY_BULK_PICK);
    setMediaIssues([]);
    setFileKey((k) => k + 1);
  }, []);

  // Switching the import type clears the chosen file. The two modes accept
  // different file types, so keeping it would let a .zip be posted through the
  // text-only path (or a .json through the mixed one) without a re-pick.
  useEffect(() => {
    reset();
  }, [questionMode, reset]);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setMediaIssues([]);
      const file = e.target.files?.[0];
      if (!file || questionMode === "") {
        setPick(EMPTY_BULK_PICK);
        return;
      }
      setPick(await parseBulkPick(file, questionMode, tt));
    },
    [questionMode, tt],
  );

  /**
   * Submit handler for the single-file surfaces. Text-only returns immediately
   * and the form submits NATIVELY, byte-for-byte as before; mixed runs the
   * media phase first and dispatches the rewritten rows itself.
   */
  const handleSubmit = useCallback(
    async (
      e: React.FormEvent<HTMLFormElement>,
      dispatch: (fd: FormData) => void,
    ) => {
      if (questionMode !== "mixed" || pick.items.length === 0 || !pick.zip) return;
      e.preventDefault();
      const form = e.currentTarget;
      setUploading(true);
      setMediaIssues([]);

      const phase = await runBulkMediaPhase(
        pick.items,
        pick.zip,
        tt,
        crypto.randomUUID(),
      );
      setUploading(false);

      if (!phase.ok) {
        setMediaIssues(phase.issues);
        // Objects already uploaded are discarded here; the server sweep covers
        // whatever this misses.
        await discardUploadedMedia(phase.uploadedPaths);
        return;
      }

      const fd = new FormData(form);
      fd.set("file", jsonImportFile(phase.items, pick.fileName));
      dispatch(fd);
    },
    [pick, questionMode, tt],
  );

  const fileReady =
    pick.fileName !== "" &&
    pick.fileError === "" &&
    pick.items.length > 0 &&
    rowIssues.length === 0 &&
    pick.zipIssues.length === 0;

  return {
    ...pick,
    fileKey,
    rowIssues,
    mediaIssues,
    uploading,
    fileReady,
    onFileChange,
    handleSubmit,
    reset,
  };
}
