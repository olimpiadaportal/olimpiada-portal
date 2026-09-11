import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { SubjectForm } from "../SubjectForm";
import { IapNotice } from "../IapNotice";
import { subjectFormStrings, subjectStatusOptions } from "../strings";

// Create a subject WITH its prices, in one submission.
//
// The generic registry form could only write the `subjects` row, so every
// subject it created started life unpriced — and, because the status dropdown
// defaults to Public, published and unsellable at the same moment. The three
// prices are required here for that reason; see the comment on createSubject()
// in lib/admin/actions.ts for why requiring them beat defaulting them. This is
// the ONE screen that still writes prices through the subject form: editing a
// subject afterwards goes through the inline per-cell action instead.
//
// A new subject starts as PRIVATE in the picker, not Public: publishing is a
// decision, and the default should not be the one that puts a brand-new subject
// on the public site the instant it is saved.
//
// THE APPLE NOTICE IS PART OF THE FLOW, NOT A FOOTNOTE. Saving here creates a
// subject the website can sell immediately and the iOS app cannot sell at all
// until three App Store products exist and are approved. Nothing later in the
// process says so, so it is said before the form.
export default async function NewSubjectPage() {
  await requireAdmin();
  const t = await getT();

  return (
    <div className="page">
      <div className="page-head">
        <div className="head-row">
          <div>
            <h1>{t("subj.newTitle")}</h1>
          </div>
          <Link className="btn-ghost" href="/manage/subjects">
            {t("manage.back")}
          </Link>
        </div>
      </div>

      <div className="card-stack">
        <IapNotice t={t} />

        <section className="card">
          <h3>{t("subj.infoHeading")}</h3>
          <SubjectForm
            mode="create"
            defaults={{
              names: { az: "", en: "", ru: "" },
              status: "inactive",
              prices: {},
            }}
            statusOptions={subjectStatusOptions(t)}
            strings={subjectFormStrings(t, t("manage.add"))}
          />
        </section>
      </div>
    </div>
  );
}
