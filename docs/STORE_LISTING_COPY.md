# OlympIQ — Store listing copy & assets

Authoritative source for everything that appears on a **public store page**: app name,
descriptions, keywords, and the visual assets. Covers Google Play now and the App Store
later — the two stores want the same text in different field shapes, so both are here
side by side rather than in two drifting files.

Supersedes §1 of `mobile-app/markdowns/STORE_LAUNCH_PACK.md` (2026-07-16), whose copy
described the daily round as serving "the same questions for everyone" — untrue since
Round 42, where the set is drawn per student — and mentioned subscriptions/payments,
which must never appear in store copy (see §5).

The rest of that pack (data-safety inventory, reviewer notes, age-rating answers) is
still current; only the listing metadata moved here.

- **Last updated:** 2026-08-04
- **Play status:** submitted for the default `az-AZ` listing
- **App Store status:** not started

---

## 1. App name

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

## 2. Short description / subtitle

Two different fields with two different limits. Do not reuse one for the other.

### 2.1 Play — Short description (80 chars)

| Locale | Value | Count |
|---|---|---|
| az | `1–11-ci siniflər üçün olimpiada hazırlığı: gündəlik testlər və nəticələr.` | 73 |
| en | `Olympiad prep for grades 1–11: daily tests, progress and leaderboards.` | 70 |
| ru | `Подготовка к олимпиадам, 1–11 класс: тесты каждый день и рейтинги.` | 66 |

### 2.2 App Store — Subtitle (30 chars)

| Locale | Value | Count |
|---|---|---|
| az | `Olimpiadaya hazırlıq, 1–11` | 26 |
| en | `Olympiad prep, grades 1–11` | 26 |
| ru | `Подготовка к олимпиадам` | 23 |

---

## 3. Full description (4000 chars)

Play field: *Full description*. App Store field: *Description*. The same body works for
both; the App Store has no equivalent of Play's separate short description, so the
first two lines carry the hook.

### 3.1 az-AZ

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

### 3.2 en-US

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

### 3.3 ru-RU

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

---

## 4. Keywords (App Store only, 100 chars)

Play has no keyword field — it indexes the name and descriptions instead.

```
olimpiada,test,riyaziyyat,məntiq,ingilis,fizika,informatika,şagird,məktəb,olympiad,quiz
```

87 chars. Comma-separated, no spaces after commas (a space wastes a character). Do not
repeat words already in the app name — Apple indexes those separately.

---

## 5. Copy rules — what must never appear

These follow from `docs/STORE_PAYMENTS_COMPLIANCE.md`. Store copy is reviewed by humans
at both companies, and Azerbaijan gets no anti-steering relief.

- **No price, in any currency.** Not "3 AZN", not "aylıq abunə", not "pulsuz sınaq".
- **No purchase call to action** — no "Abunə ol", "Satın al", "Subscribe", "Get access
  now".
- **No link or instruction to buy on the web.** The Play "Website" field and the privacy
  policy URL are separate metadata fields and are fine; the description body must not
  say where to pay.
- **Access language only.** "aktiv giriş hüququ" / "active access", managed by the
  parent. Never "buy", "purchase", "subscription" in a body users read.
- **No claim of a store's endorsement**, no "as featured on", no testimonials, no
  competitor names.
- **No word that implies the app is for children only** in a way that conflicts with the
  Target audience answer (see §8) — parents are genuine users of the parent panel.

The `QEYD` / `NOTE` / `ВАЖНО` paragraph at the end of each description exists precisely
to be honest about access gating without violating any of the above. Do not delete it —
omitting it entirely risks a "misleading functionality" finding when a reviewer hits a
locked section.

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

### 6.4 Screenshots

Play requires 2–8 phone screenshots, PNG or JPEG, ≤8 MB each, **16:9 or 9:16**, each
side 320–3840 px.

> **The trap:** a modern Android phone captures at 1080×2400 (20:9), which Play
> **rejects**. Convert to exactly **1080×1920** before uploading.

Screens worth capturing (4+ at ≥1080 px on each side also makes the listing eligible for
Play promotion):

1. Student home — streak and subject cards
2. A question inside a daily round, showing the 5 options A–E
3. Results screen with an explanation expanded
4. Leaderboard
5. Parent panel — children list
6. Progress / analytics

Before capturing: no real child's name in frame, and no price anywhere.

**Tablet slots (7-inch and 10-inch).** Play accepts phone screenshots in these slots, and
that is what was submitted for the initial release to unblock the process. It is a
stopgap, not a solution: Play flags apps without genuine large-screen assets as not
optimised for tablets, which suppresses tablet-surface visibility. Replace with real
tablet captures before the public launch — two Android Studio AVDs at a custom
**1080×1920** resolution (density ~240 for the 7-inch, ~200 for the 10-inch) produce an
exact 9:16 natively with no post-processing.

**Chromebook and Android XR slots are optional.** Left empty.

**Promo video** is optional. Left empty.

---

## 7. Field-by-field differences between the two stores

| Concept | Google Play | App Store |
|---|---|---|
| Name | App name, 30 | Name, 30 |
| One-liner | Short description, 80 | Subtitle, 30 |
| Body | Full description, 4000 | Description, 4000 |
| Keywords | none (indexes description) | Keywords, 100 |
| Wide banner | Feature graphic 1024×500, **required** | not used |
| Icon | 512×512 upload | taken from the binary's 1024×1024 |
| Phone shots | 2–8, 16:9 or 9:16 | per device class, exact pixel sizes |
| Tablet shots | 7" + 10" slots | iPad required **only if** the binary supports iPad |
| Release notes | "What's new", 500 | "What's New in This Version", 4000 |

`ios.supportsTablet` is currently **false** in `app.json`, so the App Store will not ask
for iPad screenshots. If that ever flips to true, iPad captures become mandatory.

---

## 8. Related answers already submitted to Play

Recorded here so a later submission does not contradict an earlier one.

- **Financial features:** *"My app doesn't provide any financial features."* True today —
  the binary is purchase-silent. Revisit when the ABB rail ships, but note that under the
  architecture of record purchasing stays on the web, so this answer may well remain
  unchanged.
- **Data safety:** collects data = Yes; encrypted in transit = Yes; deletion available =
  Yes (`https://olympiq.ai/privacy`); partial-deletion-without-account-deletion = No.
  Six types declared — Name, Email address, Phone number, User IDs, Photos, App
  interactions — all *Collected*, none *Shared*, none processed ephemerally. Purposes are
  limited to App functionality, Account management, Analytics (App interactions only) and
  Fraud prevention/security (User IDs only). Advertising, marketing and Personalisation
  are deliberately never ticked. Full inventory:
  `mobile-app/markdowns/STORE_LAUNCH_PACK.md` §2.
- **Target audience:** every age band except "5 and under" — i.e. 6–8 through 18+. A
  mixed child/adult audience, which is accurate: children use the arena, parents own and
  operate the account. Consequence: Google Play's **Families policy applies**. The
  *Designed for Families programme* opt-in stays **off** (root `CLAUDE.md`; the equivalent
  Apple Kids Category commitment is also declined and is sticky).
- **Privacy policy URL:** `https://olympiq.ai/privacy`.

---

## 9. Change log

| Date | Change |
|---|---|
| 2026-08-04 | Created. Play `az-AZ` listing copy, en/ru translations, asset inventory, icon-inversion finding. Supersedes `STORE_LAUNCH_PACK.md` §1. |
| 2026-08-04 | Real brand identity landed (`docs/brand/`). Icon and feature graphics regenerated on the navy/purple/gold palette with the investor's tagline; the icon-inversion finding is resolved. |
