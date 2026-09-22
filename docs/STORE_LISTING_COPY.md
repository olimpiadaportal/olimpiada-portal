# OlympIQ — Store listing copy & assets

Authoritative source for everything that appears on a **public store page**: app name,
descriptions, keywords, and the visual assets. Covers Google Play and the App Store side
by side — the two stores want the same text in different field shapes, so keeping them in
one file is what stops them drifting apart.

Supersedes §1 of `mobile-app/markdowns/STORE_LAUNCH_PACK.md` (2026-07-16), whose copy
described the daily round as serving "the same questions for everyone" — untrue since
Round 42, where the set is drawn per student — and mentioned subscriptions/payments,
which must never appear in store copy (see §5).

The rest of that pack (data-safety inventory, reviewer notes, age-rating answers) is
still current; only the listing metadata moved here.

- **Last updated:** 2026-09-22
- **Play status: REJECTED 2026-09-22** under the **Metadata policy**, on the `az-AZ`
  store-listing **screenshots**. §0 is what happened and what actually has to change; §2
  and §3 are the rewritten copy; **§6.4 is the screenshot brief, and it is the fix**
- **App Store status:** 1.16.0 approved 2026-09-15 and live. **Apple did not object to
  anything here.** Only Play rejected, and only on metadata — so nothing in this file is
  evidence that the iOS listing needs work
- **The copy in §2 and §3 is the copy to submit. The copy that was rejected is kept in
  §10 so nobody pastes it back in by accident.**

---

## 0. The 2026-09-22 Play rejection — what was actually wrong

Two entries came back on the rejection. Read them in the right order, because one of them
is not a finding.

1. **"Not adhering to Google Play Developer Programme Policies."** This is the umbrella
   heading the console prints above whatever the real finding is. It carries no detail of
   its own and there is nothing separate to fix under it. Do not go hunting for a second,
   hidden violation merely because this line exists.
2. **"Metadata policy: Violation of Metadata policy" — location: Store listing
   screenshots (az-AZ)**, with the sub-heading *Unclear Visuals: Your app's screenshots
   or promotional images are blank, generic, or otherwise fail to clearly convey the
   expected functionality or user experience.*

   Policy text: <https://support.google.com/googleplay/android-developer/answer/9898842>
   ("Metadata"). The governing sentence is that Google does not allow *"misleading,
   improperly formatted, non-descriptive, irrelevant, excessive, or inappropriate
   metadata, including the app's description, developer name, title, icon, screenshots
   and promotional images."* The asset rules that go with it:
   <https://support.google.com/googleplay/android-developer/answer/9866151> ("Add preview
   assets to showcase your app"), which requires screenshots to *"demonstrate the actual
   in-app or in-game experience, focusing on the core features and content so users can
   anticipate what the app or game experience will be like."* The listing-craft guidance
   is <https://support.google.com/googleplay/android-developer/answer/13393723> ("Best
   practices for your store listing").

**What the submitted set actually showed.** Four near-identical, very dark frames of the
**authentication flow** — brand header, two short text blocks, one gradient button. No
question, no result, no leaderboard, no parent panel. At the thumbnail size a Play
listing renders them at, four dark frames of a sign-in form read as four blank
rectangles. That is the finding almost word for word: *blank, generic, fails to convey
the expected functionality.*

**Three things follow, and together they are the whole fix.**

- **The screenshots are the violation. The binary is not.** Nothing in the rejection
  points at the APK, at a permission, at the Families policy or at payments. Do not
  change app behaviour to answer this.
- **Auth screens are the worst possible choice of screenshot** for any app, and
  structurally so: a sign-in form is the one screen that looks identical across every app
  on the store, so it conveys nothing about this one. §6.4 bans them outright.
- **The description was not cited — but Google's own "How to fix" says to make the title,
  description and images *"clearly, accurately, and thoroughly describe the app's core
  functionality and user experience."*** The old description was accurate but thin in
  exactly the places a reviewer looks: it never said what a session actually looks like,
  it listed six of the app's seven subjects, and two of its privacy claims had drifted
  from what the app now does. §2 and §3 fix that. Resubmitting the same text beside new
  screenshots would waste the one pass a reviewer is already giving this listing.

**One open question, stated as open.** The rejection's evidence attachment is a single
image containing four screenshots side by side. That is almost certainly Google
compositing the uploaded assets into one evidence picture — the four frames match the
four that were uploaded individually, and Play stores phone screenshots individually. It
is **not**, on its face, evidence that a four-in-one collage was uploaded. Verify rather
than trust this paragraph: the uploaded assets are at **Play Console → Grow users →
Store presence → Main store listing**, direct link
<https://play.google.com/console/developers/app/main-store-listing>, under *Phone
screenshots*; the localised sets sit behind the language selector on that same page, and
`az-AZ` is the default listing's. Newer consoles also expose the same files under *Asset
Library* (<https://support.google.com/googleplay/android-developer/answer/16386748>). If
the phone slot really does contain one composite image, that is a second and independent
violation — and §6.4 fixes it anyway by requiring eight separate frames.

---

## 1. App name

Play field: *App name* (30 chars). App Store field: *Name* (30 chars). The same value
works for both. **Reviewed after the rejection and deliberately kept unchanged:** the
name was not cited, it describes the app's function accurately, and it carries no
promotional word.

| Locale | Value | Count |
|---|---|---|
| **az-AZ (default)** | `OlympIQ: Olimpiada hazırlığı` | 28 |
| en-US | `OlympIQ: Olympiad Prep` | 22 |
| ru-RU | `OlympIQ: школьные олимпиады` | 27 |

Plain `OlympIQ` is a valid fallback. The descriptive form exists because both stores
index the name for search and "olimpiada" is the query real users type. No promotional
words — the Metadata policy and App Store Guideline 2.3.7 both ban "ən yaxşı", "#1",
"pulsuz", "endirim" and their equivalents in the name. Play additionally asks for no
emoji, no repeated special characters, and no ALL CAPS unless the brand is written that
way.

---

## 2. Short description / subtitle — REWRITTEN 2026-09-22

Two different fields with two different limits. Do not reuse one for the other.

**What changed and why.** The old short descriptions named the audience and then listed
nouns ("daily tests, progress and leaderboards"). The new ones name the **unit of use** —
a 25-question round with an explained result — because that is the sentence both a
reviewer and a parent read first, and "clearly conveys the expected functionality" is the
exact test this listing just failed.

### 2.1 Play — Short description (80 chars)

| Locale | Value | Count |
|---|---|---|
| **az** | `1–11-ci sinif: gündəlik 25 suallıq raund, izahlı nəticə, valideyn nəzarəti.` | 75 |
| en | `Grades 1–11: a daily 25-question round, explained answers, parent-managed.` | 74 |
| ru | `1–11 класс: раунд из 25 вопросов в день, разбор ответов, контроль родителя.` | 75 |

Counts are code-point counts of the exact strings above. Each leaves at least five
characters of head-room, which matters because the console counts a pasted line ending as
a character.

### 2.2 App Store — Subtitle (30 chars)

Unchanged. Apple raised no objection, and these already read as functional rather than
promotional.

| Locale | Value | Count |
|---|---|---|
| az | `Olimpiadaya hazırlıq, 1–11` | 26 |
| en | `Olympiad prep, grades 1–11` | 26 |
| ru | `Подготовка к олимпиадам` | 23 |

---

## 3. Full description (4000 chars) — REWRITTEN 2026-09-22

Play field: *Full description*. App Store field: *Description*. The same body works for
both; the App Store has no equivalent of Play's separate short description, so the first
paragraph carries the hook.

**What changed from the rejected version, and why each change is defensible.**

| Change | Reason |
|---|---|
| A concrete opening paragraph: who opens the account, who signs in, what the child does | The Metadata policy's test is whether the listing conveys the *expected user experience*. The old opener was a category label |
| A new **four-step "how to start"** block | A reviewer opening the app lands on a sign-in screen and has to guess how anyone gets past it. Spelling out that the parent registers and the child gets an 8-digit ID removes the ambiguity that made the old auth screenshots look like the whole app |
| The daily round now states **five options A–E, one correct, untimed, resumable** | Concrete, verifiable in the binary, and exactly the "core functionality" wording Google's fix-it text asks for |
| A new **results-and-explanations** section | The single most demonstrable thing the app does, and previously one clause |
| Subjects list corrected from six to **seven** | Azərbaycan dili has been a live subject since migration 151 and was missing. An incomplete list on a listing cited for metadata is a gift to a second reviewer |
| Leaderboard privacy claim corrected | The old text said names "are not shown openly". In the app a board shows a first name plus a surname initial. The new text says exactly that and gives the shape |
| "no third-party tracking" replaced, not merely deleted | Sentry is a third-party crash processor in the shipped apps (§8), so the old claim was false. The replacement states the whole of what IS true and checkable: no ad network, no ad SDK, no advertising identifier read, no advertising use of a child's data — and one outside service, a crash reporter that receives a technical fault report carrying no child's name, login ID or school. It matches `docs/PRIVACY_POLICY.md` A7/B7/C7 and the scrubber in `mobile-app/src/lib/sentryScrub.ts`. The processor is deliberately NOT named in the body: a third-party brand in listing copy invites the unrelated-brand rule in §5.2, and the privacy policy is where it belongs |
| Section headers converted from ALL CAPS to sentence case, in all three locales | ALL CAPS is improperly formatted metadata under the same policy this listing was rejected on, and the brand exception covers `OlympIQ` only — not `GÜNDƏLİK RAUND`. Resubmitting a rejected listing with shouted headers is an avoidable second finding. See §5.2 |
| New: second-parent invite code, news section, language choice at first launch, parent deleting a child | All shipped features the listing never mentioned. Thoroughness is the third word in Google's fix-it instruction |
| Kept: the closing access NOTE | See §5 — it is what keeps the listing honest about gating without naming a payment rail |

Character counts below are measured with CRLF line endings, which is what a paste into
the console produces: **az 3818, en 3885, ru 3841**, against a 4000 limit. Re-count after
any edit — the English body has the least head-room (115 characters) and is the one an
addition will push over.

### 3.1 az-AZ — 3818 chars (CRLF)

```
OlympIQ 1–11-ci sinif şagirdləri üçün olimpiada hazırlığı və gündəlik məşq tətbiqidir. Valideyn hesab açır, uşağının profilini yaradır və nəticələrini izləyir. Uşaq isə 8 rəqəmli giriş ID-si və valideynin təyin etdiyi parolla daxil olub sual həll edir.

Başlamaq üçün dörd addım
1. Valideyn e-poçt və parolla qeydiyyatdan keçir.
2. Uşağın adını, sinfini, şəhərini, rayonunu (şəhərdə rayon varsa) və məktəbini daxil edir.
3. Tətbiq uşağa unikal 8 rəqəmli giriş ID-si verir; parolu valideyn özü təyin edir.
4. Uşaq həmin ID və parolla daxil olub öz bölməsində məşq edir.

Gündəlik raund
Hər fənn üzrə gündə bir raund: məktəb kurikulumunun mövzularından seçilmiş 25 sual. Hər sualın beş variantı (A–E) var və yalnız biri düzgündür. Suallar hər şagird üçün ayrıca seçilir — çətinlik dərəcəsini nə şagird, nə də valideyn seçmir. Raund vaxtla məhdudlaşmır; yarımçıq qalsa, tətbiqə yenidən girəndə eyni yerdən davam edir.

Nəticə və səhvlərin izahı
Raund bitən kimi faiz nəticəsi, düz və səhv cavabların sayı, mövzu üzrə bölgü görünür. Sualların üstünə qayıtmaq olar: düzgün cavab və onun izahı hər sualın yanında göstərilir, ona görə səhvin harada olduğu aydın olur.

Mövzu üzrə məşq
Şagird fənni, mövzunu və alt-mövzunu özü seçib məşq testi başlada bilər. Bu testlər vaxtsızdır və xal, seriya və ya reytinqə təsir etmir — səhv etməkdən qorxmadan çalışmaq üçündür. Dünənki raundu da yenidən həll etmək olar.

Olimpiada paketləri
Olimpiadalara ciddi hazırlaşanlar üçün ayrıca sual bankları. Paket uşağın hesabında açıq olanda hər girişdə yeni suallar verilir: paketdəki suallar tükənənə qədər şagird eyni sualı təkrar görmür. Bu cəhdlər məşq xarakterlidir və reytinqə təsir etmir.

İrəliləyiş, seriya və reytinq
Şagird öz faiz göstəricisini, neçə gün üst-üstə məşq etdiyini və fənlər üzrə güclü-zəif tərəflərini görür. Reytinq cədvəli sinif, məktəb, rayon və şəhər üzrə qurulur. Cədvəldə yalnız rəqəmli yerlər var — medal və ya bal yığımı yoxdur. Ad tam göstərilmir: yalnız ad və soyadın ilk hərfi (məsələn, "Aysel M.").

Valideyn paneli
Valideyn bir hesabdan bütün uşaqlarını görür: hansı fənlərdə irəlilədiyini, hansı mövzularda çətinlik çəkdiyini, neçə raund həll etdiyini və hesabının vəziyyətini. Uşağın məlumatlarını redaktə edə, onu reytinq cədvəlində tapa, lazım olsa hesabını silə bilər. Bildirişlər ayrıca bölmədə toplanır.

İkinci valideyn
Uşağı yaradan valideyn birdəfəlik dəvət kodu hazırlaya bilər. İkinci böyük şəxs həmin kodla eyni uşağı öz hesabına qoşub nəticələrini izləyir. Kod 72 saatdan sonra etibarını itirir, girişi isə istənilən vaxt geri almaq olar.

Fənlər
Riyaziyyat, Elm, Fizika, İnformatika, Məntiq, Azərbaycan dili və İngilis dili. Suallar məktəb kurikulumuna, sinfə və rübə uyğun bölünüb.

Xəbərlər
Tətbiqin xəbər bölməsində olimpiadalar, imtahanlar və platforma yenilikləri haqqında məqalələr dərc olunur.

Dil
Tətbiq tam şəkildə Azərbaycan, ingilis və rus dillərində işləyir. Dil ilk açılışda seçilir və sonra istənilən vaxt dəyişdirilə bilər.

Məxfilik və təhlükəsizlik
Uşaq hesabını yalnız valideyn yarada bilər — uşaqlar özləri qeydiyyatdan keçə bilmir. Uşaqdan e-poçt ünvanı və ya telefon nömrəsi istənilmir. Tətbiqdə reklam yoxdur: nə reklam şəbəkəsi, nə də reklam SDK-sı var, reklam identifikatoru heç vaxt oxunmur və uşağın məlumatları reklam məqsədi ilə istifadə olunmur. Tətbiq yalnız işləməsi üçün lazım olan xidmətlərdən istifadə edir: məlumatların saxlanması, tətbiq yeniləmələri və bildirişlər, bir də nasazlıq hesabatları. Proqramda xəta baş verəndə gedən texniki hesabata uşağın adı, giriş ID-si və məktəbi düşmür. Bu xidmətlərin tam siyahısı məxfilik siyasətindədir. Valideyn öz hesabından uşağın məlumatlarını düzəldə və ya hesabı bütünlüklə silə bilər.

Qeyd
Fənlər üzrə giriş hüququnu yalnız valideyn öz hesabı üzərindən idarə edir. Uşağın hesabında aktiv giriş hüququ olmayanda bəzi bölmələr açılmır və tətbiq uşağa valideyninə müraciət etməyi təklif edir.
```

### 3.2 en-US — 3885 chars (CRLF)

```
OlympIQ is an olympiad-preparation and daily practice app for students in grades 1–11. A parent opens the account, creates a profile for each child and follows their results. The child signs in with an 8-digit ID and a password the parent sets, and works through questions in their own section.

Four steps to start
1. The parent registers with an email address and a password.
2. They enter the child's name, grade, city, school, and the district where the city has one.
3. The app issues the child a unique 8-digit sign-in ID; the parent sets the password.
4. The child signs in with that ID and password and starts practising.

The daily round
One round per subject per day: 25 questions drawn from the school curriculum. Every question has five options (A–E), exactly one of them correct. The set is chosen individually for each student — neither the child nor the parent picks a difficulty level. The round is untimed, and an unfinished round resumes where it stopped.

Results and explanations
As soon as a round ends, the app shows the percentage score, how many answers were right and wrong, and a breakdown by topic. Every question can be reopened with the correct answer and its explanation beside it, so it is clear where the mistake was.

Practice by topic
A student can pick a subject, a topic and a subtopic and start a practice test. These tests are untimed and affect no points, no streak and no ranking, so a mistake costs nothing. Yesterday's round can also be solved again.

Olympiad packages
Separate question banks for students preparing seriously. While a package is open on the child's account, every attempt serves new questions: the same question does not come back until that package's pool runs out. These attempts are practice and never affect the rankings.

Progress, streaks and rankings
A student sees their percentage score, how many days in a row they have practised, and which subjects are strong or weak. Leaderboards are built by class, school, district and city and show numeric places only — no medals, no point farming. Names are never shown in full: a first name and the initial of the surname ("Aysel M.").

Parent panel
From one account a parent sees every child: which subjects they are progressing in, which topics they struggle with, how many rounds they have done and the state of their account. A parent can edit a child's details, find them on the leaderboard and delete the account. Notifications have their own section.

A second parent
The parent who created the child can generate a one-time invite code. Another adult uses it to join the same child to their own account and follow the results. The code expires after 72 hours, and access can be taken back at any time.

Subjects
Mathematics, Science, Physics, Informatics, Logic, Azerbaijani and English. Questions are organised by curriculum, grade and school term.

News
The news section carries articles about olympiads, exams and platform updates.

Languages
The app works fully in Azerbaijani, English and Russian. The language is chosen when the app first opens and can be changed at any time.

Privacy and safety
Only a parent can create a child account — children cannot register themselves. A child is never asked for an email address or a phone number. There is no advertising: no ad network, no ad SDK, no advertising ID is ever read, and a child's data is never used for advertising. The app uses only the services it needs to run: data storage, app updates and notifications, and crash reports. A fault report carries no child's name, login ID or school. The privacy policy lists them all. A parent can correct a child's details, or delete the account entirely, from their own account.

Note
Access to subjects is managed only by the parent, from their own account. When a child's account has no active access, some sections do not open and the app tells the child to ask their parent.
```

### 3.3 ru-RU — 3841 chars (CRLF)

```
OlympIQ — приложение для подготовки к олимпиадам и ежедневной практики для школьников 1–11 классов. Родитель заводит аккаунт, создаёт профиль ребёнку и следит за его результатами. Ребёнок входит по 8-значному ID и паролю, который задал родитель, и решает задания в своём разделе приложения.

Четыре шага для начала
1. Родитель регистрируется по электронной почте и паролю.
2. Указывает имя ребёнка, класс, город, школу и район, если он есть в этом городе.
3. Приложение выдаёт ребёнку уникальный 8-значный ID для входа; пароль задаёт родитель.
4. Ребёнок входит с этим ID и паролем и начинает заниматься.

Ежедневный раунд
Один раунд по предмету в день: 25 вопросов из школьной программы. У каждого вопроса пять вариантов (A–E), верный только один. Набор подбирается для каждого ученика отдельно — сложность не выбирает ни ребёнок, ни родитель. Раунд не ограничен по времени, а незавершённый продолжается с того же места.

Результат и разбор ошибок
Сразу после раунда видны процент правильных ответов, число верных и неверных и разбивка по темам. К любому вопросу можно вернуться: рядом показаны правильный ответ и пояснение, поэтому понятно, где именно была ошибка.

Практика по темам
Ученик может сам выбрать предмет, тему и подтему и запустить тренировочный тест. Такие тесты идут без таймера и не влияют ни на баллы, ни на серию, ни на рейтинг, поэтому ошибаться не страшно. Вчерашний раунд тоже можно пройти заново.

Олимпиадные пакеты
Отдельные банки заданий для тех, кто готовится всерьёз. Пока пакет открыт на аккаунте ребёнка, при каждом входе выдаются новые вопросы: один и тот же вопрос не повторяется, пока не закончится пул пакета. Эти попытки тренировочные и на рейтинг не влияют.

Прогресс, серия и рейтинги
Ученик видит свой процент, сколько дней подряд он занимается и по каким предметам он сильнее или слабее. Таблицы строятся по классу, школе, району и городу и показывают только числовые места — без медалей и накрутки баллов. Имя целиком не показывается: только имя и первая буква фамилии («Айсель М.»).

Родительская панель
Из одного аккаунта родитель видит каждого ребёнка: по каким предметам он продвигается, какие темы даются тяжело, сколько раундов пройдено и в каком состоянии аккаунт. Родитель может изменить данные ребёнка, найти его в таблице и при необходимости удалить аккаунт. Уведомления собраны в отдельном разделе.

Второй родитель
Родитель, создавший ребёнка, может выпустить одноразовый код-приглашение. Другой взрослый по этому коду подключает того же ребёнка к своему аккаунту и следит за результатами. Код действует 72 часа, а доступ можно отозвать в любой момент.

Предметы
Математика, естественные науки, физика, информатика, логика, азербайджанский и английский язык. Вопросы разложены по школьной программе, классам и четвертям.

Новости
В разделе новостей выходят материалы об олимпиадах, экзаменах и изменениях на платформе.

Языки
Приложение полностью работает на азербайджанском, английском и русском. Язык выбирается при первом запуске и меняется в любой момент.

Конфиденциальность и безопасность
Аккаунт ребёнка создаёт только родитель — самостоятельная регистрация детей невозможна. У ребёнка никогда не спрашивают e-mail или номер телефона. Рекламы нет: ни рекламной сети, ни рекламного SDK, рекламный идентификатор не считывается никогда, и данные ребёнка не используются в рекламных целях. Приложение использует только те сервисы, которые нужны для его работы: хранение данных, обновления и уведомления, а также отчёты о сбоях. При ошибке уходит технический отчёт, и имя ребёнка, его ID для входа и школа в него не попадают. Родитель может исправить данные ребёнка или полностью удалить аккаунт из своего кабинета.

Важно
Доступом к предметам управляет только родитель из своего аккаунта. Если активного доступа на аккаунте ребёнка нет, часть разделов не открывается и приложение предлагает ребёнку обратиться к родителю.
```

---

## 4. Keywords (App Store only, 100 chars)

Play has no keyword field — it indexes the name and descriptions instead.

```
olimpiada,test,riyaziyyat,məntiq,ingilis,fizika,informatika,şagird,məktəb,olympiad,quiz
```

87 chars. Comma-separated, no spaces after commas (a space wastes a character). Do not
repeat words already in the app name — Apple indexes those separately.

**Reviewed 2026-09-22 and left unchanged.** It is an App Store field only, Apple has
already approved the listing with it, and it plays no part in the Play fix. Noted for the
next App Store update rather than changed now: the list predates Azərbaycan dili becoming
a subject, and `azərbaycan` would fit in the 13 spare characters.

---

## 5. Copy rules — what must never appear

Two independent rule sets apply to every string in §1–§3 and to every pixel in §6. Both
have to hold; satisfying one at the cost of the other is how a metadata rejection becomes
a payments rejection.

### 5.1 Payments silence (from `docs/STORE_PAYMENTS_COMPLIANCE.md`)

Store copy is read by humans at both companies, and Azerbaijan gets no anti-steering
relief.

- **No price, in any currency.** Not "3 AZN", not "aylıq abunə", not "pulsuz sınaq".
- **No purchase call to action** — no "Abunə ol", "Satın al", "Subscribe", "Get access
  now".
- **No link or instruction to buy on the web.** The Play *Website* field and the privacy
  policy URL are separate metadata fields and are fine; the description body must never
  say where to pay.
- **No discount, promotion or trial terms.** A percentage is promotional information even
  without a currency beside it.
- **Access language only.** "aktiv giriş hüququ" / "active access", managed by the
  parent. Never "buy", "purchase", "subscription" in a body users read.
- **This applies to the Android listing and the Android binary.** iOS sells through
  StoreKit and that is approved, but the *store listing text is shared* between the two
  stores in this file, so the text obeys the stricter rule.

### 5.2 Metadata policy (Google's own list, and what the 2026-09-22 rejection adds)

<https://support.google.com/googleplay/android-developer/answer/9898842>

- **No claim of store performance or ranking** — "#1", "App of the Year", "Best of Play",
  "Popular", "Editor's Choice".
- **No unattributed or anonymous testimonials.** Any endorsement must be attributed.
- **No competitor or unrelated brand names**, and no "works like <other app>".
- **No keyword stuffing** — no repeated or unrelated keywords, no keyword lists pretending
  to be sentences.
- **No emoji, no repeated special characters, no ALL CAPS** — and the ALL-CAPS half
  applies to the **whole listing**, not only the name. The line that stood here until
  2026-09-22 ("section headers inside the long description are conventional and are not
  the name") is withdrawn: Google treats capitalisation as part of the improper
  *formatting* the Metadata policy rejects across listing metadata, and the only exception
  is a brand genuinely written that way — `OlympIQ` qualifies, `GÜNDƏLİK RAUND` does not.
  Every header in §3 is sentence case in all three locales, and a new one is written that
  way. Getting this wrong on a listing already cited for metadata is a free second finding.
- **Nothing the app cannot do.** Every sentence in §3 is checkable against a screen in
  `mobile-app/src/app`. If a feature is removed from the app, the sentence leaves this
  file in the same change.
- **NEW, from this rejection: the listing must *convey* the experience, not merely avoid
  lying about it.** Accurate-but-empty fails. This is why §3 names the unit of use and why
  §6.4 forbids an auth screen in the screenshot set.
- **No word that implies the app is for children only** in a way that contradicts the
  Target audience answer (§8) — parents are genuine users of the parent panel.

The `QEYD` / `NOTE` / `ВАЖНО` paragraph at the end of each description exists precisely to
be honest about access gating without breaking 5.1. **Do not delete it.** Omitting it
risks a "misleading functionality" finding the moment a reviewer opens a locked section —
which, on an app whose reviewer signs in as a parent and creates a child, is likely.

---

## 6. Visual assets

### 6.1 Generated and ready

Stored in `mobile-app/store-assets/`.

| File | Size | Used for |
|---|---|---|
| `play-icon-512.png` | 512×512 | Play *App icon* (downscaled from the 1024 master) |
| `play-feature-1024x500-az.png` | 1024×500 | Play *Feature graphic*, default listing |
| `play-feature-1024x500-en.png` | 1024×500 | Optional, only if the en listing gets localised graphics |
| `play-feature-1024x500-ru.png` | 1024×500 | Optional, same for ru |

Play reuses the default-language graphics for every translated listing that has none of
its own, so the `-az` file alone is sufficient.

The App Store needs **no** feature graphic and takes the 1024×1024 master icon directly.

### 6.2 Source art

**Superseded 2026-08-04.** The blue-chevron mark that shipped through v1.3.0 was a
placeholder. The investor delivered the real identity — navy `#141B4D`, purple `#6E5BFF`,
gold `#F2B441`, three ascending bars with a star — and every icon in the product is now
derived from it.

The master library and the full derivation table live in **`docs/brand/README.md`**.
Nothing under `mobile-app/assets/images/` should be hand-edited; regenerate from the
masters instead.

The earlier "the Android icon is inverted" finding is **resolved**: the adaptive icon now
uses the gold-peak mark on a flat navy `#141B4D` plate, which matches the master icon
instead of contradicting it.

### 6.4 SCREENSHOT BRIEF — this is the fix for the 2026-09-22 rejection

Everything else in this file is supporting work. The rejection named the `az-AZ` phone
screenshots, and a new set built to this brief is what clears it. Read §0 first if you
have not.

#### 6.4.1 Technical requirements

Verified against <https://support.google.com/googleplay/android-developer/answer/9866151>
on 2026-09-22.

| Rule | Value |
|---|---|
| Minimum to publish | 2 across device types — but Google's own recommendation for apps is **at least 4 at 1080 px or more**, and this listing is under review, so supply **8** |
| Maximum, phone slot | 8 |
| Each side | 320–3840 px |
| **Shape** | **The longest side may not be more than twice the shortest.** Recommended: 9:16 portrait, minimum **1080×1920** |
| Format | JPEG or **24-bit PNG with no alpha channel** |
| File size | The console states 8 MB per file. The help page no longer repeats it; a 1080×1920 PNG lands around 1–2 MB, so this has never been the binding constraint |

> **The trap, and its real cause.** A modern Android phone captures 1080×2400. That is a
> ratio of 2.22, and Play rejects it — **not** because it is not exactly 9:16, but because
> it breaks the "longest side ≤ 2× shortest" rule. Crop or letterbox to exactly
> **1080×1920** before uploading. (1080×2160 would also pass at exactly 2.0, but 9:16 is
> what Google recommends and what the tablet slots want too, so standardise on 1080×1920
> and stop thinking about it.)

#### 6.4.2 Hard bans — any one of these repeats the rejection

1. **No authentication screens.** No login, no register, no "check your inbox", no
   password reset, no email verification, no language picker, no splash. This is what was
   submitted and what was rejected. A sign-in form is the one screen every app on the
   store shares; it conveys nothing about this one.
2. **No empty states.** No "Hələ məlumat yoxdur", no zero streak, no blank leaderboard, no
   "add your first child". Seed the demo family first (§6.4.3). An empty screen is the
   textbook reading of *blank or generic*.
3. **No real child's data.** No real name, no real 8-digit ID, no real school, no real
   photo. This is a Families-policy app; a screenshot is a public document.
4. **No price, anywhere in frame, on the Android set.** Specifically: never capture the
   public **Xidmətlər** screen, the parent **Abunəlik** tab, or the **FAQ** screen — those
   are the three surfaces where purchase-adjacent text can appear. See §5.1.
5. **No ranking or promotional overlay text** — no "#1", no "Ən yaxşı", no "Pulsuz", no
   "50% endirim", no store badges, no "App of the Year".
6. **No hands, fingers or people interacting with the device**, and no marketing collage
   of several phones in one frame. Google's preview-asset guidance asks for captured
   footage of the app itself.
7. **No mock-ups.** Capture the **actual submitted build** at the version being
   submitted. A screenshot showing something a reviewer cannot reproduce is a Metadata or
   Broken Functionality finding on its own.
8. **No alpha channel.** That fails the upload, not the review — but it fails it silently
   enough to cost an afternoon.

#### 6.4.3 Capture in LIGHT theme, and seed the data first

**Light theme is not a style preference here; it is the fix.** The rejected frames were
very dark, and at the thumbnail size a Play listing renders, a dark screen with two text
blocks is indistinguishable from a blank rectangle. Every frame in the set below is
captured in the app's light theme (student side: the light palette on the profile screen;
parent side: the device in light mode). If a dark-mode set is ever wanted for marketing,
it is an addition, never the submitted set.

**Seed a demo family before capturing.** The state each frame needs:

- One parent account with a throwaway address, and **two** children — the parent home
  looks like a product with two cards and like a stub with one.
- Invented names that are plausible Azerbaijani first names with a surname initial only
  where the UI shows one. Nothing traceable to a real person.
- Each child: a school, a grade, a city and a district filled in, so nothing shows a dash.
- **At least 4 graded daily rounds per child across at least 3 subjects**, with mixed
  right and wrong answers — a 100% result is both implausible and useless for frame 4.
- **A streak of at least 3 days.** Grade rounds on three consecutive Baku days, or seed
  `student_activity_days` directly on staging.
- Enough seeded students in the same grade and city that the leaderboard has **10 or more
  rows** and the demo child is not rank 1 of 1.
- Active access on the subjects being shown, so no frame carries a lock.

Capture on staging with seeded data, never on production with a real family.

#### 6.4.4 The shot list — 8 frames, in this order

Order matters: Play shows the first few frames without scrolling, and a reviewer reads
them as the answer to "what is this app". Frames 1–3 therefore carry the entire pitch.

| # | Screen | Where to find it | Must be visible in frame |
|---|---|---|---|
| 1 | **Student home (arena)** | Sign in as the demo child → lands here | The rank ring with a real number, the three ministats (Xal / Dəqiqlik / Raund) all non-zero, the streak, at least three "Fənn üzrə güc" bars |
| 2 | **A question inside a daily round** | Student → **Sınaq** tab → a subject → Başla | The question text, **all five options A–E**, the progress indicator ("Sual 7 / 25"), the confirm button. Pick a question whose text fits without scrolling |
| 3 | **Result screen** | Finish a round → result | The percentage, right/wrong counts, the per-topic breakdown bars |
| 4 | **Answer review with an explanation open** | Result → review | One **wrong** answer, the correct option marked, and the explanation text expanded. This frame is the product's whole argument — do not substitute a right answer |
| 5 | **Topic test setup** | Student → **Sınaq** → a subject → topic/subtopic picker | The subject, a list of real curriculum topics, and subtopics under one of them, so it is visible that the content is the school curriculum |
| 6 | **Leaderboard** | Student → **Reytinq** tab | 10+ rows, numeric places, the scope filter (sinif / məktəb / rayon / şəhər) visible, the demo child's own row highlighted at a plausible rank |
| 7 | **Parent home** | Sign in as the demo parent | Both child cards with avatar, grade, access pill and the leaderboard chip — the "one account, every child" claim made visual |
| 8 | **Parent analytics** | Parent → **Analitika** tab | The child selector, a per-subject dashboard with real bars, and the topic-strength panel |

**Alternates**, if a frame above cannot be captured cleanly: the student **Olimpiadalar**
tab (package cards with real question counts — verify no price and no CTA is in frame) or
the **Xəbərlər** tab with two or three real articles. Both are genuine features. Neither
replaces frames 1–4.

**On the parent tab bar.** Frames 7 and 8 will show the word **Abunəlik** in the tab bar,
because that is what the tab is called. That is a status label, not a price and not a call
to action, and the same binary is approved on the App Store with it. It is acceptable in
frame. What is **not** acceptable is opening that tab for a screenshot — §6.4.2 rule 4.
(Recorded as a judgement call, not a certainty: if a reviewer ever queries the word, the
answer is that the tab shows plan status and subject access and contains no amount and no
purchase control.)

#### 6.4.5 Captions

Google permits taglines on screenshots and asks for text to be kept to a minimum
(<https://support.google.com/googleplay/android-developer/answer/13393723>). Given the
finding was *fails to clearly convey*, a caption on each frame is worth its risk — but it
must be a plain functional label, never a marketing claim.

Rules: one line, at most six words, in a solid high-contrast band across the **top ~12%**
of the frame, brand navy `#141B4D` on cream or the reverse. No price, no ranking claim, no
exclamation mark, no emoji. The app's own UI must remain the majority of the pixels.

| # | az | en | ru |
|---|---|---|---|
| 1 | Hər fənn üçün gündəlik raund | A daily round in every subject | Ежедневный раунд по каждому предмету |
| 2 | 25 sual, beş variant (A–E) | 25 questions, five options (A–E) | 25 вопросов, пять вариантов (A–E) |
| 3 | Nəticə və mövzu üzrə bölgü | Results, broken down by topic | Результат с разбивкой по темам |
| 4 | Hər səhvin izahı var | Every mistake gets an explanation | У каждой ошибки есть разбор |
| 5 | Mövzu seçib vaxtsız məşq et | Pick a topic, practise untimed | Выберите тему и тренируйтесь без таймера |
| 6 | Sinif, məktəb və şəhər üzrə reytinq | Rankings by class, school and city | Рейтинг по классу, школе и городу |
| 7 | Valideyn paneli — bütün uşaqlar | The parent panel — every child | Родительская панель — все дети |
| 8 | Fənn üzrə irəliləyiş | Progress by subject | Прогресс по предметам |

**Localisation consequence, and it is a real cost.** Google asks for separate screenshots
per language *when the screenshots contain text*. Two of the frames also contain Azerbaijani
UI text regardless of the caption. So:

- **`az-AZ` (default): mandatory.** Eight captioned frames, app in Azerbaijani. This alone
  clears the rejection, because a localisation with no screenshots of its own inherits the
  default listing's.
- **`en-US` and `ru-RU`: strongly recommended, not blocking.** Both localisations already
  carry translated descriptions; leaving Azerbaijani screenshots under an English
  description is itself a mild metadata weakness. Capture the same eight screens with the
  app's language set to English / Russian and the caption band translated. If you upload a
  set for a localisation, upload the **whole** set — a partial set is worse than none.
- If time forces a choice: **ship `az-AZ` and resubmit now**, and add `en`/`ru` in the next
  listing update. A listing update does not require a new release.

#### 6.4.6 Pre-upload checklist

Run this against every file before it goes near the console.

- [ ] Exactly **1080×1920**, verified per file (`file` or the OS properties pane), not
      assumed from the device.
- [ ] 24-bit PNG or JPEG, **no alpha**.
- [ ] Eight files, one per frame, **no composite / collage image**.
- [ ] Frame 1 is not, and no frame is, a sign-in or sign-up screen.
- [ ] No frame contains a zero, a dash, an empty list or a "no data yet" message.
- [ ] No frame contains an AZN amount, "Abunə ol", "Əldə et", a discount percentage, a
      trial period, or `olympiq.ai`.
- [ ] No real child's name, ID, school or photo anywhere in the set.
- [ ] Every frame is from the **build being submitted**, in **light theme**.
- [ ] Captions: ≤6 words, functional, no superlative, no ranking claim, no emoji.
- [ ] The set reads as eight *different* screens at thumbnail size. Shrink them to 120 px
      wide and look: if two are indistinguishable, replace one.

#### 6.4.7 Tablet slots

**Tablet screenshots are a separate slot with its own rules**: a minimum of 4, each side
1080–7680 px, 16:9 landscape or 9:16 portrait.

Phone screenshots were placed in the 7-inch and 10-inch slots for the initial release to
unblock submission. That was a stopgap and it still is: Play flags apps without genuine
large-screen assets as not optimised for tablets, which suppresses tablet-surface
visibility. **It is not what was cited on 2026-09-22** — the finding named the phone
`az-AZ` set — so replacing them is not a blocker on this resubmission. Do it before the
public launch: two Android Studio AVDs at a custom **1080×1920** resolution (density ~240
for the 7-inch, ~200 for the 10-inch) produce an exact 9:16 natively with no
post-processing, and the same eight frames apply.

**Chromebook and Android XR slots are optional.** Left empty. **Promo video** is optional.
Left empty.

### 6.5 App Store screenshots — iPad became mandatory in 1.16.0

`ios.supportsTablet` flipped to **true** in 1.16.0, so App Store Connect now demands an
iPad set alongside the iPhone set already on the listing. Apple asks for the largest
display in each device family and scales the rest itself, so supplying only those two
sizes is complete, not a shortcut.

| Family | Required display | Portrait | Landscape |
|---|---|---|---|
| iPhone | **6.9-inch** | 1320×2868, 1290×2796 or 1260×2736 | 2868×1320, 2796×1290 or 2736×1260 |
| iPad | **13-inch** | **2064×2752** or 2048×2732 | 2752×2064 or 2732×2048 |

- **The 13-inch iPad size is required of any binary that runs on iPad.** There is no
  "the app is phone-shaped so it does not apply" case: the version cannot be submitted
  without it.
- Smaller iPad sizes (12.9", 11", 10.5", 9.7") and the 6.5-inch iPhone are **optional** —
  Apple scales the 13-inch and 6.9-inch sets down to fill them. Supply 6.9-inch for
  iPhone; 6.5-inch is only required when 6.9-inch is absent.
- **1 to 10 per display size**, PNG or JPEG. Play's 2–8 rule does not apply here.
- **No alpha channel, no transparency.** That one fails the *upload*, not the review.
- **Portrait and landscape are both accepted. Capture portrait** — it is the layout the
  app is designed in and what the iPhone set already uses — and do not mix orientations
  inside one set.

> **The trap:** an 11-inch iPad captures at 1668×2388 or 1640×2360, and the 13-inch slot
> **rejects** both — yet an 11-inch model is the iPad most simulator lists put in front of
> you. Only a 13-inch device, or the **iPad Pro 13-inch (M4)** simulator, gives 2064×2752
> natively. Do not upscale an 11-inch capture to fake the size: the text goes visibly
> soft, and a blurry screenshot is what a reviewer reads against Guideline 2.3.3.

**Per localisation.** Screenshots belong to a localisation, but a language added in App
Store Connect **inherits the primary language's screenshots** — everything except
description and keywords defaults from the primary language. The `az` set alone is
therefore enough to publish all three listings, exactly as the Play feature graphic
behaves in §6.1. Upload `en` and `ru` sets only if the captures themselves are
translated, and if you do, that localisation then needs every required size on its own.

The capture rules from **§6.4** apply to the iOS set too — same shot list, same bans, no
real child's name in frame. **One difference, and only one: the iOS binary sells through
StoreKit, so a price is not forbidden on an App Store screenshot.** It is still not wanted
in this set: the eight frames are about what the app teaches, and Apple has already
approved the listing without one.

---

## 7. Field-by-field differences between the two stores

| Concept | Google Play | App Store |
|---|---|---|
| Name | App name, 30 | Name, 30 |
| One-liner | Short description, 80 | Subtitle, 30 |
| Body | Full description, 4000 | Description, 4000 |
| Keywords | none (indexes the name and description) | Keywords, 100 |
| Wide banner | Feature graphic 1024×500, **required** | not used |
| Icon | 512×512 upload | taken from the binary's 1024×1024 |
| Phone shots | 2 minimum, **8 recommended and submitted**, each side 320–3840 px, longest side ≤ 2× shortest — **§6.4** | per device class, exact pixel sizes — §6.5 |
| Tablet shots | 7" + 10" slots, minimum 4, 1080–7680 px | iPad required if the binary supports iPad — **it does, since 1.16.0** (§6.5) |
| Release notes | "What's new", 500 | "What's New in This Version", 4000 |
| Screenshots per locale | a localisation with none inherits the default listing's | a localisation with none inherits the primary language's |

`ios.supportsTablet` is **true** in `app.json` as of 1.16.0, so iPad screenshots are
mandatory for that submission and every one after it, and App Review will test on iPad.
Sizes, counts and the localisation rule: **§6.5**.

---

## 8. Related answers already submitted to Play

Recorded here so a later submission does not contradict an earlier one.

- **Financial features:** *"My app doesn't provide any financial features."* True today —
  the binary is purchase-silent. Revisit when the ABB rail ships, but note that under the
  architecture of record purchasing stays on the web, so this answer may well remain
  unchanged.
- **Data safety — as submitted:** collects data = Yes; encrypted in transit = Yes;
  deletion available = Yes (`https://olympiq.ai/privacy`);
  partial-deletion-without-account-deletion = No. Six types declared — Name, Email
  address, Phone number, User IDs, Photos, App interactions — all *Collected*, none
  *Shared*, none processed ephemerally. Purposes limited to App functionality, Account
  management, Analytics (of these six, App interactions only) and Fraud
  prevention/security (User IDs only). Advertising, marketing and Personalisation are
  deliberately never ticked.
- **Data safety — INCOMPLETE AS SUBMITTED (review, 2026-09-08). Four types are missing
  and one answer is wrong, for data the live builds already collect.** This is not a
  next-release item: the fields shipped months ago, and Play accepts a Data safety
  update without a new release. What the six types above never covered:
  - **Location → Approximate location** — the child's city and rayon, mandatory in
    Add-Child. Play defines the type by area ("greater than or equal to 3 square
    kilometers"), not by sensor, and every city and rayon we store is far above that
    line. **This flips Location from not-collected to collected and puts a "Location"
    line on the public store listing.** *Precise location stays No*, the app requests no
    location permission, and the school is deliberately NOT filed here — it is an
    institution with no address or coordinates in our catalogue, and calling it location
    would force Precise to Yes. Reasoning: `STORE_LAUNCH_PACK.md` §2.2.
  - **Personal info → Other info** — the child's grade and school (and the gender row
    below). Required, because grade and school are mandatory — and since 2026-09-16 so
    is gender, which only reinforces the answer already submitted.
  - **App activity → Other actions** — graded attempts, answers, points, streaks and
    news-article likes ("gameplay, likes" are Google's own examples for this type; *App
    interactions* alone covers navigation, not these).
  - **Device or other IDs** — the push token (Google's example list includes "Firebase
    installation ID"). Optional, and it needs the **Developer communications** purpose,
    which the submitted form has never used, because the push channels include
    `announcement` and `news`.
  - **Change: Phone number → "users can choose"**, not required. The parent phone became
    optional on 2026-08-31 for Apple 5.1.1(v); the form and the privacy policy both still
    say required.
  Step-by-step console instructions, in the order each form asks:
  `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §6.1. Full inventory with every row mapped
  to a type on BOTH forms: the same file, §2.
- **Data safety — the child gender type (migration 169, 2026-09-08; DECLARED on both
  forms 2026-09-15; the field became mandatory on 2026-09-16, migration 178).** A parent
  gives a gender for a child. Play has no data type called "gender", so it files
  under **Personal info → Other info** ("any other personal information such as date of
  birth, gender identity, veteran status, etc."), declared *Collected* — not *Shared*, not
  processed ephemerally — and **two** purposes: **Analytics** for the overall
  statistics, and **Account management** ("the setup or management of a user's account
  with the developer") for the rest — because the privacy policy amended in the same
  round tells parents that authorised staff read the answer on the child's profile and in
  the internal account reports they export, and one staff member reading one child's
  record is not analytics. It shares its type with the grade and the school, which is why
  that type's optionality answer is **"data collection is required"** and not, as first
  written here, "users can choose": Play asks the question per type, and a type carrying
  two mandatory fields is required whatever else it also carries. **Since 2026-09-16 the
  field itself is mandatory** — Add-Child offers Qız or Oğlan and will not create the
  child without one — so the field and its type now agree. **That changes nothing on
  either console**: the submitted optionality answer was already *required*, and a field
  moving from optional to required cannot move it further. What it did change is the
  prose, here and in the privacy policy, which promised parents an optional question in
  three languages while the binary refuses to skip it. With the four types above, ten
  types are declared in total. **It is a minor's data supplied by the parent**, not by
  the child: the Families policy already applies to us through the target-audience answer
  below, and the answer is read by no access, content, difficulty or ranking rule, never
  shown on a leaderboard, removed with the child, and correctable by the parent at any
  time from the child's details. It is **not** withdrawable: the requirement applies to
  children created from 2026-09-16 onward, so an unanswered or "prefer not to say" value
  survives only on children created before it, and nothing returns a new child to the
  *never asked* state.
  **Declared on both forms 2026-09-15, before 1.16.0 was submitted**, which is the rule
  it was written to enforce (root `CLAUDE.md` → "Releasing a new mobile version"): a
  store declaration is part of the submission, so any change to what the app collects
  about a child updates both forms BEFORE the build that collects it is submitted. The
  **OTA freeze** that stood here until 2026-09-09 is discharged with it. Nothing is owed
  on either console for the mandatory-gender change.
  The iOS half of the same declaration
  (*Other Data → Other Data Types*, linked, not tracking; purposes **Analytics** and
  **App Functionality**, Apple's category for "perform customer support" — it has no
  Account management purpose, which is why the two forms name the second use
  differently) is in `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §2, with the reasoning.
- **Data safety — TWO MORE TYPES, from a new third-party recipient (Sentry, 2026-09-11).
  A pre-submission blocker on 1.16.0, in the same shape as the gender row above and owed
  in the same console pass.** All three apps (`mobile-app`, `web-app`, `admin-panel`) now
  link Sentry for crash and error reporting. It is the **first third-party recipient of
  any data in this product**, which is why the privacy policy gained a Sentry row in
  az/en/ru on the same day (`privacy.s7.table`; `docs/PRIVACY_POLICY.md` A7/B7/C7).
  - **Play:** add **App info and performance → Crash logs** and **App info and performance
    → Diagnostics**. The declared-type count goes from **ten to twelve**. Both
    *Collected*, **not** *Shared*, not processed ephemerally, purpose **App functionality**
    — **not Analytics**: the data is read to fix a fault, never to measure behaviour.
  - **App Store:** add **Diagnostics → Crash Data** and **Diagnostics → Other Diagnostic
    Data**. Purposes: **App Functionality** only. **Performance Data stays No**, and the
    only reason it stays No is that tracing is off (`tracesSampleRate: 0`).
  - **Both are answered "NOT linked to a user" and "not used for tracking"** — the only
    two types on either form that carry no identity. **That answer is conditional on
    code, not on policy**, and it holds only while all three of these are true in all
    three apps: `Sentry.setUser()` is never called anywhere; the PII option is off in
    every runtime (`sendDefaultPii: false` on `@sentry/react-native`,
    `dataCollection.userInfo: false` on `@sentry/nextjs` — the option names differ by SDK
    version on purpose); and the scrubbers still run in `beforeSend`/`beforeBreadcrumb`.
    Change any one and the honest answer becomes *linked*, on both forms.
  - **When it is owed:** the SDK is inert until a DSN is set for the build
    (`EXPO_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`), and none is set in any
    environment yet. If 1.16.0 is built WITH the DSN, both forms must carry these types
    **before** it is submitted; if it is built without, nothing is owed — but record which
    way it went, because the binary does not say. Console steps: §8.1 below and
    `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §6.1; reasoning: the same file, §2.6.
- **Target audience:** every age band except "5 and under" — i.e. 6–8 through 18+. A
  mixed child/adult audience, which is accurate: children use the arena, parents own and
  operate the account. Consequence: Google Play's **Families policy applies**. The
  *Designed for Families programme* opt-in stays **off** (root `CLAUDE.md`; the equivalent
  Apple Kids Category commitment is also declined and is sticky).
- **Privacy policy URL:** `https://olympiq.ai/privacy`.

### 8.1 Owner checklist — the declaration corrections, in the order each form asks

Console actions only. The reasoning for every choice, and the full row-by-row
inventory, are in `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §2 and §6.1 — if this
list and that one ever disagree, the launch pack is the source.

**Do this before either console:** amend the privacy policy in az/en/ru. Section 5
lists "location" among what we never collect about a child while section 4 lists the
city and rayon as collected — once the stores show a Location line those two contradict
each other, and the sentence needs to say *device or GPS location, and home address*
instead of the bare word. In the same pass, section 4 still calls the parent phone
required; it has been optional since 2026-08-31.

**App Store Connect** → *App Privacy → Data Collection → Edit*:

1. Add **Location → Coarse Location** — App Functionality; linked **Yes**; tracking **No**.
2. Leave **Precise Location** unticked, and do not add a location permission to the app.
3. Add **Identifiers → Device ID** (push token) — App Functionality; linked Yes; tracking No.
4. Add **Other Data → Other Data Types** (grade, school, gender, profile preferences) —
   App Functionality **+** Analytics; linked Yes; tracking No.
5. Confirm the existing entries, including **Purchases → Purchase History**, which stays:
   the iOS binary ships StoreKit IAP.
6. Publish, then check the product page shows Location under *Data Linked to You*.

**Play Console** → *Policy → App content → Data safety → Manage*:

1. *Data collection and security*: unchanged.
2. *Data types*: tick **Approximate location**, **Personal info → Other info**, **App
   activity → Other actions**, **Device or other IDs**. Leave **Precise location** unticked.
3. *Data usage and handling* — all four are Collected, not Shared, not ephemeral:
   Approximate location (required; App functionality + Account management) · Other info
   (**required**; + Analytics) · Other actions (required; App functionality + Analytics) ·
   Device or other IDs (**optional**; App functionality + Account management + **Developer
   communications**).
4. **Change Phone number** from required to "users can choose".
5. Preview, Save, submit. No new release is needed and none should be waited for.

**Sentry — the crash/diagnostics types, in the same sitting (pre-submission blocker on
1.16.0):**

*App Store Connect* → *App Privacy*: add **Diagnostics → Crash Data** and **Diagnostics
→ Other Diagnostic Data** — App Functionality only; linked **No**; tracking **No**. Leave
**Performance Data** unticked. Afterwards the product page must show *Diagnostics* under
**Data Not Linked to You**.

*Play Console* → *Data safety*: tick **App info and performance → Crash logs** and
**Diagnostics** (ten types become twelve). Both Collected, not Shared, not ephemeral,
purpose **App functionality** only, optionality **"data collection is required"** (no
user-facing toggle exists), and **"linked to a user" = No** on both.

Skip this block only if the production build ships without a Sentry DSN — and if so,
write down that it did.

---

## 9. Change log

| Date | Change |
|---|---|
| 2026-08-04 | Created. Play `az-AZ` listing copy, en/ru translations, asset inventory, icon-inversion finding. Supersedes `STORE_LAUNCH_PACK.md` §1. |
| 2026-08-04 | Real brand identity landed (`docs/brand/`). Icon and feature graphics regenerated on the navy/purple/gold palette with the investor's tagline; the icon-inversion finding is resolved. |
| 2026-09-08 | Optional child gender (migration 169) added to the data-safety inventory in §8 and in `STORE_LAUNCH_PACK.md` §2 — Play *Personal info → Other info*, iOS *Other Data Types*, optional, not shared, and flagged as a minor's data given by the parent. Neither store form is amended yet. |
| 2026-09-08 | That entry declared **Analytics only**, which was narrower than the privacy policy amended the same day: the policy tells parents that authorised staff read the answer on the child's profile and in the internal account reports they export, and that is not analytics. Widened to two purposes on each form — Play **Analytics + Account management**, iOS **Analytics + App Functionality** (Apple files customer support there and has no Account management purpose). Also corrected "withdrawable at any time" to what is actually offered: the answer is changeable at any time, including to "prefer not to say", but never returns to *never asked*. |
| 2026-09-08 | **The declarations were incomplete for data that shipped long before gender.** A review of the whole inventory found the child's grade, city, district and school — collected, linked, required, disclosed in the privacy policy in all three locales — mapped to no type on either form, plus four more unmapped rows (push token, news likes, child sign-in log, profile preferences). Added on Play: **Approximate location** (city + rayon), **Personal info → Other info** (grade + school + gender), **App activity → Other actions**, **Device or other IDs**; changed **Phone number** to optional. Added on iOS: **Coarse Location**, **Device ID**, **Other Data Types**. **Location flips from not-collected to collected on both public listings; Precise location stays No** (the school is an institution with no address or coordinates, so filing it as location would have forced Precise to Yes). The gender row's Play optionality answer flips to *required*, because its type now also carries two mandatory fields. Blocker: the privacy policy says we never collect a child's location. |
| 2026-09-09 | 1.15.0 build 5 approved and released. The OTA freeze on the gender row is discharged by the move to 1.16.0; the same duty is restated as a **pre-submission blocker** on 1.16.0, the build that first collects the field. |
| 2026-09-11 | **Sentry landed in all three apps — the product's first third-party data recipient — so both declarations gain a category neither has ever carried.** Play: *App info and performance → Crash logs* and *Diagnostics* (ten declared types become twelve). App Store: *Diagnostics → Crash Data* and *Other Diagnostic Data*; *Performance Data* stays No because tracing is off. Both Collected, not Shared, not ephemeral, purpose **App functionality** only — not Analytics — and both answered **not linked to a user**, which is the only "not linked" answer on either form and is conditional on `Sentry.setUser()` never being called, the PII option staying off in every runtime, and the scrubbers running. Recorded as a **pre-submission blocker on 1.16.0**, owed in the same console pass as the gender row. The privacy policy was amended in the same change: Sentry is now a named processor in az/en/ru. |
| 2026-09-09 | §7 still claimed `ios.supportsTablet` was false and that Apple would therefore never ask for iPad screenshots — 1.16.0 turned it on, so the sentence was backwards and the requirement it dismissed is now a submission blocker. Corrected, and the missing spec written as **§6.5**: the 13-inch iPad size (2064×2752) is required of any iPad-capable binary, 6.9-inch covers iPhone, 1–10 per size, no alpha channel, and a localisation without its own screenshots inherits the primary language's. |
| 2026-09-16 | **The child gender field became mandatory (migration 178), and §8 still described it as optional.** Add-Child now offers only Qız or Oğlan and will not create the child without one. The Play optionality answer for *Personal info → Other info* does **not** move — it has been *Data collection is required* since 2026-09-08 because grade and school share the type — and Apple never asks the question, so **no console change is owed**. What changed is the prose: the field is no longer described as skippable, the "prefer not to say" withdrawal route no longer exists for new children, and the 1.16.0 declaration blocker is recorded as discharged (both forms were updated 2026-09-15, before submission). The privacy policy was corrected in the same change, in az/en/ru. |
| 2026-09-22 | **Google Play REJECTED the first production submission (1.16.0) under the Metadata policy**, citing the `az-AZ` store-listing screenshots as *"blank, generic, or otherwise fail to clearly convey the expected functionality"*. The submitted set was four near-identical very dark frames of the **authentication flow**. New **§0** records the finding, the two policy pages behind it, and the fact that the second listed entry ("Not adhering to Google Play Developer Programme Policies") is the console's umbrella heading and not a separate violation. |
| 2026-09-22 | **§6.4 rewritten from a six-line capture note into the SCREENSHOT BRIEF**, which is the actual fix: eight frames, an explicit shot list with what must be visible in each, hard bans (no auth screens, no empty states, no real child data, no price, no collage, no mock-ups), **light theme** because the rejected set failed at thumbnail size for being dark, a demo-data seeding spec, captions in all three locales, and a pre-upload checklist. Technical rules re-verified against Google's current help pages: the real constraint is **longest side ≤ 2× shortest** (which is why a 1080×2400 phone capture fails — not a strict 9:16 rule), 24-bit PNG with no alpha, and Google's own recommendation of at least four frames at ≥1080 px. |
| 2026-09-22 | **§2 and §3 rewritten in az/en/ru** as the post-rejection copy, with the old text preserved in the new **§10** marked DO NOT SUBMIT. Three of the changes are accuracy corrections, not polish: the subject list said **six** subjects when the app has **seven** (Azərbaycan dili has been live since migration 151); the leaderboard privacy claim said names "are not shown openly" when a board in fact shows a first name plus a surname initial; and "no third-party tracking" became false when Sentry landed (§8, 2026-09-11) and is now replaced by the narrower, checkable claim that there is no advertising and no advertising use of a child's data. The new body also documents features the listing never mentioned — the four-step start, five options A–E, the result/explanation flow, the topic and subtopic picker, the second-parent invite code, the news section, language choice at first launch, and a parent deleting a child. The app name and the App Store subtitle were reviewed and deliberately left unchanged. |
| 2026-09-22 | §5 split into **5.1 payments silence** and **5.2 metadata policy**, because the two rule sets are independent and satisfying one at the cost of the other is how a metadata rejection becomes a payments rejection. 5.2 gains Google's own prohibitions (store-performance claims, unattributed testimonials, competitor names, keyword stuffing) and the rule this rejection adds: **a listing must convey the experience, not merely avoid lying about it — accurate-but-empty fails.** 5.1 gains an explicit ban on discount and trial terms, which are promotional information even with no currency beside them. |
| 2026-09-22 | **Two more Metadata-policy defects fixed in the §3 copy, in all three locales — both of them plausible second findings on the resubmission.** (1) The privacy paragraph still had to be *replaced* rather than emptied: the rewrite had dropped the false "no third-party tracking" claim but said only that there is no advertising, which gives away the reassuring half for nothing. It now states what the code actually does — no ad network, no ad SDK, no advertising identifier read, no advertising use of a child's data, and one outside service (a crash reporter) that receives a technical fault report carrying no child's name, login ID or school — matching `docs/PRIVACY_POLICY.md` A7/B7/C7 and `mobile-app/src/lib/sentryScrub.ts`, and naming no third-party brand. (2) **Every section header was ALL CAPS** (13 per locale) and is now sentence case, with Azerbaijani orthography checked character by character; §5.2's old carve-out for description headers is withdrawn. The English body was trimmed by 9 wordings to pay for the longer privacy paragraph — no claim was dropped — and the CRLF counts are restated: az 3818, en 3885, ru 3841. |

---

## 10. SUPERSEDED COPY — rejected 2026-09-22. DO NOT SUBMIT.

Everything below is the listing text that was live when Google Play rejected the
submission under the Metadata policy on 2026-09-22. It is kept **only** so that nobody
re-derives it from git history, pastes it back into the console, or wonders whether the
rewrite lost something. **The copy to submit is in §1, §2 and §3.**

Why it is retired, in one line each:

- **App name** — not retired; §1 carries the same values unchanged.
- **Short descriptions** — listed nouns instead of naming what a session is. Not cited by
  Google, but replaced for the same reason the description was.
- **Full descriptions** — accurate but thin, and wrong in three specific places: six
  subjects instead of seven, a leaderboard privacy claim that did not match what the app
  shows, and a "no third-party tracking" claim that Sentry made false (§8). Every section
  header in all three was also ALL CAPS, which is improperly formatted metadata under the
  policy the listing was rejected on (§5.2).

<details>
<summary>The superseded text (click to expand)</summary>

#### SUPERSEDED — App name

Play field: *App name* (30 chars). App Store field: *Name* (30 chars). Same value works
for both.

| Locale | Value | Count |
|---|---|---|
| **az-AZ (default)** | `OlympIQ: Olimpiada hazırlığı` | 28 |
| en-US | `OlympIQ: Olympiad Prep` | 22 |
| ru-RU | `OlympIQ: школьные олимпиады` | 27 |

Plain `OlympIQ` is a valid fallback. The descriptive form exists because both stores
index the name for search, and "olimpiada" is the query real users type. No promotional
words — Play's metadata policy and App Store Guideline 2.3.7 both ban "ən yaxşı",
"#1", "pulsuz", "endirim" and similar in the name.

---

#### SUPERSEDED — Short description / subtitle

Two different fields with two different limits. Do not reuse one for the other.

##### SUPERSEDED — Play short description

| Locale | Value | Count |
|---|---|---|
| az | `1–11-ci siniflər üçün olimpiada hazırlığı: gündəlik testlər və nəticələr.` | 73 |
| en | `Olympiad prep for grades 1–11: daily tests, progress and leaderboards.` | 70 |
| ru | `Подготовка к олимпиадам, 1–11 класс: тесты каждый день и рейтинги.` | 66 |

##### SUPERSEDED — App Store subtitle

| Locale | Value | Count |
|---|---|---|
| az | `Olimpiadaya hazırlıq, 1–11` | 26 |
| en | `Olympiad prep, grades 1–11` | 26 |
| ru | `Подготовка к олимпиадам` | 23 |

---

#### SUPERSEDED — Full description

Play field: *Full description*. App Store field: *Description*. The same body works for
both; the App Store has no equivalent of Play's separate short description, so the
first two lines carry the hook.

##### SUPERSEDED — az-AZ

```
OlympIQ — 1–11-ci sinif şagirdləri üçün olimpiada hazırlığı və gündəlik məşq platforması.

AİLƏ ÜÇÜN BİR HESAB
Valideyn qeydiyyatdan keçir, uşaqlarının profilini yaradır və hamısını bir yerdən izləyir. Uşaq isə 8 rəqəmli şəxsi ID və valideynin təyin etdiyi şifrə ilə daxil olur — uşaqdan e-poçt ünvanı və ya telefon nömrəsi tələb olunmur.

GÜNDƏLİK RAUND
Hər fənn üzrə gündə bir raund: kurikulum mövzularından seçilmiş 25 sual. Suallar hər şagird üçün ayrıca seçilir və çətinlik dərəcəsini heç kim özü seçmir. Raund bitən kimi nəticə görünür — hansı sualın düz, hansının səhv olduğu və izahı ilə birlikdə.

MÖVZU ÜZRƏ MƏŞQ
Konkret bir mövzunu təkrarlamaq üçün vaxt məhdudiyyəti olmayan məşq testləri. Bu testlər bala və reytinqə təsir etmir — səhv etməkdən qorxmadan çalışmaq üçündür. Dünənki raundu da yenidən keçmək olar.

OLİMPİADA PAKETLƏRİ
Olimpiadaya ciddi hazırlaşanlar üçün ayrıca sual bankları. Hər girişdə yeni suallar verilir: şagird paketdəki suallar tükənənə qədər eyni sualı təkrar görmür.

İRƏLİLƏYİŞ VƏ REYTİNQ
Faiz göstəricisi, gündəlik ardıcıllıq və sinif, məktəb, rayon və şəhər üzrə reytinq cədvəlləri. Cədvəldə yalnız rəqəmli yerlər göstərilir — medal və ya bal yığımı yoxdur.

VALİDEYN PANELİ
Valideyn hər uşağın hansı fənlərdə irəlilədiyini, hansı mövzularda çətinlik çəkdiyini və hesabının vəziyyətini görür.

FƏNLƏR
Riyaziyyat, Elm, Fizika, İnformatika, Məntiq və İngilis dili. Suallar məktəb kurikuluma və rüblərə uyğun bölünüb.

DİL
Tətbiq tam şəkildə Azərbaycan, ingilis və rus dillərində işləyir.

MƏXFİLİK VƏ TƏHLÜKƏSİZLİK
Uşaq hesabını yalnız valideyn yarada bilər — uşaqlar özləri qeydiyyatdan keçə bilmir. Reytinq cədvəlində şagird adları açıq göstərilmir. Tətbiqdə reklam yoxdur və üçüncü tərəf izləmə vasitələri istifadə olunmur.

QEYD
Bəzi bölmələrdən istifadə üçün uşağın hesabında aktiv giriş hüququ olmalıdır. Giriş hüququnu yalnız valideyn öz hesabı üzərindən idarə edir.
```

##### SUPERSEDED — en-US

```
OlympIQ is an olympiad-preparation and daily practice platform for school students in grades 1–11.

ONE ACCOUNT FOR THE FAMILY
A parent registers, creates a profile for each child, and follows all of them from one place. Children sign in with an 8-digit personal ID and a password set by their parent — no email address or phone number is ever asked of a child.

THE DAILY ROUND
One round per subject per day: 25 questions drawn from the school curriculum. The set is chosen individually for each student, and nobody picks their own difficulty. Results appear as soon as the round ends, question by question, with explanations.

PRACTICE BY TOPIC
Untimed practice tests for revising a specific topic. They never affect points or rankings, so students can work without worrying about mistakes. Yesterday's round can be replayed too.

OLYMPIAD PACKAGES
Separate question banks for students preparing seriously. Every attempt serves fresh questions — a student does not see the same question twice until that package's pool is exhausted.

PROGRESS AND RANKINGS
A percentage score, a daily streak, and leaderboards by class, school, district and city. Rankings show numeric places only — no medals, no point farming.

PARENT PANEL
Parents see which subjects each child is progressing in, which topics they struggle with, and the state of their account.

SUBJECTS
Mathematics, Science, Physics, Informatics, Logic and English. Questions follow the national curriculum and its school terms.

LANGUAGES
The app works fully in Azerbaijani, English and Russian.

PRIVACY AND SAFETY
Only a parent can create a child account — children cannot register themselves. Student names are not shown openly on public leaderboards. The app contains no advertising and no third-party tracking.

NOTE
Some sections require active access on the child's account. Access is managed only by the parent, from their own account.
```

##### SUPERSEDED — ru-RU

```
OlympIQ — платформа подготовки к олимпиадам и ежедневной практики для школьников 1–11 классов.

ОДИН АККАУНТ НА ВСЮ СЕМЬЮ
Родитель регистрируется, создаёт профиль каждому ребёнку и следит за всеми из одного места. Ребёнок входит по личному 8-значному ID и паролю, который задал родитель, — у ребёнка никогда не спрашивают e-mail или номер телефона.

ЕЖЕДНЕВНЫЙ РАУНД
Один раунд по предмету в день: 25 вопросов из школьной программы. Набор подбирается индивидуально, сложность никто не выбирает сам. Результат виден сразу после раунда — по каждому вопросу, с пояснениями.

ПРАКТИКА ПО ТЕМАМ
Тренировочные тесты без ограничения по времени для повторения конкретной темы. Они не влияют на баллы и рейтинг, поэтому ошибаться не страшно. Вчерашний раунд тоже можно пройти заново.

ОЛИМПИАДНЫЕ ПАКЕТЫ
Отдельные банки заданий для тех, кто готовится всерьёз. При каждом входе выдаются новые вопросы: один и тот же вопрос не повторяется, пока не закончится пул пакета.

ПРОГРЕСС И РЕЙТИНГИ
Процент правильных ответов, ежедневная серия и таблицы по классу, школе, району и городу. В таблицах только числовые места — без медалей и накрутки баллов.

РОДИТЕЛЬСКАЯ ПАНЕЛЬ
Родитель видит, по каким предметам ребёнок продвигается, какие темы даются тяжело и в каком состоянии его аккаунт.

ПРЕДМЕТЫ
Математика, Естествознание, Физика, Информатика, Логика и английский язык. Вопросы разбиты по школьной программе и четвертям.

ЯЗЫКИ
Приложение полностью работает на азербайджанском, английском и русском.

КОНФИДЕНЦИАЛЬНОСТЬ И БЕЗОПАСНОСТЬ
Аккаунт ребёнка может создать только родитель — самостоятельная регистрация детей невозможна. Имена учеников не показываются открыто в публичных рейтингах. В приложении нет рекламы и стороннего трекинга.

ВАЖНО
Для некоторых разделов на аккаунте ребёнка нужен активный доступ. Доступом управляет только родитель из своего аккаунта.
```

</details>
