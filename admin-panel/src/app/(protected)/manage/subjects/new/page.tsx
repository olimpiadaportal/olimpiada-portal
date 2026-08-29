import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guards";
import { getT } from "@/i18n/server";
import { SubjectForm } from "../SubjectForm";
import { subjectFormStrings, subjectStatusOptions } from "../strings";

// Create a subject WITH its prices, in one submission.
//
// The generic registry form could only write the `subjects` row, so every
// subject it created started life unpriced — and, because the status dropdown
// defaults to Public, published and unsellable at the same moment. The three
// prices are required here for that reason; see the comment on createSubject()
// in lib/admin/actions.ts for why requiring them beat defaulting them.
//
// A new subject starts as PRIVATE in the picker, not Public: publishing is a
// decision, and the default should not be the one that puts a brand-new subject
// on the public site the instant it is saved.
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

      <section className="card">
        <h3>{t("subj.infoHeading")}</h3>
        <SubjectForm
          mode="create"
          defaults={{ name: "", status: "inactive", prices: {} }}
          statusOptions={subjectStatusOptions(t)}
          strings={subjectFormStrings(t, t("manage.add"))}
        />
      </section>
    </div>
  );
}
