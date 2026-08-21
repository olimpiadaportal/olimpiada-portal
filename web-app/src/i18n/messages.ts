import type { Locale } from "./config";

// UI strings for the Web App. Native phrasing per language (not literal).
// Keep all three languages in sync whenever a UI string is added.
//
// NOTE (L21): `admin-panel/src/lib/admin/siteContentRegistry.ts` mirrors a
// curated subset of these strings (the admin "Site content" override editor).
// When you rename/remove/reword a key that the registry lists, update BOTH
// files together.
export const messages: Record<Locale, Record<string, string>> = {
  az: {
    // ---- Notifications (notif.*) — in-app notification center ----
    "notif.bell": "Bildirişlər",
    "notif.title": "Bildirişlər",
    "notif.markAllRead": "Hamısını oxunmuş say",
    "notif.seeAll": "Hamısına bax",
    "notif.empty": "Hələ bildiriş yoxdur",
    "notif.emptyHint": "Yeni bildirişlər burada görünəcək.",
    "notif.delete": "Sil",
    "notif.markRead": "Oxunmuş kimi işarələ",
    "notif.open": "Aç",
    "notif.newLabel": "Yeni bildiriş",
    "notif.dismiss": "Bağla",
    "notif.detailsTitle": "Bildiriş",
    "notif.close": "Bağla",
    "notif.noLink": "Bu bildiriş üçün əlavə keçid yoxdur.",
    "notif.detailsData": "Təfərrüatlar",
    "notif.timeNow": "indi",
    "notif.timeMin": "dəq",
    "notif.timeHour": "saat",
    "notif.timeDay": "gün",
    "notif.filterAll": "Hamısı",
    "notif.cat.olympiad": "Olimpiadalar",
    "notif.cat.progress": "Nəticələr",
    "notif.cat.billing": "Ödənişlər",
    "notif.cat.announcement": "Elanlar",
    "notif.cat.news": "Xəbərlər",
    "notif.prefs.title": "Bildiriş tənzimləmələri",
    "notif.prefs.desc": "Bildirişləri necə almaq istədiyinizi seçin. Övladlarınız üçün tənzimləmələri də buradan idarə edə bilərsiniz.",
    "notif.prefs.yourChannels": "Sizin bildirişləriniz",
    "notif.prefs.children": "Övladlar",
    "notif.prefs.inApp": "Tətbiqdə",
    "notif.prefs.email": "E-poçt",
    "notif.prefs.push": "Push",
    "notif.prefs.channelNote": "aktiv olduqda çatdırılır",
    "notif.prefs.saved": "Yadda saxlanıldı",
    "notif.prefs.saving": "Yadda saxlanılır…",
    "notif.prefs.error": "Alınmadı",
    "notif.prefs.noChildren": "Hələ övlad əlavə edilməyib.",
    // ---- ROUND 11 (web) merged keys ----
    "pricing.perSubjectNote": "Qiymət 1 fənn üçün hesablanır.",
    "subjedit.activeChip": "Aktiv",
    "subjedit.endingChip": "Dövr sonunda bitir",
    "subjedit.save": "Dəyişiklikləri yadda saxla",
    "subjedit.saving": "Yadda saxlanılır…",
    "subjedit.saved": "Dəyişikliklər yadda saxlanıldı.",
    "subjedit.selectedCount": "Seçilmiş fənlər",
    "subjedit.pendingAdd": "Əlavə olunanlar",
    "subjedit.pendingRemove": "Silinənlər",
    // Migration 120 — UN-CANCEL. Ləğvi planlanmış, lakin dövrü hələ bitməmiş
    // fənni yenidən seçmək əlavə ALIŞ deyil: ödəniş yoxdur, dövr olduğu kimi
    // qalır. Ona görə "Əlavə olunanlar" siyahısında yox, öz blokunda görünür.
    "subjedit.pendingReinstate": "Bərpa olunanlar",
    "subjedit.reinstateLine": "{subject} — ləğv geri götürüldü, əvvəlki kimi {date} tarixində yenilənir.",
    "subjedit.reinstateNote":
      "Ləğvi geri götürmək pulsuzdur: artıq ödədiyiniz dövr olduğu kimi qalır, fənn öz tarixində yenilənir və indi heç nə ödəmirsiniz.",
    "subjedit.noChanges": "Dəyişiklik yoxdur",
    // ---- Structured change summary. PRORATION IS RETIRED (owner,
    // 2026-08-17): every subject is billed on ITS OWN cycle, starting the day
    // it is added, so there is no child-wide renewal date and no part-period
    // top-up left to describe. subjedit.estTotal ("estimated new total") and
    // subjedit.nextBilling / .nextBillingLine ("from {date} your subscription
    // will be {total} / {interval}") stated exactly that retired model in one
    // sentence and are GONE; the sentences below explain the model we run. ----
    "subjedit.dueNow": "İndi ödəniləcək",
    "subjedit.dueNowNote":
      "Əlavə etdiyiniz hər fənn üçün seçdiyiniz dövrün tam qiyməti indi ödənilir və həmin dövr bu gün başlayır. Ödəniş günlərə bölünmür.",
    // The rule in one sentence, shown above the subject cards.
    "subjedit.cycleNote":
      "Hər fənn ayrıca ödənilir: fənni əlavə etdiyiniz gün onun öz dövrü başlayır və yalnız həmin dövrün sonunda yenilənir. Bir fənnə görə digərlərinin tarixi dəyişmir.",
    // Per-subject billing block: cycle, price and WHEN each subject renews.
    "subjedit.perSubjectLabel": "Fənlər üzrə ödəniş",
    "subjedit.subjectPlanLine": "{subject} · {cycle} · {price}",
    "subjedit.renewsOn": "{date} tarixində yenilənir",
    "subjedit.switchesOn": "{date} tarixinədək cari dövr, sonra: {cycle}",
    "subjedit.startsToday": "Bu gün başlayır — tam dövrün qiyməti indi ödənilir",
    "subjedit.noteLabel": "Qeyd",
    "subjedit.noteText":
      "Silinən fənlər öz ödənilmiş dövrlərinin sonuna qədər — ən gec {date} tarixinə qədər — aktiv qalır. Silinən fənlərə görə geri ödəniş edilmir.",
    "subjedit.noChargeNow":
      "İndi ödəniş alınmır — ilk ödəniş {date} tarixində olacaq.",
    // Per-subject removal terms: one dated line per removed subject (the single
    // scalar the RPC still returns is the LAST of those dates and cannot
    // describe a plan whose subjects run to different ones), then the no-refund
    // rule once.
    "subjedit.noteLine": "{subject} {date} tarixinə qədər aktiv qalır.",
    "subjedit.noteNoRefund":
      "Silinən fənlərə görə geri ödəniş edilmir. Qalan fənlər öz dövrləri ilə davam edir.",
    // Chip on a subject card whose cycle change is scheduled — a bare cycle
    // name next to a differently-set radio reads as a bug.
    "subjedit.pendingChip": "Sonra: {cycle}",
    "pay.confirmNoCharge": "Təsdiqlə",
    "billing.giveawayNote": "Pulsuz kampaniya dövründə bütün fənlərə giriş ödənişsizdir — abunə ödənişi tələb olunmur.",
    "billing.freeChip": "Pulsuz",
    "pay.cancel": "Ləğv et",
    "billing.selectChild": "Uşaq seçin",
    "addchild.giveawayGranted": "Pulsuz kampaniya dövrü aktivdir — övladınız üçün bütün imkanlar dərhal açıldı!",
    "addchild.freeAccessGranted": "Sizin üçün pulsuz giriş dövrü aktivdir — övladınız üçün bütün imkanlar dərhal açıldı!",
    "freeact.note": "Bu övladınızın hələ giriş ID-si yoxdur. Pulsuz dövr davam edərkən onu ödənişsiz aktivləşdirə bilərsiniz.",
    "freeact.cta": "Pulsuz aktivləşdir",
    "freeact.activating": "Aktivləşdirilir…",
    "freeact.done": "Hazırdır! Giriş ID-si yaradıldı.",
    "parent.auth.phone": "Telefon nömrəsi",
    "parent.auth.phonePh": "50 123 45 67",
    "parent.auth.phoneCountry": "Ölkə kodu",
    "parent.auth.phoneSearch": "Ölkə axtar…",
    "parent.err.phone": "Düzgün telefon nömrəsi daxil edin (ölkə kodu ilə).",
    "profile.phoneLabel": "Telefon",
    "profile.phoneEdit": "Dəyiş",
    "profile.phoneSaved": "Telefon nömrəsi yeniləndi",
    "profile.phoneHint": "Hesabınızla bağlı vacib məsələlərdə sizinlə bu nömrə vasitəsilə əlaqə saxlayırıq.",
    "profile.addPhone": "Nömrə əlavə et",
    "gvw.title": "Pulsuz giriş aktivdir! 🎁",
    "gvw.sub": "Bütün imkanları indi sınayın — ödənişli giriş daha sonra başlayacaq.",
    "gvw.remaining": "Qalan vaxt",
    "gvw.days": "gün",
    "gvw.hours": "saat",
    "gvw.minutes": "dəq",
    "gvw.seconds": "san",
    "gvw.ended": "Kampaniya başa çatdı — pulsuz giriş dövrü bitdi.",
    "gvw.chip": "Pulsuz kampaniya",
    "access.giveaway": "Pulsuz kampaniya",
    "access.freeAccess": "Pulsuz giriş",
    "stk.sectionTitle": "Personaj stikerləri",
    "stk.sectionDesc": "Sevimli mövzunu seç — şən stikerlər səhifələrini bəzəsin.",
    "pal.title": "Rəng dəsti",
    "pal.hint": "Panelin görünüşünü seç. 26 hazır rəng dəsti var.",
    "pal.darkNote": "Rəng dəsti seçdikdə qaranlıq rejim avtomatik söndürülür. Onu yenidən yandırsan, seçimin itmir — qaranlıq rejimi söndürən kimi geri qayıdır.",
    "pal.default": "Standart",
    "pal.group.bright": "Parlaq",
    "pal.group.calm": "Sakit",
    "pal.group.nature": "Təbiət",
    "pal.group.pastel": "Pastel",
    "pal.group.bold": "Cəsarətli",
    "pal.group.neutral": "Neytral",
    "pal.sky": "Səma",
    "pal.ocean": "Okean",
    "pal.cyan": "Firuzəyi",
    "pal.aqua": "Su rəngi",
    "pal.teal": "Dəniz yaşılı",
    "pal.arctic": "Arktika",
    "pal.navy": "Tünd mavi",
    "pal.indigo": "Şahanə indiqo",
    "pal.violet": "Bənövşəyi xəyal",
    "pal.lavender": "Lavanda",
    "pal.rainbow": "Göy qurşağı",
    "pal.aurora": "Şimal işığı",
    "pal.bubblegum": "Saqqız",
    "pal.sakura": "Sakura",
    "pal.rose": "Qızılgül",
    "pal.berry": "Giləmeyvə",
    "pal.coral": "Mərcan",
    "pal.peach": "Şaftalı",
    "pal.sunset": "Gün batımı",
    "pal.amber": "Kəhrəba",
    "pal.sand": "Qum",
    "pal.lime": "Yaşıl limon",
    "pal.mint": "Nanə",
    "pal.emerald": "Zümrüd",
    "pal.forest": "Meşə",
    "pal.graphite": "Qrafit",
    "stk.none": "Stikersiz",
    "stk.empty": "Hələ stiker mövzusu yoxdur — tezliklə!",
    "stk.countTitle": "Stiker sayı",
    "stk.err.generic": "Seçimi yadda saxlamaq alınmadı. Yenidən cəhd et.",
    // ---- Round 9 (merged) ----
    "ana.subject.all": "Hamısı",
    "ana.kpi.last7": "Son 7 gündə məşqlər",
    "ana.chart.trendSub30": "Son 30 gün üzrə günlük dəqiqlik (%)",
    "ana.th.questions": "Suallar",
    "ana.rangeNote": "Göstəricilər son 30 günü əhatə edir.",
    "ana.empty.title": "Bu seçim üzrə hələ məşq məlumatı yoxdur.",
    "ana.empty.sub": "Övladınız test həll etməyə başlayanda nəticələr burada görünəcək.",
    "ana.empty.trend": "Trend üçün hələ kifayət qədər məlumat yoxdur.",
    "ana.empty.mistakes": "Bu dövrdə səhv yoxdur — əla nəticə!",
    "ana.mode.label": "Analitika növü",
    "ana.mode.subjects": "Fənlər",
    "ana.mode.olympiads": "Olimpiadalar",
    "ana.olymp.kpi.attempts": "Olimpiada cəhdləri",
    "ana.olymp.perPackage": "Paketlər üzrə nəticələr",
    "ana.olymp.perPackageSub": "Hər olimpiada paketi üzrə cəhdlər, cavablar və dəqiqlik",
    "ana.th.package": "Paket",
    "ana.th.attempts": "Cəhdlər",
    "ana.olymp.empty.title": "Hələ olimpiada cəhdi yoxdur",
    "ana.olymp.empty.sub": "Övladınız olimpiada paketində test həll edəndə nəticələr burada görünəcək.",
    "poly.nav": "Olimpiadalar",
    "poly.title": "Olimpiadalar",
    "poly.subtitle": "Aktiv olimpiada paketlərinə baxın və seçdiyiniz övladınız üçün əldə edin.",
    "poly.chooseChild": "Övlad seçin",
    "poly.noChildren": "Olimpiada paketi almaq üçün əvvəlcə övlad profili yaradın.",
    "poly.addChild": "Övlad əlavə et",
    "poly.none": "Hazırda aktiv olimpiada paketi yoxdur.",
    "poly.owned": "Alınıb",
    "poly.buy": "Əldə et",
    "poly.buyNow": "Əldə et",
    "poly.questions": "sual",
    "poly.price": "Qiymət",
    "poly.free": "Pulsuz",
    "poly.modal.title": "Alışı təsdiqləyin",
    "poly.modal.package": "Paket",
    "poly.modal.child": "Övlad",
    "poly.modal.payNote": "Növbəti addımda bankın ödəniş səhifəsinə keçəcəksiniz. Paket yalnız ödəniş təsdiqləndikdən sonra açılır və girişi ömürlükdür.",
    "poly.modal.confirm": "Təsdiqlə və al",
    "poly.modal.cancel": "İmtina et",
    "poly.modal.close": "Bağla",
    "poly.modal.pending": "Ödəniş icra olunur…",
    "poly.modal.success": "Alış tamamlandı! Paket artıq övladınızın \"Olimpiadalarım\" bölməsində görünür.",
    "poly.modal.already": "Bu paket bu övlad üçün artıq alınıb.",
    "poly.err.generic": "Alış zamanı xəta baş verdi. Zəhmət olmasa bir az sonra yenidən cəhd edin.",
    // Sale window (olympiad_packages.sale_starts_at/sale_ends_at)
    "poly.err.notOnSale": "Bu paketin satış müddəti artıq bitib.",
    "poly.err.notForGrade": "Bu paket seçilmiş şagirdin sinfi üçün nəzərdə tutulmayıb.",
    // Migration 127 — the package became a PAID product on the checkout rail.
    "poly.err.alreadyOwned": "Bu paket bu övlad üçün artıq alınıb — giriş ömürlükdür.",
    "poly.err.priceMoved":
      "Qiymət yeniləndi. Səhifəni yeniləyib yeni qiymətə baxın.",
    "oly5.errNotForGrade": "Bu olimpiada sənin sinfin üçün nəzərdə tutulmayıb.",
    "poly.notOnSale": "Satış bitib",
    // ---- Olympiad card "Ətraflı" details (Round 43) ----
    "poly.details": "Ətraflı",
    "poly.det.type": "Olimpiada növü",
    "poly.det.subject": "Fənn",
    "poly.det.grade": "Sinif",
    "poly.det.grades": "Siniflər",
    "poly.det.questions": "Sual sayı",
    "poly.det.perAttempt": "Hər girişdə sual sayı",
    "poly.det.duration": "Müddət",
    "poly.det.eventAt": "Keçirilmə tarixi",
    "poly.det.saleStart": "Satışın başlama tarixi",
    "poly.det.saleEnd": "Satışın bitmə tarixi",
    "poly.det.price": "Qiymət",
    "poly.det.description": "Təsvir",
    "poly.det.minutes": "dəqiqə",
    // ---- Public olympiad packages section (landing + Services) ----
    "polyPub.eyebrow": "Olimpiadalar",
    "polyPub.title": "Aktiv olimpiada paketləri",
    "polyPub.sub": "Övladınız üçün olimpiada paketi seçin — satış müddəti bitmədən qoşulun.",
    "polyPub.empty": "Hazırda satışda olimpiada paketi yoxdur. Yeni paketlər tezliklə elan olunacaq.",
    "polyPub.salesUntil": "Satış {date} tarixinədək",
    "polyPub.eventAt": "Olimpiada tarixi: {date}",
    "polyPub.cta": "Qeydiyyatdan keç",
    "polyPub.ctaParent": "Paketi əldə et",
    "polyPub.seeAll": "Hamısına bax",
    "polyPub.pageTitle": "Bütün olimpiada paketləri",
    "polyPub.pageLead": "Övladınız üçün uyğun olimpiada paketini seçin — bütün aktiv paketlər burada.",
    "polyPub.statusOnSale": "Satışda",
    "polyPub.error": "Olimpiada siyahısını yükləmək mümkün olmadı. Zəhmət olmasa bir az sonra yenidən cəhd edin.",
    "polyPub.back": "Bütün olimpiadalar",
    "polyPub.howTitle": "Necə iştirak etmək olar?",
    "polyPub.how1": "Valideyn hesabı yaradın və övladınızın profilini əlavə edin.",
    "polyPub.how2": "Paketi valideyn panelindən əldə edin — giriş ömürlükdür, müddəti bitmir.",
    "polyPub.how3": "Övladınız paketin bütün suallarını ayrılmış vaxt ərzində cavablandırır.",
    "polyPub.parentOnlyNote": "Olimpiada paketləri yalnız valideyn hesabından alınır — şagird hesabı ilə alış mümkün deyil.",
    // ---- Child avatar (Add/Edit-Child, parent-managed) ----
    "addchild.avatar.title": "Profil şəkli",
    "addchild.avatar.hint": "Övladınız üçün hazır avatar seçin və ya şəkil yükləyin (istəyə bağlıdır).",
    "addchild.avatar.default": "Standart",
    "addchild.avatar.boy": "Oğlan",
    "addchild.avatar.girl": "Qız",
    "addchild.avatar.upload": "Şəkil yüklə",
    "addchild.avatar.replace": "Şəkli dəyiş",
    "addchild.avatar.removePhoto": "Şəkli sil",
    "addchild.avatar.photoSelected": "Şəkil seçildi",
    "addchild.avatar.requirements": "PNG, JPEG və ya WebP, maksimum 2 MB.",
    // ---- Round 8 (merged) ----
    "about2.hero.eyebrow": "Haqqımızda",
    "about2.hero.title": "Böyük zirvələr kiçik addımlarla fəth olunur",
    "about2.hero.lead": "Hər bir olimpiada qalibinin uğurunun arxasında planlı hazırlıq, davamlı məşq və düzgün istiqamətləndirmə dayanır. OlympIQ məhz bu məqsədlə yaradılmış süni intellekt əsaslı olimpiada hazırlıq platformasıdır. Platformamız 1–11-ci sinif şagirdlərinə biliklərini sistemli şəkildə inkişaf etdirmək, olimpiadalara peşəkar səviyyədə hazırlaşmaq və potensiallarını tam üzə çıxarmaq imkanı yaradır.",
    "about2.hero.p2": "Süni intellekt texnologiyası hər şagirdin nəticələrini təhlil edir, güclü və inkişaf etdirilməsi lazım olan mövzuları müəyyənləşdirir, fərdiləşdirilmiş hesabatlar və öyrənmə tövsiyələri hazırlayır. Beləliklə, hər bir şagird öz bilik səviyyəsinə və ehtiyaclarına uyğun şəkildə inkişaf edir, daha səmərəli öyrənir və məqsədlərinə addım-addım yaxınlaşır.",
    "about2.hero.p3": "Platformada riyaziyyat, elm, məntiq və ingilis dili üzrə minlərlə tapşırıq, olimpiada formatında sınaqlar və gündəlik məşq imkanları təqdim olunur. Suallar şagirdlərin sinif səviyyəsinə və seçilən mövzulara uyğun hazırlanır, müntəzəm məşq isə biliklərin möhkəmlənməsinə və olimpiada bacarıqlarının inkişafına kömək edir.",
    "about2.hero.p4": "OlympIQ-də hesablar valideyn tərəfindən idarə olunur. Valideyn övladlarını əlavə edir, fənn seçimlərini və abunələri idarə edir, şagird isə sadə və təhlükəsiz giriş sistemi vasitəsilə yalnız öyrənməyə fokuslanır. Bu yanaşma həm təhlükəsizliyi təmin edir, həm də valideynlərə hazırlıq prosesini rahat şəkildə idarə etmək imkanı yaradır.",
    "about2.hero.chip1": "1–11-ci siniflər",
    "about2.hero.chip2": "4 fənn",
    "about2.hero.chip3": "3 dildə interfeys",
    "about2.b1.tag": "Gündəlik məşq",
    "about2.b1.title": "Öyrən, cəhd et, yüksəl!",
    "about2.b1.body": "Şagirdlər sinif səviyyəsinə uyğun suallarla hər gün məşq edir. Kiçik, amma davamlı addımlar olimpiadanın tələb etdiyi möhkəm təməli qurur.",
    "about2.b2.tag": "Ailə modeli",
    "about2.b2.title": "Valideyn idarə edir, uşaq öyrənir",
    "about2.b2.body": "Valideyn hər uşağın hesabını yaradır, fənn abunələrini seçir və irəliləyişi bir paneldən izləyir. Uşaq isə sadəcə 8 rəqəmli ID ilə platformaya daxil olur.",
    "about2.b3.tag": "Olimpiada Hazırlığı",
    "about2.b3.title": "Real olimpiada formatında testlər",
    "about2.b3.body": "Hər cəhddə süni intellekt 25 sualı avtomatik seçir — çətinliyi heç kim özü müəyyən etmir. Paketlər bir dəfə alınır və limitsiz giriş imkanı verir.",
    "about2.b4.tag": "Analitika",
    "about2.b4.title": "İrəliləyiş rəqəmlərlə görünür",
    "about2.b4.body": "Nəticələr, fənn üzrə güclü və zəif tərəflər, gündəlik ardıcıllıq — hamısı aydın qrafiklərdə təqdim olunur. Valideyn uşağın hansı tapşırıqları etdiyini və nəticələrini aydın görür.",
    "about2.b5.tag": "Təhlükəsizlik",
    "about2.b5.title": "Uşaqlar üçün təhlükəsiz mühit",
    "about2.b5.body": "Uşaq hesabları e-poçtsuz işləyir və heç vaxt ödəniş edə bilmir — bütün ödənişlər yalnız valideyn hesabından aparılır. Uşaq məlumatları qorunur və icazəsiz marketinq üçün istifadə olunmur.",
    "about2.values.title": "Bir baxışda OlympIQ",
    "about2.values.sub": "Dörd prinsip — bir platforma.",
    "about2.v1.title": "Missiyamız",
    "about2.v1.body": "Keyfiyyətli olimpiada hazırlığını hər ailə üçün əlçatan etmək. Müntəzəm və ölçüləbilən hazırlıq — hər şagird üçün.",
    "about2.v2.title": "Nə təklif edirik",
    "about2.v2.body": "Fənlər üzrə abunələr (Riyaziyyat, Elm, Məntiq, İngilis dili), Olimpiada Hazırlığı paketləri, gündəlik sınaq və irəliləyiş analitikası.",
    "about2.v3.title": "Kimlər üçündür",
    "about2.v3.body": "1–11-ci sinifdə oxuyan şagirdlər və onların valideynləri üçün. Valideyn hesabı idarə edir, uşaq öyrənməyə fokuslanır.",
    "about2.v4.title": "Etibar və şəffaflıq",
    "about2.v4.body": "Suallar serverdə seçilir, nəticələr şəffaf göstərilir, ödənişlər isə təhlükəsiz üsulla yalnız valideyn tərəfindən aparılır.",
    "about2.team.title": "Komandamız",
    "about2.team.sub": "OlympIQ layihəsinin arxasında duran komanda və hüquqi məlumatlar.",
    "about2.team.body": "OlympIQ layihəsi Kamil Piriyev (VÖEN: 6300091352) və tərəfdaşları tərəfindən həyata keçirilir.",
    "about2.team.addrLabel": "Hüquqi ünvan",
    // 3-line postal address: the single \n are rendered as <br> by <CmsProse>.
    "about2.team.addrValue": "Azərbaycan Respublikası,\nLerik rayonu,\nPeştətük kəndi",
    "ana.section.title": "Ətraflı irəliləyiş",
    "ana.section.sub": "Övladı və fənni seçin — nəticələr aşağıda göstərilir.",
    "ana.noChildren": "Analitikanı görmək üçün əvvəlcə övlad profili yaradın.",
    "ana.addChild": "Övlad əlavə et",
    "ana.childLabel": "Övlad",
    "ana.subjectLabel": "Fənn",
    "ana.subject.math": "Riyaziyyat",
    "ana.subject.science": "Elm",
    "ana.subject.logic": "Məntiq",
    "ana.subject.english": "İngilis dili",
    "ana.locked": "Bu fənnin analitikasını açmaq üçün abunə olun.",
    "ana.noActive": "Bu övladın hələ aktiv fənn abunəliyi yoxdur.",
    "ana.goSubscribe": "Abunəliyə keç",
    "ana.kpi.weekly": "Bu həftə məşqlər",
    "ana.kpi.tests": "Tamamlanmış testlər",
    "ana.kpi.correct": "Düzgün cavablar",
    "ana.kpi.wrong": "Səhv cavablar",
    "ana.kpi.skipped": "Buraxılmış cavablar",
    "ana.kpi.accuracy": "Orta dəqiqlik",
    "ana.kpi.time": "Məşq vaxtı",
    "ana.kpi.best": "Ən güclü mövzu",
    "ana.kpi.weak": "Ən zəif mövzu",
    "ana.topic.needSample": "Mövzunu qiymətləndirmək üçün ən azı {n} cavab lazımdır ({a}/{n}).",
    "ana.topic.needTopics": "Müqayisə üçün ən azı {n} mövzu üzrə kifayət qədər cavab lazımdır.",
    "ana.topic.allEqual": "Bütün mövzular eyni səviyyədədir ({p}%) — hələ fərq yoxdur.",
    "ana.kpi.last": "Son fəallıq",
    "ana.chart.weekly": "Həftəlik məşq",
    "ana.chart.weeklySub": "Son 7 gündə tamamlanmış məşqlər",
    "ana.chart.trend": "Dəqiqlik trendi",
    "ana.chart.trendSub": "Son 8 həftə üzrə orta dəqiqlik (%)",
    "ana.chart.topics": "Mövzular üzrə nəticələr",
    "ana.chart.mistakes": "Mövzular üzrə səhvlər",
    "ana.th.topic": "Mövzu",
    "ana.th.subtopic": "Alt mövzu",
    "ana.th.tests": "Testlər",
    "ana.th.accuracy": "Dəqiqlik",
    "ana.th.mistakes": "Səhvlər",
    "ana.day.mon": "B.e",
    "ana.day.tue": "Ç.a",
    "ana.day.wed": "Ç",
    "ana.day.thu": "C.a",
    "ana.day.fri": "C",
    "ana.day.sat": "Ş",
    "ana.day.sun": "B",
    "ana.unit.h": "s",
    "ana.unit.m": "dəq",
    "ana.weekAbbr": "H",
    "ana.topic.fractions": "Kəsrlər",
    "ana.topic.comparingFractions": "Kəsrlərin müqayisəsi",
    "ana.topic.geometry": "Həndəsə",
    "ana.topic.angles": "Bucaqlar",
    "ana.topic.wordProblems": "Mətnli məsələlər",
    "ana.topic.multiStep": "Çoxaddımlı məsələlər",
    "ana.topic.multiplication": "Vurma",
    "ana.topic.plants": "Bitkilər",
    "ana.topic.photosynthesis": "Fotosintez",
    "ana.topic.humanBody": "İnsan orqanizmi",
    "ana.topic.skeleton": "Skelet",
    "ana.topic.matter": "Maddə",
    "ana.topic.statesOfMatter": "Maddənin halları",
    "ana.topic.space": "Kosmos",
    "ana.topic.patterns": "Qanunauyğunluqlar",
    "ana.topic.shapePatterns": "Fiqur qanunauyğunluqları",
    "ana.topic.sequences": "Ardıcıllıqlar",
    "ana.topic.numberSequences": "Ədəd ardıcıllıqları",
    "ana.topic.spatial": "Məkan təfəkkürü",
    "ana.topic.mirror": "Güzgü təsvirləri",
    "ana.topic.puzzles": "Tapmacalar",
    "ana.topic.vocabulary": "Söz ehtiyatı",
    "ana.topic.irregularVerbs": "Qaydasız feillər",
    "ana.topic.grammar": "Qrammatika",
    "ana.topic.presentSimple": "Present Simple zamanı",
    "ana.topic.reading": "Oxu",
    "ana.topic.shortStories": "Qısa hekayələr",
    "ana.topic.listening": "Dinləmə",
    "billing.tab.plans": "Planlar",
    "billing.tab.billing": "Ödəniş",
    "billing.tab.invoices": "Fakturalar",
    "billing.tabsAria": "Abunəlik bölmələri",
    "billing.plansTitle": "Planlar və fənlər",
    "billing.billingTitle": "Ödəniş məlumatları",
    "billing.invoicesTitle": "Fakturalar",
    "billing.invoicesEmpty": "Hələ faktura yoxdur. İlk ödənişiniz baş tutandan sonra fakturalar burada görünəcək.",
    "billing.noBillingYet":
      "Ödəniş məlumatı hələ yoxdur. Plan aktiv olandan sonra ödəniş dövrü, növbəti ödəniş tarixi və məbləğ burada görünəcək.",
    "billing.current": "Cari plan",
    "billing.popular": "Ən populyar",
    "billing.addSubjects": "Fənn əlavə et",
    "billing.noSubjects": "Hələ fənn seçilməyib",
    "billing.totalLabel": "Cəmi",
    "billing.perWeek": "/ həftə",
    "billing.perMonth": "/ ay",
    "billing.perYear": "/ il",
    "billing.row.cycle": "Ödəniş dövrü",
    "billing.row.next": "Növbəti ödəniş tarixi",
    "drawer2.account": "Hesab",
    "drawer2.language": "Dil",
    "drawer2.appearance": "Görünüş",
    "drawer2.session": "Sessiya",
    "drawer2.themeLight": "İşıqlı",
    "drawer2.themeDark": "Qaranlıq",
    "oly4.eyebrow": "Yarışlar",
    "oly4.pageTitle": "Olimpiadalar",
    "oly4.plannedTitle": "Keçirilməsi planlaşdırılan olimpiadalar",
    "oly4.mineTitle": "Olimpiadalarım",
    "oly4.none": "Hazırda planlaşdırılan olimpiada yoxdur.",
    "oly4.details": "Ətraflı",
    "oly4.buyNote": "Bu olimpiadaya qatılmaq üçün valideyninizdən paketi almağı xahiş edin.",
    "oly4.close": "Bağla",
    "oly4.subject": "Fənn",
    "oly4.type": "Olimpiada növü",
    "oly4.date": "Tarix",
    "oly4.qcount": "Sual sayı",
    "oly4.price": "Qiymət",
    "oly4.questions": "sual",
    "oly4.dateTbd": "Tarix dəqiqləşdirilir",
    "oly4.free": "Pulsuz",
    "oly4.status.upcoming": "Qarşıdadır",
    "oly4.status.planned": "Planlaşdırılır",
    "oly4.status.held": "Keçirilib",
    "pricing2.title": "Büdcəyə uyğun qiymətlər",
    "pricing2.sub": "Tariflər hər fənn və hər uşağa görə ayrıca hesablanır. Lazım olan paketi seçin — yekun məbləğ avtomatik hesablanacaq.",
    "pricing2.popular": "Ən populyar",
    "pricing2.sibling.title": "Ailə paketi",
    "pricing2.sibling.body": "Bir ailədən bir neçə uşaq əlavə olunduqda endirim avtomatik tətbiq edilir: 2-ci uşaq üçün -10%, 3-cü və sonrakı hər uşaq üçün -15%. Promo kod tələb olunmur.",
    "pricing2.note": "Göstərilən qiymətlər nümunə xarakteri daşıyır; yekun qiymətlər platforma tərəfindən təsdiqlənəcək.",
    // ---- Public services configurator (cfg.*) — fənn seçimi + canlı qiymət ----
    "cfg.available": "Mövcud fənlər",
    "cfg.availableHint": "Uşağınız üçün lazım olan fənləri əlavə edin.",
    "cfg.selected": "Seçdiyiniz fənlər",
    "cfg.add": "Əlavə et",
    "cfg.addAria": "{subject} fənnini seçimə əlavə et",
    "cfg.removeAria": "{subject} fənnini seçimdən çıxar",
    "cfg.allAdded": "Bütün fənlər artıq seçilib.",
    "cfg.emptySelection": "Qiyməti hesablamaq üçün ən azı bir fənn seçin.",
    "cfg.countLabel": "Seçilmiş fənn",
    "cfg.perSubjectLabel": "Bir fənnin qiyməti",
    "cfg.perSubjectMixed": "fənnə görə dəyişir",
    "cfg.subtotalLabel": "Aralıq cəm",
    "cfg.totalLabel": "Yekun məbləğ",
    "cfg.unpriced": "Bu dövr üçün satışda deyil",
    "cfg.cta": "Davam et",
    "cfg.ctaNoteGuest": "Növbəti addım: valideyn hesabı yaradın — seçiminiz saxlanılır.",
    "cfg.ctaNoteParent": "Növbəti addım: uşaq əlavə edin — bu fənlər hazır seçilmiş gələcək.",
    "cfg.warnAllUnpriced": "Seçdiyiniz fənlər bu ödəniş müddəti üzrə satışda deyil. Başqa müddət seçin.",
    "cfg.warnSomeUnpriced": "{n} fənn bu ödəniş müddəti üzrə satışda deyil və məbləğə daxil edilmir.",
    "cfg.childNote": "Abunəliyi yalnız valideyn hesabı ala bilər.",
    "cfg.serverNote": "Bu hesablama məlumat xarakteri daşıyır. Yekun məbləğ ödəniş anında serverdə hesablanır; ailə endirimi varsa, orada tətbiq olunur.",
    "cfg.loadError": "Qiymətləri yükləmək mümkün olmadı. Bir azdan yenidən cəhd edin.",
    // ---- Per-subject billing cycles (plan.*) — migration 109. Each subject
    // carries its own cycle, so there is no single "billing period" label and
    // no single recurring total; the honest aggregate is plan.dueToday.
    "plan.cycle": "Ödəniş dövrü",
    "plan.cycleAria": "{subject} üçün ödəniş dövrü",
    "plan.cycleChangedAria": "{subject}: {cycle}",
    "plan.group.weekly": "Həftəlik fənlər",
    "plan.group.monthly": "Aylıq fənlər",
    "plan.group.yearly": "İllik fənlər",
    "plan.group.subtotal": "Aralıq cəm",
    "plan.dueToday": "İndi ödəniləcək",
    "plan.dueTodayNote":
      "Fənlərin dövrləri fərqli olduğu üçün vahid dövri məbləğ göstərilmir — hər dövr ayrıca yenilənir.",
    "plan.renewals": "Yenilənmə",
    "plan.renewalLine.weekly": "Həftəlik fənlər hər həftə {total} {currency} yenilənir.",
    "plan.renewalLine.monthly": "Aylıq fənlər hər ay {total} {currency} yenilənir.",
    "plan.renewalLine.yearly": "İllik fənlər hər il {total} {currency} yenilənir.",
    "plan.mixedNote":
      "Hər fənnin öz ödəniş dövrü var. Bir fənnin dövrünü dəyişmək digərlərinə təsir etmir.",
    "plan.fromPrice": "{price}-dan / {cycle}",
    "plan.removeAria": "{subject} fənnini seçimdən çıxar",
    "plan.removeSubject": "Ləğv et",
    "plan.perSubjectHint": "Hər fənn üçün ayrıca ödəniş dövrü seçin.",
    "subjedit.pendingPlanChange": "Dövr dəyişikliyi",
    "subjedit.planChangeLine": "{subject}: {from} → {to} ({date} tarixindən)",
    "subjedit.planChangeNote":
      "İndi heç bir ödəniş alınmır — yeni dövr həmin fənnin növbəti yenilənməsindən qüvvəyə minir.",
    "sub.err.badInterval": "Seçilmiş ödəniş dövrü düzgün deyil.",
    "cfg.noSubjects": "Hazırda satışda olan fənn yoxdur.",
    "cfg.recap.title": "Seçiminiz",
    "cfg.recap.note": "Qeydiyyatdan sonra uşaq əlavə edərkən bu fənlər hazır seçilmiş gələcək.",
    "prof2.accountInfo": "Hesab məlumatları",
    "prof2.name": "Ad",
    "prof2.email": "E-poçt",
    "prof2.security": "Təhlükəsizlik",
    "prof2.securityHint": "Hesabınızın təhlükəsizliyi üçün şifrənizi vaxtaşırı yeniləyin.",
    "prof2.danger": "Təhlükəli zona",
    "prof2.dangerHint": "Hesabınızı silsəniz, valideyn profiliniz, bütün uşaq profilləriniz və onların təlim məlumatları silinəcək. Bu əməliyyatı geri qaytarmaq mümkün deyil. Mühasibat və təhlükəsizlik məqsədi ilə az sayda qeyd adsızlaşdırılmış formada saxlanılır — ətraflı Məxfilik Siyasətində.",
    "prof2.session": "Sessiya",
    "prof2.sessionHint": "Bu cihazda hesabınızdan çıxın.",
    "prof2.idHint": "Bu ID ilə hesabına daxil olursan.",
    "prof2.selected": "Seçilib",
    "app.brand": "OlympIQ",
    "home.subtitle": "Şagird və Valideyn Veb Tətbiqi — ilkin versiya.",
    "supabase.heading": "Supabase bağlantısı",
    "supabase.configured": "qurulub ✓",
    "supabase.notConfigured":
      "qurulmayıb — .env.local.example faylını .env.local edin və Supabase URL + anon açarını əlavə edin",
    "home.note":
      "Giriş, idarə panelləri, gündəlik tapşırıqlar, testlər və hesabatlar sonrakı mərhələlərdə əlavə olunur. Bu səhifə yalnız tətbiqin işə düşdüyünü yoxlayır.",
    "state.loading": "Yüklənir…",
    "error.title": "Xəta baş verdi",
    "error.desc": "Gözlənilməz xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.",
    "action.retry": "Yenidən cəhd et",
    "notFound.title": "Səhifə tapılmadı",
    "notFound.desc": "Axtardığınız səhifə mövcud deyil.",
    "action.goHome": "Ana səhifəyə qayıt",
    "unauthorized.title": "İcazə yoxdur",
    "unauthorized.desc": "Bu səhifəyə girişiniz yoxdur.",
    "lang.label": "Dil",
    "auth.child.err.idFormat": "8 rəqəmli ID daxil edin.",
    "auth.child.err.passwordRequired": "Parolu daxil edin.",
    "auth.child.err.passwordTooShort": "Parol ən az 8 simvol olmalıdır.",
    "auth.child.err.nameTooLong": "Ad çox uzundur (maksimum 80 simvol).",
    "auth.child.err.passwordEqualsId": "Parol ID ilə eyni ola bilməz.",
    "auth.child.err.firstNameRequired": "Adı daxil edin.",
    "auth.child.err.lastNameRequired": "Soyadı daxil edin.",
    "auth.child.err.invalidCredentials": "ID və ya parol yanlışdır.",
    "auth.child.err.locked": "Çox sayda uğursuz cəhd. Bir az sonra yenidən yoxlayın.",
    "auth.child.err.notYourChild": "Bu uşaq sizin hesabınıza aid deyil.",
    "auth.child.err.childNotFound": "Uşaq hesabı tapılmadı.",
    "auth.child.err.createFailed": "Uşaq hesabı yaradıla bilmədi. Yenidən cəhd edin.",
    "auth.child.err.updateFailed": "Parol yenilənə bilmədi. Yenidən cəhd edin.",
    "auth.child.err.serverError": "Server xətası. Yenidən cəhd edin.",
    "auth.child.created": "Uşaq hesabı yaradıldı.",
    "auth.child.passwordReset": "Parol yeniləndi.",
    "nav.home": "Ana səhifə",
    "nav.back": "Geri",
    "nav.subjects": "Fənlər",
    "nav.pricing": "Xidmətlər",
    "nav.news": "Xəbərlər",
    "nav.about": "Haqqımızda",
    "nav.faq": "FAQ",
    "nav.contact": "Əlaqə",
    "nav.login": "Daxil ol",
    "nav.myPanel": "Panelim",
    "nav.register": "Qeydiyyat",
    "foot.rights": "Hər gün bir pillə yuxarı",
    "home.heroTitle": "OlympIQ — Hər gün bir pillə yuxarı",
    "home.heroLead":
      "1–11-ci siniflər üçün olimpiada hazırlığı portalı. Şagirdlər üçün abunə əsaslı platforma — valideyn idarə edir, uşaq öyrənir.",
    "home.ctaStart": "Başla",
    "home.ctaSubjects": "Fənlərə bax",
    "home.ctaOlympiads": "Olimpiadalara bax",
    "home.f1Title": "Valideyn idarəli hesablar",
    "home.f1Desc":
      "Valideyn qeydiyyatdan keçir və hər uşaq üçün ayrı hesab yaradır — uşaq sadə 8 rəqəmli ID ilə daxil olur.",
    "home.f2Title": "Fənn paketləri",
    "home.f2Desc":
      "Hər uşaq üçün fənlər — Riyaziyyat, Elm, Məntiq və İngilis dili — üzrə həftəlik, aylıq və ya illik abunə",
    "home.f3Title": "Olimpiada hazırlığı",
    "home.f3Desc": "Olimpiadalar üzrə xüsusi paketlər — limitsiz giriş və gündəlik sınaqlar",
    "home.f4Title": "Gündəlik məşq",
    "home.f4Desc":
      "Suallar şagirdin səviyyəsinə uyğun serverdə seçilir — həftə içi hər gün yenilənir. Davamlı irəliləyiş.",
    "about.title": "OlympIQ haqqında",
    "about.p1":
      "OlympIQ 1–11-ci sinif Azərbaycan şagirdlərinə olimpiadalara hazırlaşmağa və gündəlik məşqlə möhkəm təməl qurmağa kömək edir.",
    "about.p2":
      "Valideyn idarədədir: hər uşağın hesabını yaradır və idarə edir, fənləri seçir və irəliləyişi izləyir — hamısı bir yerdə.",
    "subjects.title": "Fənlər",
    "subjects.lead":
      "Övladınıza lazım olan fənləri seçin. İstənilən vaxt yenilərini əlavə edə bilərsiniz.",
    "subjects.note":
      "Qiymət hər fənn və hər uşaq üzrədir. Qardaş/bacı endirimi avtomatik tətbiq olunur.",
    "subject.math": "Riyaziyyat",
    "subject.science": "Elm",
    "subject.logic": "Məntiq",
    "subject.english": "İngilis dili",
    "pricing.title": "Xidmətlər",
    "pricing.lead": "Hər uşaq üçün sadə, fənn üzrə qiymət.",
    "pricing.perSubject": "fənn üzrə",
    "pricing.weekly": "Həftəlik",
    "pricing.monthly": "Aylıq",
    "pricing.yearly": "İllik",
    "pricing.trial": "Hər yeni fənn 7 günlük pulsuz sınaqla başlayır.",
    "pricing.sibling":
      "Avtomatik qardaş/bacı endirimi: 2-ci uşaq −10%, 3-cü və sonrakı −15%.",
    "pricing.promo":
      "Başlanğıcda təqdimat kampaniyası olur; qiymətlər nümunəvidir və platforma tərəfindən təyin olunur.",
    "pricing.note":
      "Yalnız valideyn ödəniş edə bilər. Uşaqlar qiymət və ödənişləri görmür.",
    "faq.title": "Tez-tez verilən suallar",
    "faq.q1": "Şagirdin hesabını kim yaradır?",
    "faq.a1":
      "Yalnız valideyn. Qeydiyyatdan sonra valideyn hər uşağı əlavə edir və parol təyin edir. Sistem uşağın daxil olması üçün unikal 8 rəqəmli ID verir.",
    "faq.q2": "Şagirdlər necə daxil olur?",
    "faq.a2":
      "Şagird 8 rəqəmli ID və valideynin təyin etdiyi parolla portala daxil olur. E-poçt tələb olunmur.",
    "faq.q3": "Qiymət necə işləyir?",
    "faq.a3":
      "Hər fənn və hər uşaq üçün (həftəlik, aylıq və ya illik) abunə paketi var. İlk 7 günlük ödənişsiz sınaq və eyni ailədən olan 2 və daha çox uşaq üçün avtomatik bacı/qardaş endirimi verilir.",
    "faq.q4": "Olimpiada Hazırlığı nədir?",
    "faq.a4":
      "Olimpiadaların mövzularına uyğun tərtib edilmiş suallara limitsiz giriş.",
    "faq.q5": "Şagird özü alış edə bilərmi?",
    "faq.a5": "Xeyr. Bütün ödənişləri və abunə paketi seçimlərini yalnız valideyn edir.",
    "contact.title": "Əlaqə",
    "contact.lead": "Sual və ya rəyiniz var? Eşitmək istərdik.",
    "contact.email": "E-poçt",
    "contact.note": "Əlaqə forması tezliklə əlçatan olacaq.",
    "newsp.none": "Hələ xəbər yoxdur.",
    "newsp.back": "← Xəbərlərə qayıt",
    "login.title": "Daxil ol",
    "login.studentTitle": "Şagird girişi",
    "login.studentHint": "8 rəqəmli ID-niz və şifrənizlə daxil olun (e-poçt yox).",
    "login.studentCta": "Şagird kimi daxil ol",
    "login.parentTitle": "Valideyn girişi",
    "login.parentHint": "E-poçt və şifrə ilə daxil olun.",
    "login.lead": "Valideyn və uşaq girişi növbəti mərhələdə əlavə olunur.",
    "register.title": "Valideyn hesabı yarat",
    "register.lead": "Valideyn qeydiyyatı növbəti mərhələdə əlavə olunur.",
    "auth.childLoginHint":
      "Uşaqlar 8 rəqəmli ID və valideynin təyin etdiyi parolla daxil olur.",
    "parent.auth.name": "Adınız",
    "parent.auth.email": "E-poçt",
    "parent.auth.firstName": "Ad",
    "parent.auth.lastName": "Soyad",
    "parent.err.unverified": "E-poçtunuzu təsdiqləyin. Təsdiq linki poçtunuza göndərilib.",
    "verify.title": "E-poçtunuzu təsdiqləyin",
    "verify.body": "Hesabınızı aktivləşdirmək üçün poçtunuza göndərilən təsdiq linkinə klikləyin.",
    "verify.bodyTo": "Təsdiq linkini bu ünvana göndərdik:",
    "verify.hint": "Linki görmürsünüzsə, spam qovluğunu yoxlayın.",
    "verify.resendPrompt":
      "Məktub gəlməyib? E-poçt ünvanınızı yazın — təsdiq linkini yenidən göndərək.",
    "verify.resend": "Linki yenidən göndər",
    "verify.resent":
      "Əgər bu ünvan təsdiq gözləyirsə, təsdiq linki yenidən göndərildi. Poçtunuzu və spam qovluğunu yoxlayın.",
    "verify.resendFailed": "Link göndərilə bilmədi. Bir az sonra yenidən cəhd edin.",
    "verify.state.ok": "E-poçtunuz təsdiqləndi. İndi hesabınıza daxil ola bilərsiniz.",
    "verify.state.expired": "Bu təsdiq linkinin vaxtı bitib. Sizə yeni link göndərə bilərik.",
    "verify.state.failed": "Bu təsdiq linki işləmədi. Ola bilsin ki, artıq istifadə olunub və ya natamam köçürülüb.",
    "confirmed.title": "E-poçtunuz təsdiqləndi",
    "confirmed.body": "Hesabınız aktivdir. İndi daxil ola bilərsiniz.",
    "confirmed.openApp": "OlympIQ tətbiqini aç",
    "confirmed.continueWeb": "Saytda davam et",
    "confirmed.goDashboard": "Panelə keç",
    "confirmed.appHint": "Tətbiq açılmasa, onu telefonunuzdan özünüz açın və e-poçt ünvanınız ilə şifrənizi daxil edin.",
    "confirmed.desktopHint": "Mobil tətbiqdən istifadə edirsinizsə, tətbiqi açıb e-poçt ünvanınız və şifrənizlə daxil olun.",
    "forgot.title": "Şifrəni sıfırla",
    "forgot.hint": "E-poçt ünvanınızı daxil edin — sıfırlama linki göndərəcəyik.",
    "forgot.submit": "Link göndər",
    "forgot.sent": "Əgər bu e-poçt qeydiyyatdadırsa, sıfırlama linki göndərildi. Poçtunuzu yoxlayın.",
    "reset.title": "Yeni şifrə təyin edin",
    "reset.hint": "Hesabınız üçün yeni şifrə daxil edin (ən az 8 simvol).",
    "reset.newPassword": "Yeni şifrə",
    "reset.submit": "Şifrəni yenilə",
    "account.delete": "Hesabı sil",
    "account.deleteConfirm": "Hesabınız, bütün uşaq hesablarınız və onların təlim məlumatları həmişəlik silinəcək. Az sayda qeyd adsızlaşdırılmış formada saxlanılır (Məxfilik Siyasətinə baxın). Davam edilsin?",
    "child.resetPw": "Şifrəni sıfırla",
    "child.newPassword": "Yeni şifrə",
    "child.resetPwSubmit": "Yenilə",
    "child.resetPwOk": "Yeniləndi ✓",
    "child.deleteChild": "Uşağı sil",
    "child.deleteConfirm": "Bu uşaq hesabı həmişəlik silinsin?",
    "parent.auth.password": "Parol",
    "parent.auth.login": "Daxil ol",
    "parent.auth.register": "Hesab yarat",
    "parent.auth.submitting": "Zəhmət olmasa gözləyin…",
    "parent.auth.noAccount": "Hesabınız yoxdur?",
    "parent.auth.haveAccount": "Artıq hesabınız var?",
    "parent.auth.registerNote":
      "Övladınızı əlavə etmək və idarə etmək üçün valideyn kimi qeydiyyatdan keçin.",
    "parent.err.email": "Düzgün e-poçt daxil edin.",
    "parent.err.password": "Parol ən az 8 simvol olmalıdır.",
    "parent.err.tooMany":
      "Həddindən çox cəhd edildi. Zəhmət olmasa bir neçə dəqiqə sonra yenidən yoxlayın.",
    "parent.err.required": "E-poçt və parolu daxil edin.",
    "parent.err.invalid": "E-poçt və ya parol yanlışdır.",
    "parent.err.createFailed":
      "Hesab yaradıla bilmədi. E-poçt artıq istifadədə ola bilər.",
    "parent.nav.dashboard": "İdarə paneli",
    "parent.nav.addChild": "Uşaq əlavə et",
    "parent.nav.logout": "Çıxış",
    "parent.dash.title": "Uşaqlarım",
    "parent.dash.addChild": "Uşaq əlavə et",
    "parent.dash.noChildren": "Hələ uşaq əlavə etməmisiniz.",
    "parent.dash.childId": "Giriş ID",
    "parent.child.title": "Uşaq əlavə et",
    "parent.child.intro":
      "Uşağınızın məlumatlarını daxil edin. Plan seçdikdən sonra 8 rəqəmli giriş ID-si yaradılacaq.",
    "parent.child.first": "Ad",
    "parent.child.last": "Soyad",
    "parent.child.city": "Şəhər",
    "parent.child.citySelect": "Şəhər seçin",
    "parent.child.cityOther": "Digər…",
    "parent.child.cityOtherLabel": "Şəhərin adı",
    "parent.child.school": "Məktəb",
    "parent.child.grade": "Sinif",
    "parent.child.gradeSelect": "Sinif seçin",
    "parent.child.password": "Uşağın parolu",
    "parent.child.passwordHint":
      "Ən az 8 simvol. Uşağınız bunu 8 rəqəmli ID ilə birlikdə istifadə edir.",
    "parent.child.submit": "Uşaq yarat",
    "parent.child.submitting": "Yaradılır…",
    "parent.child.created": "Uşaq hesabı yaradıldı.",
    "parent.child.choosePlan": "Plan seç və ID-ni al",
    "parent.child.choosePlanNote":
      "8 rəqəmli giriş ID-si plan seçildikdən sonra yaradılır. Davam etmək üçün fənləri seçin.",
    "parent.child.idLabel": "8 rəqəmli giriş ID-si",
    "parent.child.idNote":
      "Bu ID-ni saxlayın. Uşağınız onunla və təyin etdiyiniz parolla daxil olur.",
    "parent.child.another": "Yeni övlad əlavə et",
    "access.inactive": "Giriş yoxdur",
    "access.trialing": "Sınaq",
    "access.active": "Aktiv",
    "access.locked": "Bloklanıb",
    "access.expired": "Müddəti bitib",
    "parent.dash.manage": "Fənlər",
    "parent.dash.choosePlan": "Plan seç",
    "parent.dash.idPending": "ID gözləyir — plan seçin",
    "sub.title": "Fənlər və abunəlik",
    "sub.interval": "Ödəniş dövrü",
    "sub.subjects": "Fənlər",
    "sub.subtotal": "Aralıq cəm",
    "sub.siblingNote": "qardaş/bacı endirimi təsdiqlədikdə tətbiq olunur",
    "sub.submit": "7 günlük pulsuz sınağı başlat",
    "sub.submitting": "Başladılır…",
    "sub.done": "Sınaq başladı.",
    "sub.base": "Əsas qiymət",
    "sub.discount": "Qardaş/bacı endirimi",
    "sub.total": "Sınaqdan sonra cəm",
    "sub.totalNow": "Ödəniləcək cəm",
    "sub.trial": "Pulsuz sınaq",
    "sub.days": "gün",
    "sub.previewHint": "Qiyməti görmək üçün ən az bir fənn seçin.",
    "sub.calculating": "Hesablanır…",
    "sub.noSibling": "endirim yoxdur",
    // Migration 127 — the saving is named, not just applied: the parent sees
    // WHICH child earned it and how much it is worth.
    "sub.discount.rank2": "2-ci övlad endirimi",
    "sub.discount.rank3": "3-cü və sonrakı övlad endirimi",
    "sub.discount.hint":
      "İkinci övlad üçün 10%, üçüncü və sonrakılar üçün 15% endirim avtomatik tətbiq olunur.",
    "sub.discount.saved": "Qənaətiniz",
    "sub.noSubjectsAvailable": "Hələ aktiv qiymətli fənn yoxdur.",
    "sub.err.invalid": "Ödəniş dövrünü seçin.",
    "sub.err.noSubjects": "Ən az bir fənn seçin.",
    // Migration 125 — the plan is created only after the bank confirms the
    // payment, so the start-a-plan screen ends on a payment step, not on a
    // "done" message.
    "sub.payFirst": "Ödənişi tamamlayın",
    "sub.payFirstNote":
      "Plan ödəniş təsdiqləndikdən sonra aktivləşəcək. Uşağınızın 8 rəqəmli giriş ID-si də həmin an yaradılacaq və valideyn panelində görünəcək.",
    "sub.trialNoChargeToday":
      "Bu gün heç nə ödənilmir — {days} günlük sınaq müddəti başlayır, ilk ödəniş isə o bitəndən sonra alınacaq.",
    "sub.err.notYourChild": "Bu uşaq sizin hesabınıza aid deyil.",
    "sub.err.idFailed": "Giriş ID-si təyin edilə bilmədi. Yenidən cəhd edin.",
    "sub.err.failed": "Əməliyyat alınmadı. Zəhmət olmasa yenidən cəhd edin.",
    // Migration 127 — the web free branch now goes through the free-only RPC, so
    // a change that turns out to be priced is refused instead of applied. Rare,
    // and it means the prices moved while we were saving.
    "sub.err.priceMoved":
      "Qiymətlər dəyişdi. Səhifəni yeniləyib seçiminizi yenidən təsdiqləyin.",
    "gate.paymentsOff":
      "Ödənişlər müvəqqəti olaraq dayandırılıb. Yeni abunə və satınalmalar hazırda mümkün deyil.",
    "gate.giveawayFree":
      "Hazırda pulsuz kampaniya dövrü davam edir — bütün imkanlar ödənişsiz açıqdır, ödəniş tələb olunmur.",
    "gate.freeAccess":
      "Sizin üçün pulsuz giriş dövrü aktivdir — bütün abunə imkanları hazırda ödənişsiz açıqdır.",
    // Migration 126 — a change that costs money, asked for on a surface that
    // may not take money (the mobile BFF). The copy is bound by
    // docs/STORE_PAYMENTS_COMPLIANCE.md section 5: it states a FACT about where
    // subscriptions are managed and names no price, no destination, no URL and
    // no purchase verb. "Manage it on your web account" is specifically the
    // WRONG form (audit finding I6) — it is the sentence an App Store reviewer
    // screenshots. This one is the shape section 5 lists as right.
    "gate.notInApp":
      "Bu dəyişiklik tətbiqdə tamamlana bilmir. Abunəliklər bu tətbiqdə idarə olunmur.",
    "fa.title": "Pulsuz giriş",
    "fa.sub": "Bütün abunə imkanları hazırda sizin üçün pulsuzdur.",
    "gate.olympiadOff": "Olimpiada modulu hazırda aktiv deyil.",
    "gate.leaderboardOff":
      "Reytinq bölməsi hazırda əlçatan deyil — funksiya administrator tərəfindən müvəqqəti deaktiv edilib.",
    "subjedit.title": "Fənləri idarə et",
    "subjedit.current": "Cari fənlər",
    "subjedit.add": "Əlavə et",
    "subjedit.remove": "Sil",
    "subjedit.addPick": "Fənn seçin",
    "subjedit.none": "Fənn yoxdur.",
    "subjedit.minOne": "Ən az bir fənn qalmalıdır.",
    "subjedit.err.addFailed": "Fənn əlavə edilə bilmədi.",
    "subjedit.err.removeFailed": "Fənn silinə bilmədi.",
    "child.loginNote": "8 rəqəmli ID və valideyninizin təyin etdiyi parolla daxil olun.",
    "child.id": "8 rəqəmli ID",
    "child.password": "Parol",
    "child.login": "Daxil ol",
    "child.loggingIn": "Daxil olunur…",
    "child.parentLogin": "Valideynsiniz? Buradan daxil olun",
    "child.logout": "Çıxış",
    "child.hello": "Salam",
    "child.contentTitle": "Təhsiliniz",
    "child.contentSoon":
      "Gündəlik tapşırıqlar, testlər və olimpiada məşqi tezliklə burada görünəcək.",
    "child.locked.inactive": "Hələ aktiv abunəlik yoxdur",
    "child.locked.locked": "Giriş dayandırılıb",
    "child.locked.expired": "Abunəliyin müddəti bitib",
    "child.lockedNote":
      "Öyrənməyə başlamaq üçün valideyninizdən fənn abunəliyini aktivləşdirməsini xahiş edin.",
    "child.noSubjects": "Hələ fənn yoxdur — valideyninizdən əlavə etməsini xahiş edin.",
    "practice.title": "Məşq",
    "practice.start": "Məşq et",
    "practice.questions": "sual",
    "practice.submit": "Cavabları göndər",
    "practice.submitting": "Göndərilir…",
    "practice.result": "Nəticəniz",
    "practice.back": "İdarə panelinə qayıt",
    "practice.error": "Xəta baş verdi. Yenidən cəhd edin.",
    "oly3.parentTitle": "Olimpiada paketləri",
    "oly3.none": "Hazırda paket yoxdur.",
    "oly3.owned": "Alınıb",
    "oly3.buy": "Al",
    "oly3.childTitle": "Mənim olimpiadalarım",
    "oly3.childNone": "Hələ olimpiada paketi yoxdur — valideyninizdən almasını xahiş edin.",
    "oly3.start": "Başla",
    "oly5.continueTitle": "Davam edən olimpiada cəhdin var",
    "oly5.noticeClosed": "Bu olimpiada cəhdi artıq bağlanıb — ləğv edilib və ya vaxtı bitib.",
    "oly5.errNoAccess": "Bu olimpiadaya girişin yoxdur — valideynindən onu almasını xahiş et.",
    "oly5.errEmpty": "Bu olimpiadada hələ sual yoxdur — tezliklə əlavə olunacaq.",
    "oly5.perAttemptShort": "hər girişdə {n} sual",
    "oly5.practiceOnly":
      "Olimpiada cəhdləri məşq xarakterlidir — xala, faizə və reytinqə təsir etmir.",
    "parent.dash.olympiads": "Olimpiadalar",
    "child.myOlympiads": "Mənim olimpiadalarım",
    "prog.title": "İrəliləyiş",
    "prog.none": "Hələ nəticə yoxdur.",
    "prog.recent": "Son nəticələr",
    "parent.dash.progress": "İrəliləyiş",
    "kind.practice": "Məşq",
    "kind.olympiad": "Olimpiada",
    "kind.test": "Test",
    "kind.daily": "Gündəlik",
    "arena.brand": "OlympIQ",
    "arena.nav.arena": "Ana səhifə",
    "arena.nav.tasks": "Olimpiadalar",
    "arena.nav.rank": "Reytinq",
    "arena.nav.profile": "Profil",
    "arena.streak": "gün üst-üstə",
    "arena.heroEyebrow": "Yarış meydanı",
    "arena.heroTitle": "Növbəti raundu götür, irəli çıx.",
    "arena.startRound": "Raunda başla",
    "arena.join": "Qoşul",
    "arena.rankLabel": "Ölkə üzrə yer",
    "arena.statPoints": "Xal",
    "arena.statAccuracy": "Dəqiqlik",
    "arena.statRounds": "Raund",
    "arena.tickerLive": "CANLI",
    "arena.tickerToday": "BU GÜN",
    "arena.todaysRounds": "Bugünkü raundlar",
    "arena.subjectStrength": "Fənn üzrə güc",
    "arena.questionsShort": "sual",
    "arena.go": "Başla ▸",
    "arena.noStrength": "Hələ məlumat yoxdur — bir raund həll et.",
    "arena.recentRounds": "Son raundlar",
    "arena.lb.title": "Reytinq cədvəli",
    "arena.lb.eyebrow": "Liderlər",
    "arena.lb.country": "Ölkə",
    "arena.lb.region": "Region",
    "arena.lb.school": "Məktəb",
    "arena.lb.grade": "Sinif",
    "arena.lb.colRank": "Yer",
    "arena.lb.colParticipant": "İştirakçı",
    "arena.lb.colAccuracy": "Dəqiqlik",
    "arena.lb.colPoints": "Xal",
    "arena.lb.you": "Siz",
    "arena.lb.soon": "Tam reytinq cədvəli tezliklə açılır — hələlik öz nəticəniz göstərilir.",
    "arena.lb.empty": "Reytinqdə görünmək üçün ilk raundunuzu həll edin.",
    // — L1: real leaderboard (lb.*) —
    "lb.title": "Reytinq cədvəli",
    "lb.eyebrow": "Liderlər",
    "lb.board.points": "Xal",
    "lb.board.percent": "Faiz",
    "lb.board.streak": "Seriya",
    "lb.scope.global": "Ümumi",
    "lb.scope.subject": "Fənn",
    "lb.scope.grade": "Sinif",
    "lb.scope.city": "Şəhər",
    "lb.scope.school": "Məktəb",
    "lb.period.month": "Bu ay",
    "lb.period.all": "Bütün dövrlər",
    "lb.colRank": "Yer",
    "lb.colStudent": "İştirakçı",
    "lb.colPoints": "Xal",
    "lb.colPercent": "Faiz",
    "lb.colStreak": "Seriya",
    "lb.you": "Siz",
    "lb.colCity": "Şəhər",
    "lb.colSchool": "Məktəb",
    "lb.colGrade": "Sinif",
    "lb.subjectLabel": "Fənn",
    "lb.days": "gün",
    "lb.pointsUnit": "xal",
    "lb.empty.month": "Bu ay hələ heç kim nəticə göstərməyib — birinci siz olun!",
    "lb.empty.all": "Hələ heç kim nəticə göstərməyib — birinci siz olun!",
    "lb.empty.streak": "Hələ heç kimin seriyası yoxdur — bu gün başlayın!",
    "lb.myRank.title": "Sizin yeriniz",
    "lb.myRank.none": "Hələ reytinqdə deyilsiniz — ilk raundunuzu bitirin!",
    "lb.provisional": "İlkin",
    "lb.provisionalHint": "Rəsmi yer üçün ən azı {n} raund tələb olunur.",
    "lb.myRank.provisional": "Nəticəniz ilkindir — rəsmi yer üçün {a}/{n} raund lazımdır.",
    "lb.streak.current": "Cari seriya",
    "lb.streak.best": "Rekord",
    "lb.streak.active": "Bu gün seriyanız qorunub — davam edin!",
    "lb.streak.atRisk": "Seriyanı qorumaq üçün təxminən {h} saat qalıb!",
    "lb.streak.lost": "Seriya sıfırlandı — bu gün yenidən başlayın!",
    "plb.title": "Reytinq",
    "plb.seeFull": "Tam reytinqə bax",
    "plb.rankThisMonth": "Bu ayın yeri",
    "plb.rankAllTime": "Ümumi yer",
    "plb.points": "Xal",
    "plb.pointsMonth": "Bu ayın xalı",
    "plb.pointsAllTime": "Ümumi xal",
    "plb.pct": "Faiz",
    "plb.pctMonth": "Bu ayın faizi",
    "plb.pctAllTime": "Ümumi faiz",
    "plb.provisionalShort": "İlkin nəticə",
    "plb.pts": "xal",
    "plb.streak": "Seriya",
    "plb.currentStreak": "Cari seriya",
    "plb.bestStreak": "Ən yaxşı seriya",
    "plb.best": "rekord",
    "plb.notRanked": "Hələ reytinqdə deyilsən — bir testi bitir və cədvələ düş!",
    "plb.notRankedShort": "Hələ reytinqdə deyil",
    "plb.improvementTitle": "Reytinq və irəliləyiş",
    "plb.improvementSub": "Bu övladın reytinqdəki yeri və seriya irəliləyişi.",
    "plb.emptyTitle": "Hələ reytinq fəallığı yoxdur.",
    "plb.emptySub": "Övlad xal qazandıqca yeri və seriyası burada görünəcək.",
    "arena.quizPrev": "Geri",
    "arena.quizConfirm": "Təsdiqlə",
    "arena.quizQuestion": "Sual",
    "arena.quizOf": "/",
    "auth.tab.student": "Şagird",
    "auth.tab.parent": "Valideyn",
    "auth.brandTagline": "Olimpiadalara hazırlıq arenası — hər gün bir raund.",

    // — Cross-cutting (theme + password visibility + nav) —
    "theme.toggle": "Mövzu",
    "theme.light": "İşıqlı",
    "theme.dark": "Qaranlıq",
    "auth.showPassword": "Parolu göstər",
    "auth.hidePassword": "Parolu gizlət",

    // — Round3 D — auth placeholders + existence errors —
    "parent.auth.emailPh": "siz@nümunə.az",
    "parent.auth.passwordPh": "••••••••",
    "parent.auth.firstNamePh": "Adınız",
    "parent.auth.lastNamePh": "Soyadınız",
    "parent.err.emailExists":
      "Bu e-poçt artıq qeydiyyatdadır. Daxil olun və ya şifrəni sıfırlayın.",
    "parent.err.noAccount": "Bu e-poçtla hesab tapılmadı. Əvvəlcə qeydiyyatdan keçin.",
    "parent.err.incompleteAccount":
      "Hesabınız tam qurulmayıb. Bir az sonra yenidən cəhd edin; problem davam edərsə, dəstəyə yazın.",
    "parent.err.staffAccount":
      "Bu e-poçt idarəetmə hesabına aiddir. Valideyn paneli üçün ayrı hesab yaradın.",
    "parent.err.wrongPassword": "Şifrə yanlışdır. Yenidən cəhd edin.",

    // — Round3 D — Add-child wizard (used by D2) —
    "addchild.step.info": "Məlumat",
    "addchild.step.subjects": "Fənlər",
    "addchild.step.plan": "Plan",
    "addchild.step.payment": "Ödəniş",
    "addchild.step.done": "Hazır",
    "addchild.field.city": "Şəhər",
    "addchild.field.school": "Məktəb",
    "addchild.field.grade": "Sinif",
    "addchild.field.selectCity": "Şəhər seçin",
    "addchild.field.selectSchool": "Məktəb seçin",
    "addchild.field.selectGrade": "Sinif seçin",
    "addchild.field.cityFirst": "Əvvəlcə şəhəri seçin",
    "addchild.field.privateSchools": "Özəl məktəblər",
    "addchild.field.publicSchools": "Dövlət məktəbləri",
    "addchild.err.cityRequired": "Şəhəri seçin.",
    "addchild.err.schoolRequired": "Məktəbi seçin.",
    "addchild.err.gradeRequired": "Sinfi seçin.",
    "addchild.field.district": "Rayon",
    "addchild.field.selectDistrict": "Rayon seçin",
    "addchild.field.noDistricts": "Bu şəhər üzrə rayon təyin edilməyib",
    "addchild.err.districtRequired": "Rayonu seçin.",
    "subj.math": "Riyaziyyat",
    "subj.az_language": "Azərbaycan dili",
    "subj.english": "İngilis dili",
    "subj.informatics": "İnformatika",
    "subj.science": "Elm",
    "subj.logic": "Məntiq",
    "addchild.next": "Növbəti",
    "addchild.back": "Geri",
    "addchild.createChild": "Uşağı yarat",
    "addchild.summary": "Yekun",

    // — Payment confirmation (Add-Child step 4 + the plan-change sheet) —
    "pay.title": "Ödəniş",
    "pay.note":
      "Aşağıdakı məbləği təsdiqləyin — abunə dərhal başlayacaq və övladınızın giriş ID-si yaradılacaq.",
    "pay.payNow": "İndi ödə",
    // Migration 125 — the plan-change sheet leads to the bank, so its primary
    // button says so. `pay.payNow` stays for the add-child wizard only.
    "pay.continue": "Ödənişə keç",
    "pay.processing": "Emal olunur…",
    "pay.success": "Ödəniş uğurlu oldu",
    "pay.idRevealed": "Uşağınızın 8 rəqəmli giriş ID-si yaradıldı.",
    "pay.subtotal": "Aralıq cəm",
    "pay.discount": "Endirim",
    "pay.total": "Cəmi",

    // — Pricing (placeholder figures) —
    "pricing.intro":
      "Hər fənn üçün sadə qiymət, hər uşaq üzrə. İstədiyiniz qədər fənn seçin — qiymət avtomatik hesablanır.",
    "pricing.subjectsNote":
      "Qiymət hər fənn və hər uşaq üzrədir. Riyaziyyat, Elm, Məntiq və İngilis dilini ayrıca seçə bilərsiniz.",
    "pricing.perChild": "hər uşaq üçün",
    "pricing.plan.weekly.name": "Həftəlik",
    "pricing.plan.weekly.price": "≈ {price} AZN",
    "pricing.plan.weekly.unit": "həftədə / fənn",
    "pricing.plan.weekly.note": "Qısa müddətə sınamaq üçün uyğundur.",
    "pricing.plan.weekly.save": "",
    "pricing.plan.monthly.name": "Aylıq",
    "pricing.plan.monthly.price": "≈ {price} AZN",
    "pricing.plan.monthly.unit": "ayda / fənn",
    "pricing.plan.monthly.note": "Ən populyar seçim — davamlı öyrənmə üçün.",
    "pricing.plan.monthly.save": "Həftəlik plandan daha sərfəli",
    "pricing.plan.yearly.name": "İllik",
    "pricing.plan.yearly.price": "≈ {price} AZN",
    "pricing.plan.yearly.unit": "ildə / fənn",
    "pricing.plan.yearly.note": "Bütün il üçün ən sərfəli qiymət.",
    "pricing.plan.yearly.save": "Aylıq plandan daha sərfəli",
    "pricing.trialLine": "Hər yeni fənn 7 günlük pulsuz sınaqla başlayır — kart məlumatı tələb olunur, sınaq bitənə qədər ödəniş yoxdur.",
    "pricing.siblingTitle": "Avtomatik qardaş/bacı endirimi",
    "pricing.siblingBody":
      "Birdən çox uşaq əlavə etdikdə endirim avtomatik tətbiq olunur: 2-ci uşaq üçün −10%, 3-cü və sonrakı uşaqlar üçün −15%. Heç bir kod lazım deyil.",
    "pricing.disclaimer":
      "Qeyd: göstərilən qiymətlər nümunəvidir (placeholder) və yekun deyil. Son qiymətlər platforma tərəfindən təsdiqlənəcək.",

    // — About (official multi-section) —
    "about.mission.title": "Missiyamız",
    "about.mission.body":
      "OlympIQ Azərbaycanda 1–11-ci sinif şagirdlərinə güclü akademik təməl qurmağa və olimpiadalara inamla hazırlaşmağa kömək etmək üçün yaradılıb. Məqsədimiz keyfiyyətli, müntəzəm və ölçüləbilən hazırlığı hər ailə üçün əlçatan etməkdir.",
    "about.offer.title": "Platforma nə təklif edir",
    "about.offer.body":
      "Valideyn idarəli uşaq hesabları, fənn üzrə abunələr (Riyaziyyat, Elm, Məntiq və İngilis dili), birdəfəlik ömürlük girişli Olimpiada Hazırlığı paketləri, gündəlik məşq və irəliləyişin izlənməsi — hamısı bir yerdə. Bütün interfeys üç dildə işləyir: Azərbaycan, ingilis və rus.",
    "about.audience.title": "Kimlər üçündür",
    "about.audience.body":
      "Platforma Azərbaycanda 1–11-ci sinifdə oxuyan şagirdlər və onların valideynləri üçün nəzərdə tutulub. Valideyn hesabı yaradır və idarə edir, uşaq isə sadə 8 rəqəmli ID ilə daxil olub öyrənir.",
    "about.trust.title": "Etibar və şəffaflıq",
    "about.trust.body":
      "Suallar sinifə uyğun serverdə seçilir, nəticələr şəffaf şəkildə göstərilir, ödənişlər yalnız valideyn tərəfindən və təhlükəsiz, təsdiqlənmiş üsulla aparılır. Uşaqların məlumatları qorunur və heç vaxt satış məqsədilə istifadə olunmur.",

    // — FAQ (extended) —
    "faq.q6": "7 günlük pulsuz sınaq necə işləyir?",
    "faq.a6":
      "Platformada seçilən hər yeni fənn üçün şagirdə 7 günlük pulsuz sınaq müddəti verilir. Sınaq müddətində ödəniş alınmır. Sınaq bitdikdən sonra seçdiyiniz dövr üzrə ödəniş başlayır.",
    "faq.q7": "Bir ailədən olan 2 və daha çox uşaq üçün endirim varmı?",
    "faq.a7":
      "Bəli. Bacı/qardaş endirimi avtomatik tətbiq olunur. Valideyn qeydiyyat edərkən 2-ci uşaq üçün 10%, 3-cü və sonrakı uşaqlar üçün 15% endirim tətbiq olunur. Heç bir kod daxil etmək lazım deyil. Sistem avtomatik özü hesablayır.",
    "faq.q8": "Testlər necə keçirilir?",
    "faq.a8":
      "Hər test üçün suallar serverdə təsadüfi seçilir (olimpiada cəhdləri 25 sualdan ibarətdir). Şagird çətinlik səviyyəsini özü seçmir — bu, ədalətli və obyektiv qiymətləndirməni təmin edir.",
    "faq.q9": "Məlumatlarımız necə qorunur?",
    "faq.a9":
      "Şəxsi məlumatlar təhlükəsiz saxlanılır və yalnız xidmətin işləməsi üçün istifadə olunur. Uşaq hesabları valideynə bağlıdır, uşaqlar e-poçt və ya ödəniş məlumatı daxil etmir. Platformadakı məlumatlar 3-cü tərəfə ötürülmür.",
    "faq.q10": "Hansı dillər dəstəklənir? Necə əlaqə saxlaya bilərəm?",
    "faq.a10":
      "Platforma Azərbaycan (əsas), ingilis və rus dillərində işləyir. Sual və ya dəstək üçün bizimlə e-poçt və WhatsApp üzərindən əlaqə saxlaya bilərsiniz — Əlaqə səhifəsinə baxın.",

    // — Contact (details) —
    "contact.address": "Ünvan",
    "contact.addressValue": "Hökumət Evi, Bakı, Azərbaycan",
    "contact.emailLabel": "Dəstək e-poçtu",
    "contact.phoneLabel": "Telefon",
    "contact.whatsappLabel": "WhatsApp",
    "maintenance.title": "Texniki işlər aparılır",
    "maintenance.body":
      "Sayt qısa müddətlik texniki xidmətdədir. Zəhmət olmasa bir azdan yenidən yoxlayın.",
    "contact.mapsCaption": "Bakı, Hökumət Evi — xəritədə yerimiz.",
    "contact.shortNote":
      "Adətən iş günləri ərzində cavablandırırıq. Sual, təklif və ya texniki dəstək üçün yazın.",
    // The two labelled purposes on the redesigned contact card. contact.emailLabel
    // and contact.shortNote above are KEPT: the mobile contact screen still
    // renders both, and this redesign is web-only.
    "contact.generalTitle": "Suallar və təkliflər",
    "contact.generalDesc":
      "Xidmət, qiymətlər, əməkdaşlıq və ya təklifləriniz barədə bizə yazın.",
    "contact.supportTitle": "Texniki dəstək",
    "contact.supportDesc":
      "Platformada xəta, girişlə bağlı problem və ya ödənişdə çətinlik varsa buraya yazın.",
    "contact.responseTime": "Sorğunuz 24 saat ərzində cavablanacaq.",

    // — Footer —
    "footer.tagline": "1–11-ci siniflər üçün olimpiada hazırlığı portalı",
    "footer.product": "Xidmət",
    "footer.company": "Şirkət",
    "footer.legal": "Hüquqi",

    // ---- Privacy policy (privacy.*) ----
    // Rendered by <PrivacyPolicy/> at /privacy, /help/privacy and
    // /child/help/privacy. The DOCUMENT OF RECORD is docs/PRIVACY_POLICY.md
    // (the copy the owner submits to App Store Connect and Google Play): edit
    // both together, and always edit az + en + ru in the SAME change — the
    // three languages are one legal document and a one-language edit produces a
    // policy that says different things to different regulators.
    // FORMAT: a `*List`/bullet string is ONE ITEM PER LINE; a `*Table` string
    // is "cell | cell | cell" rows whose FIRST line is the header. Both are
    // parsed by src/lib/policyContent.ts and rendered as text nodes only.
    // src/lib/__tests__/policyContent.test.ts fails the build if a key is
    // missing from a language or a table loses a column/row somewhere.
    // Values the code cannot know (dates, hosting region, retention periods)
    // are NOT in here — they live in src/lib/privacyPolicy.ts so the owner
    // answers each one once instead of three times.
    // PAYLOAD: src/app/layout.tsx strips the `privacy.` prefix out of the
    // client dictionary (it is 30–44 KB and that dict lands in every page's
    // HTML). Read these keys with the SERVER getT() only; a client component
    // that needs one must receive it as a prop.
    "nav.privacy": "Məxfilik siyasəti",
    "privacy.title": "Məxfilik Siyasəti",
    "privacy.eyebrow": "Hüquqi sənəd",
    "privacy.lead":
      "Bu siyasət OlympIQ veb saytına və OlympIQ mobil tətbiqinə (iOS və Android) aiddir.\n\n" +
      "OlympIQ 1–11-ci sinif şagirdləri üçün təhsil məhsuludur. Uşaqların məlumatları ilə işlədiyimiz üçün qısa və dürüst olmağa çalışırıq.",
    "privacy.effective": "Qüvvəyə minmə tarixi",
    "privacy.updated": "Son yenilənmə",
    "privacy.tbd": "dəqiqləşdirilir",
    "privacy.toc": "Bölmələr",
    "privacy.draft.title": "Bu sənəd hazırlıq mərhələsindədir",
    "privacy.draft.body":
      "Mətn məhsulun real işinə əsasən yazılıb, lakin hələ hüquqşünas yoxlamasından keçməyib və qüvvəyə minmə tarixi təyin edilməyib. Bəzi məlumatlar — əlaqə ünvanları, saxlanma müddətləri, serverlərin yerləşdiyi region və məlumatların rəsmi operatorunun hüquqi statusu — hələ dəqiqləşdirilir.",

    "privacy.s1.title": "Bir baxışda",
    "privacy.s1.doTitle": "Nə edirik",
    "privacy.s1.do":
      "Yalnız hesabın işləməsi üçün lazım olan məlumatı toplayırıq: valideynin əlaqə məlumatları, uşağın adı, məktəbi, sinfi və məşq nəticələri.\n" +
      "Uşağın hesabını valideyn yaradır və idarə edir. Uşaq özü qeydiyyatdan keçə bilmir.\n" +
      "Valideyn istənilən vaxt tətbiqin içindən bütün ailə hesabını silə bilər.",
    "privacy.s1.dontTitle": "Nə etmirik",
    "privacy.s1.dont":
      "Reklam yoxdur. Tətbiqdə heç bir reklam şəbəkəsi və ya reklam SDK-sı yoxdur.\n" +
      "İzləmə yoxdur. Nə mobil tətbiqdə, nə də veb saytda analitika, atribusiya və ya çökmə hesabatı toplayan üçüncü tərəf aləti quraşdırılmayıb. Reklam identifikatoru (IDFA, Android Advertising ID) heç vaxt oxunmur.\n" +
      "Məlumatları satmırıq, icarəyə vermirik, mübadilə etmirik və marketinq məqsədi ilə heç kimə ötürmürük.\n" +
      "Məkanınızı, kameranızı, kontaktlarınızı və mikrofonunuzu istəmirik.\n" +
      "Uşaq davranışına görə reklam profili qurmuruq.\n" +
      "Kart məlumatlarınızı görmürük. Mobil tətbiqdə alış prosesi yoxdur — alış yalnız veb saytda həyata keçirilir.",

    "privacy.s2.title": "Biz kimik və bizimlə necə əlaqə saxlamaq olar",
    "privacy.s2.product": "Məhsul",
    "privacy.s2.productValue":
      "OlympIQ — 1–11-ci siniflər üçün olimpiada və imtahan hazırlığı platforması",
    "privacy.s2.operator": "Layihəni həyata keçirən",
    "privacy.s2.operatorValue": "Kamil Piriyev (VÖEN: 6300091352) və tərəfdaşları",
    "privacy.s2.address": "Hüquqi ünvan",
    "privacy.s2.addressValue": "Azərbaycan Respublikası, Lerik rayonu, Peştətük kəndi",
    "privacy.s2.email": "Dəstək e-poçtu",
    "privacy.s2.phone": "Telefon",
    "privacy.s2.website": "Veb sayt",
    "privacy.s2.requests": "Məxfilik sorğuları üçün ünvan",
    "privacy.s2.note":
      "Məlumatlarınızla bağlı hər hansı sual, şikayət və ya silinmə tələbi üçün yuxarıdakı e-poçt ünvanına yazın.",

    "privacy.s3.title": "Ailə hesabı modeli",
    "privacy.s3.intro":
      "OlympIQ-də hesab modeli adi tətbiqlərdən fərqlidir və bu, məhz uşaq təhlükəsizliyi üçün belə qurulub.",
    "privacy.s3.points":
      "Yalnız valideyn qeydiyyatdan keçir — e-poçt və parol ilə.\n" +
      "Uşaq heç vaxt özü qeydiyyatdan keçə bilmir. Nə vebdə, nə də mobil tətbiqdə uşaq üçün qeydiyyat yolu yoxdur. Bu, dizayn qərarıdır və serverdə tətbiq olunur.\n" +
      "Uşağın profilini valideyn yaradır və uşaq haqqındakı bütün məlumatı (ad, soyad, şəhər, rayon, məktəb, sinif) valideyn özü daxil edir.\n" +
      "Uşağın e-poçt ünvanı yoxdur. Sistem daxilində uşağın giriş qeydi üçün poçt qəbul etməyən texniki bir ünvan istifadə olunur; uşaq onu görmür və ondan istifadə etmir.\n" +
      "Uşaq 8 rəqəmli nömrə ilə daxil olur. Bu nömrəni server verir, parolu isə valideyn təyin edir.\n" +
      "Uşaq heç nə ala bilmir. Bu, serverdə tətbiq olunur, sadəcə interfeysdə gizlədilmir.\n" +
      "Uşaq heç nə silə bilmir. Hesabın sahibi valideyndir; silmə səlahiyyəti də ondadır.",
    "privacy.s3.result":
      "Nəticə: uşaq haqqındakı məlumatın hansı həcmdə mövcud olacağına valideyn qərar verir və istənilən vaxt onu tamamilə silə bilər.",

    "privacy.s4.title": "Hansı məlumatları toplayırıq",
    "privacy.s4.parentTitle": "Valideyn hesabı",
    "privacy.s4.parentTable":
      "Məlumat | Məcburidir? | Niyə toplayırıq\n" +
      "Ad (görünən ad) | Bəli | Hesabı tanımaq və tətbiqdə sizə müraciət etmək üçün\n" +
      "E-poçt ünvanı | Bəli | Giriş açarı; parolun bərpası; hesabla bağlı bildirişlər\n" +
      "Telefon nömrəsi (beynəlxalq formatda) | Bəli | Hesabla bağlı əlaqə və hesabın bərpası üçün. SMS göndərmirik — SMS funksiyası məhsulda ümumiyyətlə mövcud deyil\n" +
      "Parol | Bəli | Giriş üçün. Parolu biz saxlamırıq: o, yalnız autentifikasiya xidmətimizdə şifrələnmiş (hash) formada saxlanılır və heç kim onu geri oxuya bilmir\n" +
      "İnterfeys dili (az / en / ru) | Xeyr | Tətbiqi sizin dilinizdə göstərmək üçün\n" +
      "Profil şəkli (avatar) | Xeyr | Yalnız görünüş üçün. Bu fayl açıq saxlanc bölməsinə yüklənir — «Avatar şəkilləri» hissəsinə baxın\n" +
      "Bildiriş tənzimləmələri | Xeyr | Hansı kanaldan bildiriş almaq istədiyinizi yadda saxlamaq üçün\n" +
      "Bəyəndiyiniz xəbərlər | Xeyr | Xəbər məqaləsinə qoyduğunuz bəyənmə qeyd olunur",
    "privacy.s4.parentNote":
      "Valideyn tətbiq daxilində adını, telefonunu, parolunu və avatarını dəyişə bilər. E-poçt ünvanını tətbiq daxilində dəyişmək mümkün deyil — bunun üçün bizimlə əlaqə saxlayın.",
    "privacy.s4.childTitle": "Uşaq (şagird) profili — məlumatı valideyn daxil edir",
    "privacy.s4.childTable":
      "Məlumat | Məcburidir? | Niyə toplayırıq\n" +
      "Ad və soyad | Bəli | Tətbiqdə uşağa müraciət etmək üçün; reytinq cədvəlində «Ad S.» formatında göstərilir\n" +
      "Şəhər və rayon | Bəli | Regional reytinq cədvəlləri üçün\n" +
      "Məktəbin adı | Bəli | Məktəb üzrə reytinq cədvəli üçün\n" +
      "Sinif | Bəli | Uşağa öz sinfinə uyğun sualların verilməsi üçün\n" +
      "8 rəqəmli giriş nömrəsi | Server verir | Uşağın giriş açarı. Bu nömrənin son 4 rəqəmi ictimai reytinq cədvəlində göstərilir\n" +
      "Parol | Bəli (valideyn təyin edir) | Giriş üçün. Parol yalnız autentifikasiya xidmətimizdə şifrələnmiş formada saxlanılır\n" +
      "Avatar | Xeyr | Hazır şəkillərdən biri, yaxud yüklənmiş foto. Foto həmişə qapalı saxlancda saxlanılır — «Avatar şəkilləri» hissəsinə baxın\n" +
      "Rəng və stiker seçimi | Xeyr | Uşağın seçdiyi görünüş\n" +
      "Məşq məlumatları | Avtomatik | Cavablandırılmış suallar, seçilmiş variantlar, düzgün və səhv cavablar, sualda keçirilən vaxt, bal, faiz, seriya, aktiv günlər, reytinq mövqeyi, nailiyyətlər\n" +
      "Artıq görülmüş olimpiada sualları | Avtomatik | Uşağa eyni sualın təkrar düşməməsi üçün\n" +
      "Bildiriş tənzimləmələri və bəyənilən xəbərlər | Xeyr | Valideyn hesabındakı ilə eyni məqsəd",
    "privacy.s4.childNoDob":
      "Doğum tarixini və ya doğum ilini toplamırıq. Uşağın yaşını soruşmuruq — sinif məlumatı kifayətdir.",
    "privacy.s4.childEditable":
      "Uşaq özü yalnız aşağıdakıları dəyişə bilər: öz adı və soyadı (bu, reytinq cədvəlindəki adını da dəyişir), parolu, avatarı və rəng seçimi. Məktəb, şəhər, rayon və sinif uşaq üçün yalnız oxunaqlıdır — onları yalnız valideyn dəyişə bilər.",
    "privacy.s4.techTitle": "Texniki və cihaz məlumatları",
    "privacy.s4.techTable":
      "Məlumat | Nə vaxt | Niyə\n" +
      "Push bildiriş nişanı (token), cihazın modeli, əməliyyat sisteminin versiyası və tətbiqin versiyası | Yalnız push bildirişləri aktivdirsə və siz icazə vermisinizsə | Bildirişi düzgün cihaza çatdırmaq üçün. Heç bir reklam və ya avadanlıq identifikatoru oxunmur. Hesabdan çıxarkən nişan serverdən silinir\n" +
      "Uşağın giriş cəhdlərinin qeydi: 8 rəqəmli nömrə, IP ünvanının şifrələnmiş izi (SHA-256), nəticə və vaxt | Hər giriş cəhdində | Parolun zorla tapılması cəhdlərinin qarşısını almaq üçün. Xam IP ünvanı saxlanılmır\n" +
      "Server jurnalları — o cümlədən IP ünvanı və brauzerin identifikasiya sətri | Hər sorğuda | Hostinq təchizatçılarımızın standart texniki jurnalları; təhlükəsizlik və nasazlıqların aradan qaldırılması üçün\n" +
      "Giriş qeydləri (autentifikasiya xidmətində) | Hər girişdə | Autentifikasiya xidmətimiz öz təhlükəsizlik jurnalını aparır",
    "privacy.s4.logRetention": "Server jurnallarının saxlanma müddəti",
    "privacy.s4.deviceTitle": "Cihazın qorunan yaddaşında saxlanan məlumatlar (mobil tətbiq)",
    "privacy.s4.deviceIntro":
      "Mobil tətbiq cihazın öz qorunan yaddaşında (iOS Keychain / Android Keystore) yalnız bunları saxlayır:",
    "privacy.s4.deviceList":
      "giriş sessiyanız;\n" +
      "barmaq izi və ya üz ilə kilidin açıq və ya bağlı olması (sadəcə «1» və ya «0»);\n" +
      "tanışlıq ekranının göstərilib-göstərilmədiyi;\n" +
      "push nişanının nüsxəsi;\n" +
      "seçdiyiniz dil və mövzu (açıq və ya tünd).",
    "privacy.s4.deviceNote":
      "Bu siyahıdakı seçimlər (kilid, tanışlıq ekranı, dil və mövzu) cihazdan kənara ümumiyyətlə çıxmır. Giriş sessiyası hər sorğuda autentifikasiya xidmətimizə göndərilir — onun funksiyası elə budur; push nişanı isə push aktiv olduqda serverimizdə saxlanılır (yuxarıdakı texniki məlumatlar cədvəlinə baxın). Bunlardan başqa heç nə göndərilmir.",
    "privacy.s4.cookiesTitle": "Kuki (cookie) — veb sayt",
    "privacy.s4.cookiesIntro": "Veb saytda yalnız işləmək üçün zəruri kukilər istifadə olunur:",
    "privacy.s4.cookiesList":
      "Giriş sessiyası kukiləri — saytda olduğunuz müddətdə daxil olmuş qalmağınız üçün.\n" +
      "«locale» kukisi — seçdiyiniz interfeys dilini yadda saxlamaq üçün (1 il).\n" +
      "Açıq və tünd mövzu seçimi brauzerin öz yaddaşında (localStorage) saxlanılır.\n" +
      "Eyni xəbərin baxış sayının təkrar hesablanmaması üçün brauzerin sessiya yaddaşında qısamüddətli nişan qoyulur; brauzerin tabı bağlananda silinir.",
    "privacy.s4.cookiesNote": "Reklam kukisi, analitika kukisi və izləmə pikseli yoxdur.",

    "privacy.s5.title": "Uşaqların məlumatları",
    "privacy.s5.callout":
      "Bu bölmə OlympIQ-in uşaq məxfiliyi siyasətidir. Uşaqlar üçün nəzərdə tutulmuş məhsul olduğumuza görə onu ayrıca yazırıq ki, valideyn hər şeyi bir yerdə görsün.",
    "privacy.s5.storedTitle": "Uşaq haqqında nə saxlanılır",
    "privacy.s5.stored":
      "Yuxarıdakı «Uşaq profili» cədvəlindəki hər şey: ad, soyad, şəhər, rayon, məktəb, sinif, 8 rəqəmli giriş nömrəsi, seçilmiş avatar və görünüş, məşq nəticələri (cavablar, ballar, faizlər, seriyalar, aktiv günlər, reytinq mövqeyi).",
    "privacy.s5.notCollected":
      "Uşaq haqqında toplamadığımız məlumatlar: doğum tarixi, e-poçt, telefon nömrəsi, ev ünvanı, məkan, sağlamlıq məlumatı, maliyyə məlumatı, kontaktlar, brauzer tarixçəsi, reklam identifikatorları və avadanlıq identifikatorları.",
    "privacy.s5.neverTitle": "Uşaq məlumatı ilə nə etmirik",
    "privacy.s5.never":
      "Uşağa reklam göstərmirik və reklam üçün profil qurmuruq.\n" +
      "Uşağın davranışını başqa tətbiq və saytlarda izləmirik.\n" +
      "Uşaq məlumatını satmırıq, icarəyə vermirik və marketinq üçün heç kimə vermirik.\n" +
      "Uşağın yazdığı heç bir mətni dərc etmirik — yeganə istisna onun öz adı və soyadıdır: şagird bunları özü dəyişə bilir və reytinq cədvəlində «Ad S.» formatında məhz bu ad görünür. Bundan başqa uşağın digər istifadəçilərə göstərə biləcəyi sərbəst mətn yoxdur.\n" +
      "Tətbiqdə çat, mesajlaşma, şərh və forum yoxdur. Uşaq başqa istifadəçi ilə ünsiyyət qura bilmir.\n" +
      "Uşağı heç nə almağa təşviq etmirik. Şagird sessiyasında qiymət, ödəniş üsulu və alış düyməsi göstərilmir.",
    "privacy.s5.lbTitle": "Reytinq cədvəllərində nə görünür",
    "privacy.s5.lbIntro":
      "Bu, valideynin bilməli olduğu ən vacib məqamlardan biridir. İki fərqli reytinq cədvəli var.",
    "privacy.s5.lb1Title": "1) Tətbiq daxilindəki reytinq — yalnız hesabı olan istifadəçilər görür",
    "privacy.s5.lb1Intro":
      "Sistemə daxil olmuş istənilən valideyn və istənilən şagird reytinqdə olan hər uşaq haqqında bunları görür:",
    "privacy.s5.lb1Table":
      "Göstərilir | Nümunə\n" +
      "Ad və soyadın ilk hərfi | Aysel M.\n" +
      "Şəhər | Bakı\n" +
      "Rayon | Nəsimi\n" +
      "Məktəbin adı | 142 nömrəli tam orta məktəb\n" +
      "Sinif | 7\n" +
      "Nəticə göstəriciləri | faiz, cavablandırılmış sual sayı, düzgün cavab sayı, cəhd sayı",
    "privacy.s5.lb1Note":
      "Uşağın tam soyadı, avatarı, 8 rəqəmli nömrəsi və valideyninin əlaqə məlumatları göstərilmir.",
    "privacy.s5.lb2Title": "2) Saytın ana səhifəsindəki ictimai ilk 10 — hesabı olmayan hər kəs görür",
    "privacy.s5.lb2Body":
      "Burada uşağın adı göstərilmir; onun əvəzinə «Şagird 4821» formatında təxəllüs göstərilir. Bu dörd rəqəm uşağın 8 rəqəmli giriş nömrəsinin son dörd rəqəmidir. Bununla yanaşı, bu ictimai cədvəldə şəhər, rayon, məktəbin adı və sinif də göstərilir.",
    "privacy.s5.lbWarn":
      "Valideyn üçün dürüst xəbərdarlıq: kiçik bir rayon məktəbində «məktəb + sinif + rayon» kombinasiyası uşağı tanımaq üçün kifayət edə bilər, ad göstərilməsə belə. Bunu gizlətmirik.",
    "privacy.s5.lbNoMedals":
      "Reytinq cədvəllərində medal, mükafat və pul yoxdur — yalnız rəqəmli yerlər.",
    "privacy.s5.avatarTitle": "Avatar şəkilləri — vacib fərq",
    "privacy.s5.avatarTable":
      "Hansı yol | Fayl harada saxlanılır | Kim görə bilər\n" +
      "Valideyn uşaq üçün foto yükləyir (Uşaq əlavə et / Uşağı redaktə et) | Qapalı saxlanc bölməsi | Yalnız ailə üzvləri, qısamüddətli imzalanmış keçid vasitəsilə\n" +
      "Şagird öz profilindən özü foto yükləyir | Qapalı saxlanc bölməsi | Yalnız ailə üzvləri, qısamüddətli imzalanmış keçid vasitəsilə\n" +
      "Valideyn öz avatarını yükləyir | Açıq saxlanc bölməsi | Faylın birbaşa linkini bilən hər kəs",
    "privacy.s5.avatarWarn":
      "Uşağın fotosu heç vaxt açıq saxlanc bölməsinə düşmür: fotonu valideyn yükləsə də, şagird özü yükləsə də, fayl qapalı saxlanca yazılır və yalnız ailə üzvlərinə verilən qısamüddətli imzalanmış keçidlə açılır. Açıq saxlanc yalnız valideynin öz avatarına aiddir — onu faylın birbaşa linkini bilən hər kəs aça bilər. Hazır avatarlar defolt seçimdir və heç bir foto yükləmək tələb olunmur — uşağınızın fotosunun yüklənməsini istəmirsinizsə, hazır avatarlardan istifadə edin.",
    "privacy.s5.avatarUnlink":
      "Avatarın silinməsi yola görə fərqli işləyir. Uşağın fotosu — istər valideyn yükləsin, istər şagird özü — dəyişdirildikdə və ya silindikdə qapalı saxlancdan tamamilə silinir. Valideynin öz avatarı isə yalnız profildən ayrılır: şəkil artıq profildə görünmür, lakin fayl açıq saxlancda qalır.",
    "privacy.s5.removeTitle": "Valideyn uşağın məlumatını necə silir",
    "privacy.s5.removeList":
      "Tam ailə hesabını silmək: valideyn profili → «Təhlükəli zona» → «Hesabı sil» → iki mərhələli təsdiq. Bu, valideyn hesabını və onun yaratdığı bütün uşaq profillərini silir. Həm veb saytda, həm də mobil tətbiqdə mövcuddur.\n" +
      "Yalnız bir uşağı silmək: hazırda yalnız veb saytda, valideyn panelindən. Mobil tətbiqdə ayrıca uşaq silmək imkanı yoxdur.\n" +
      "Şagird heç nə silə bilmir.",
    "privacy.s5.removeNote":
      "Silinmə dərhal baş verir — gözləmə müddəti, geri qaytarma və ya arxivə salma yoxdur. Nəyin silindiyi və nəyin qaldığı «Məlumatların saxlanması və silinməsi» bölməsində ətraflı yazılıb.",

    "privacy.s6.title": "Məlumatları nə üçün istifadə edirik",
    "privacy.s6.useTitle": "İstifadə edirik",
    "privacy.s6.use":
      "Hesabı yaratmaq, girişi təmin etmək və hesabın təhlükəsizliyini qorumaq.\n" +
      "Uşağın sinfinə və məktəb rübünə uyğun sualları seçmək.\n" +
      "Cavabları qiymətləndirmək, bal, faiz, seriya və irəliləyiş statistikasını hesablamaq.\n" +
      "Valideynə uşağın irəliləyişi haqqında hesabat göstərmək.\n" +
      "Reytinq cədvəllərini formalaşdırmaq.\n" +
      "Bildiriş göndərmək (yeni raund, nəticə, seriya, xəbər, hesabla bağlı məlumat).\n" +
      "Sui-istifadənin, avtomatlaşdırılmış hücumların və parol seçmə cəhdlərinin qarşısını almaq.\n" +
      "Sizə dəstək göstərmək və sorğularınıza cavab vermək.\n" +
      "Ailənin hansı fənlərə və olimpiada paketlərinə çıxışının olduğunu müəyyən etmək.\n" +
      "Qanunla tələb olunan hallarda hüquqi öhdəliklərimizi yerinə yetirmək.",
    "privacy.s6.notTitle": "İstifadə etmirik",
    "privacy.s6.not":
      "Reklam göstərmək və ya reklam profili qurmaq üçün.\n" +
      "Sizi və ya uşağınızı başqa tətbiq və saytlarda izləmək üçün.\n" +
      "Məlumatı satmaq, icarəyə vermək və ya reklam brokerlərinə vermək üçün.\n" +
      "Kredit, sığorta, işə qəbul və bu kimi qərarlar üçün.\n" +
      "Uşağa qarşı hüquqi nəticə doğuran avtomatik qərarlar qəbul etmək üçün.\n" +
      "Üçüncü tərəflərin reklam və ya profilləşdirmə sistemlərini öyrətmək üçün.",

    "privacy.s7.title": "Məlumatı kimlərlə bölüşürük",
    "privacy.s7.staffTitle": "OlympIQ daxilində kimin çıxışı var",
    "privacy.s7.staff":
      "Dürüst olmaq üçün bunu da yazırıq: OlympIQ-in səlahiyyətli administratorları və kontent menecerləri daxili idarəetmə panelində hesab və təlim məlumatlarına baxa bilər — xidmətin işləməsi, kontentin idarə olunması və dəstək sorğularına cavab vermək üçün. Çıxış rola görə məhdudlaşdırılıb: verilənlər bazasında sətir səviyyəsində təhlükəsizlik (RLS) tətbiq olunur və hər daxili rol yalnız öz işi üçün lazım olan icazələrə malikdir. Administratorların hesablar və kontent üzərində əməliyyatları audit jurnalına yazılır.",
    "privacy.s7.intro":
      "Məlumatlarınızı satmırıq. Aşağıdakı xidmət təminatçıları xidmətin işləməsi üçün lazımdır və hər biri yalnız öz funksiyası üçün lazım olanı alır:",
    "privacy.s7.table":
      "Xidmət təminatçısı | Rolu | Nə alır | Status\n" +
      "Supabase | Verilənlər bazası, autentifikasiya, fayl saxlancı | Bütün məhsul məlumatları, şifrələnmiş kanal üzərindən | Aktiv\n" +
      "Vercel | Veb saytın hostinqi | Standart server sorğu jurnalları (IP, brauzerin identifikasiya sətri) | Aktiv\n" +
      "Expo / EAS | Mobil tətbiqin yenilənməsi və push bildirişlərinin ötürülməsi | Tətbiq açılanda yeniləmə yoxlaması: tətbiqin versiyası, platforma, quraşdırmaya aid anonim identifikator və IP ünvanınız; push aktiv olduqda — push nişanı | Yeniləmə yoxlaması aktiv\n" +
      "Apple (APNs) | iOS-da push çatdırılması | Yalnız push aktiv olduqda — standart push ötürülməsi | Push aktivləşənə qədər heç nə almır\n" +
      "Google (FCM) | Android-də push çatdırılması | Yalnız push aktiv olduqda — standart push ötürülməsi | Push aktivləşənə qədər heç nə almır\n" +
      "Google Fonts | Veb saytın bəzi səhifələrində şrift | Brauzerinizin IP ünvanı və identifikasiya sətri | Aktiv (yalnız veb; mobil tətbiqdə yoxdur)\n" +
      "Google Maps | «Əlaqə» səhifəsindəki xəritə | Həmin səhifəni açdığınız anda IP ünvanı və identifikasiya sətri. Hesab məlumatı ötürülmür | Aktiv\n" +
      "Ödəniş təminatçısı | Gələcəkdə vebdə ödəniş | — | «Ödənişlər» bölməsinə baxın",
    "privacy.s7.pushOff":
      "Hazırda push bildirişləri işləmir: funksiya server tərəfdə söndürülüb, buna görə cihaz nişanı ümumiyyətlə yaradılmır və Expo, Apple və Google bu funksiya üzrə heç nə almır.",
    "privacy.s7.pushOn":
      "Push bildirişləri aktivdir: icazə verdiyiniz cihazlar üçün nişan yaradılır və bildirişlər Expo vasitəsilə Apple və Google şəbəkələri üzərindən çatdırılır.",
    "privacy.s7.otherIntro": "Bundan əlavə, məlumatı yalnız aşağıdakı hallarda paylaşa bilərik:",
    "privacy.s7.other":
      "qanunun tələb etdiyi hallarda (məhkəmə qərarı, səlahiyyətli dövlət orqanının qanuni sorğusu);\n" +
      "həyat və sağlamlıq üçün təcili təhlükənin qarşısını almaq üçün;\n" +
      "öz hüquqlarımızı müdafiə etmək və sui-istifadəni araşdırmaq üçün.",
    "privacy.s7.regionLabel": "Serverlərin yerləşdiyi region",

    "privacy.s8.title": "Ödənişlər",
    "privacy.s8.list":
      "Mobil tətbiqdə alışı tamamlamaq mümkün deyil: kart formu, kart məlumatlarının daxil edilməsi və ödəniş addımı tətbiqdə mövcud deyil.\n" +
      "Ödənişlər yalnız veb saytda, brauzerdə və Azərbaycan manatı ilə həyata keçirilir.\n" +
      "Ödəniş bankın öz səhifəsinə tam yönləndirmə ilə aparılacaq. Kart nömrəsi, CVV və digər kart məlumatları heç vaxt OlympIQ serverlərinə düşməyəcək və bizdə saxlanılmayacaq.\n" +
      "Verilənlər bazasında ödənişlə bağlı yalnız məbləğ, valyuta, status və təminatçının əməliyyat nömrəsi qeyd olunacaq.",
    "privacy.s8.statusOff":
      "Hazırkı vəziyyət: platformada ödənişlər söndürülüb və hələ heç bir ödəniş təminatçısı inteqrasiya olunmayıb. Ödənişlər söndürülü olduğu müddətdə mobil tətbiqin heç bir yerində qiymət göstərilmir.",
    "privacy.s8.statusOn":
      "Hazırkı vəziyyət: ödənişlər aktivdir və yalnız veb saytda, bankın öz ödəniş səhifəsi vasitəsilə həyata keçirilir. Mobil tətbiq valideynə və ya hesabı olmayan ziyarətçiyə abunə qiymətlərini yalnız məlumat üçün göstərə bilər; şagird sessiyasında qiymət heç vaxt göstərilmir və tətbiqin özündə alış tamamlana bilmir.",

    "privacy.s9.title": "Məlumatların saxlanması və silinməsi",
    "privacy.s9.activeTitle": "Hesab aktiv olduğu müddətdə",
    "privacy.s9.activeBody":
      "Hesab məlumatları və məşq nəticələri hesab açıq qaldığı müddətdə saxlanılır — çünki bunlar məhsulun özüdür: irəliləyiş qrafikləri, seriyalar və reytinq məhz bu məlumatlar üzərində qurulur.",
    "privacy.s9.notifRetention":
      "Oxunmuş bildirişlər avtomatik olaraq silinir — hazırda 180 gündən sonra; hər istifadəçinin bildiriş qutusu isə hazırda 500 elementlə məhdudlaşdırılır. Bu iki rəqəm platforma tənzimləməsidir və dəyişdirilə bilər.",
    "privacy.s9.otherRetention":
      "Məşq nəticələri, audit jurnalı və giriş cəhdləri üçün saxlanma müddəti",
    "privacy.s9.howTitle": "Hesabı necə silmək olar",
    "privacy.s9.howBody":
      "Mobil tətbiqdə və ya veb saytda: valideyn kimi daxil olun, yuxarıdakı avatara toxunun, «Profil» səhifəsini açın, ən aşağıda «Təhlükəli zona» hissəsinə enin və «Hesabı sil» düyməsini seçin. İki mərhələli təsdiq tələb olunur.",
    "privacy.s9.howNote":
      "Bu əməliyyat dərhal icra olunur və geri qaytarıla bilmir. Texniki nasazlıq səbəbindən proses yarımçıq qalarsa, yuxarıdakı ünvana yazın — silinməni əl ilə tamamlayacağıq.",
    "privacy.s9.erasedTitle": "Silinmə zamanı nə silinir",
    "privacy.s9.erasedIntro": "Valideyn hesabı silindikdə aşağıdakıların hamısı silinir:",
    "privacy.s9.erased":
      "valideyn profili və giriş qeydi;\n" +
      "onun yaratdığı bütün uşaq profilləri və onların giriş qeydləri;\n" +
      "8 rəqəmli nömrələr və onların qeydiyyatı;\n" +
      "bütün cəhdlər, cavablar, ballar, faizlər, seriyalar, aktiv günlər və nailiyyətlər;\n" +
      "reytinq yazıları və artıq görülmüş olimpiada suallarının qeydi;\n" +
      "abunəliklər, çıxış hüquqları, endirim və promokod qeydləri;\n" +
      "bildirişlər, bildiriş tənzimləmələri və push nişanları;\n" +
      "bəyəndiyiniz xəbərlərin qeydi.",
    "privacy.s9.survivesTitle": "Silinmədən sonra nə qalır",
    "privacy.s9.survivesIntro": "Aşağıdakılar qəsdən saxlanılır və ya texniki səbəbdən qalır:",
    "privacy.s9.survivesTable":
      "Nə qalır | Niyə | Şəxsi məlumat qalırmı?\n" +
      "Ödəniş və alış qeydləri | Mühasibat və vergi öhdəlikləri | Adsızlaşdırılır: şəxsə keçid silinir, yalnız məbləğ, valyuta, status və tarix qalır\n" +
      "Hesabla bağlı əməliyyatların audit yazıları (qeydiyyat, uşaq profilinin yaradılması, parol sıfırlamaları, abunəlik və alış hadisələri, həmçinin silinmənin özü) | Təhlükəsizlik jurnalı | Şəxsə keçid silinir. Bu yazılarda ad, IP ünvanı və brauzerin identifikasiya sətri saxlanılmır\n" +
      "Dondurulmuş reytinq arxivləri (mövsüm və ay yekunları) | Keçmiş nəticələrin tarixçəsi | Mövsüm arxivində «Ad S.» formatında ad və daxili identifikator qala bilər\n" +
      "Yüklənmiş avatar faylları və onların qeydləri | Texniki səbəb | Bəli — hesabın silinməsi verilənlər bazasındakı qeydləri silir, faylların özünü isə silmir; bu, həm açıq, həm də qapalı saxlanc bölməsinə aiddir\n" +
      "Uşağın giriş cəhdlərinin jurnalı (8 rəqəmli nömrə, IP-nin şifrələnmiş izi, vaxt) | Təhlükəsizlik | Bəli, qalır\n" +
      "Bankdan gələn ödəniş bildirişlərinin ilkin qeydləri (yalnız ödəniş təminatçısı qoşulduqdan sonra — hazırda qoşulmayıb) | Maliyyə uzlaşdırması | Bankın göndərdiyi şəkildə, təminatçının əməliyyat nömrəsi ilə saxlanılır. Bankın öz bildirişinə daxil etdiyi məlumatlar — məsələn ödəyicinin adı və ya kartın maskalanmış nömrəsi — orada ola bilər",
    "privacy.s9.backupNote":
      "Ehtiyat nüsxələr (backup) fəlakətdən bərpa üçün saxlanılır və silinmiş məlumat bir müddət orada qala bilər.",
    "privacy.s9.backupLabel": "Ehtiyat nüsxələrin saxlanma müddəti",
    "privacy.s9.copyTitle": "Məlumatlarınızın nüsxəsini almaq",
    "privacy.s9.copyBody":
      "Hazırda tətbiqdə «məlumatları yüklə» düyməsi yoxdur. Ailənizin məlumatlarının nüsxəsini istəyirsinizsə, yuxarıdakı e-poçt ünvanına yazın — sorğunuza cavab verəcəyik.",

    "privacy.s10.title": "Təhlükəsizlik",
    "privacy.s10.intro": "Aşağıdakılar həqiqətən tətbiq olunur:",
    "privacy.s10.list":
      "Bütün trafik şifrələnir (HTTPS/TLS). Veb saytda HSTS aktivdir; iOS tətbiqində şifrələnməmiş bağlantılar tamamilə qadağandır.\n" +
      "Parolları biz saxlamırıq. Həm valideyn, həm də uşaq parolları yalnız autentifikasiya xidmətimizdə şifrələnmiş (hash) formada saxlanılır. Bizim verilənlər bazamızda parol sütunu yoxdur.\n" +
      "Verilənlər bazasında sətir səviyyəsində təhlükəsizlik (RLS) tətbiq olunub: şagird yalnız öz qeydini, valideyn isə yalnız öz uşaqlarının qeydlərini görə bilir.\n" +
      "Mobil tətbiqdə heç bir imtiyazlı açar yoxdur. İmtiyazlı əməliyyatlar yalnız serverdə icra olunur.\n" +
      "Sessiya açarları cihazın öz qorunan yaddaşında saxlanılır (iOS Keychain / Android Keystore) — adi fayl və ya açıq yaddaşda deyil.\n" +
      "Uşağın girişi bloklanır: 15 dəqiqə ərzində 8 uğursuz cəhddən sonra həmin nömrə müvəqqəti kilidlənir. IP ünvanı xam şəkildə deyil, şifrələnmiş iz kimi yazılır.\n" +
      "Valideyn üçün giriş, qeydiyyat və parol bərpası səhifələri sorğu tezliyinə görə məhdudlaşdırılır.\n" +
      "Yüklənən şəkillər faylın adına deyil, faylın həqiqi məzmununa görə yoxlanılır. İcazə verilən formatlar: PNG, JPEG və WebP; GIF yalnız valideynin öz avatarı üçün qəbul edilir, uşağın fotosu üçün isə — fotonu kim yükləməsindən asılı olmayaraq — qəbul edilmir. Maksimum ölçü 2 MB. SVG tamamilə qadağandır.\n" +
      "Barmaq izi və üz ilə kilid: cihazınız bizə yalnız «təsdiqləndi» və ya «təsdiqlənmədi» cavabını qaytarır. Biometrik məlumat heç vaxt cihazdan çıxmır və bizə ötürülmür — biz yalnız kilidin açıq və ya bağlı olduğunu yadda saxlayırıq.\n" +
      "Administrator əməliyyatları jurnala yazılır.",
    "privacy.s10.caveat":
      "Bununla belə, dürüst olmaq lazımdır: internetdə heç bir sistem 100% təhlükəsiz deyil. Biz ağlabatan texniki və təşkilati tədbirləri görürük, lakin mütləq təhlükəsizliyə zəmanət verə bilmərik. Parolunuzu heç kimlə paylaşmayın.",

    "privacy.s11.title": "Sizin hüquqlarınız və onlardan necə istifadə etmək olar",
    "privacy.s11.table":
      "Nə etmək istəyirsiniz | Necə\n" +
      "Valideynin adını, telefonunu, parolunu və ya avatarını dəyişmək | Tətbiqdə: profil səhifəsi\n" +
      "Valideynin e-poçtunu dəyişmək | Tətbiqdə mümkün deyil — bizə yazın\n" +
      "Uşağın adını, soyadını, şəhərini, rayonunu, məktəbini və ya sinfini dəyişmək | Tətbiqdə: valideyn, sonra «Uşağı redaktə et»\n" +
      "Uşağın parolunu sıfırlamaq | Tətbiqdə: valideyn, sonra «Uşağı redaktə et»\n" +
      "Uşağın avatarını dəyişmək və ya silmək | Tətbiqdə: valideyn və ya şagird profili\n" +
      "Bildirişləri söndürmək | Tətbiqdəki bildiriş tənzimləmələri; həmçinin cihazın sistem parametrləri\n" +
      "Bir uşağı silmək | Veb saytda: valideyn paneli\n" +
      "Bütün ailə hesabını silmək | Tətbiqdə və veb saytda: profil, sonra «Təhlükəli zona»\n" +
      "Məlumatların nüsxəsini almaq | Bizə yazın\n" +
      "Şikayət etmək və ya sual vermək | Bizə yazın",
    "privacy.s11.note":
      "Yaşadığınız ölkənin qanunvericiliyindən asılı olaraq əlavə hüquqlarınız ola bilər.",

    "privacy.s12.title": "Cihaz icazələri",
    "privacy.s12.table":
      "İcazə | Nə vaxt istənilir | Nə üçün\n" +
      "Foto kitabxanası | Yalnız siz «avatarı dəyiş» düyməsinə basdıqda | Profil şəkli seçmək üçün. Hazır avatarlar defolt seçimdir — foto yükləmək məcburi deyil\n" +
      "Bildirişlər | Yalnız sistemə daxil olduqdan sonra və yalnız funksiya aktiv olduqda | Yeni raund, nəticə, seriya və hesabla bağlı bildirişlər üçün. Reklam üçün heç vaxt. İmtina etsəniz, bir daha soruşulmur\n" +
      "Barmaq izi / Face ID | Yalnız siz tətbiq kilidini özünüz aktivləşdirdikdə | Tətbiqi parol yazmadan açmaq üçün. Kilidi həm açmaq, həm də bağlamaq üçün təsdiq tələb olunur",
    "privacy.s12.never":
      "Sizdən heç vaxt istəmirik: kamera, məkan, kontaktlar, mikrofon, təqvim, sağlamlıq məlumatı, Bluetooth və izləmə icazəsi (App Tracking Transparency). Tətbiq kameranı heç vaxt açmır və şəkil çəkmək imkanı ümumiyyətlə yoxdur. Android üçün dürüst qeyd: istifadə etdiyimiz foto seçimi komponenti öz manifestində kamera və yaddaş icazələrini elan edir, buna görə telefonun «Tətbiq haqqında» siyahısında onları görə bilərsiniz — tətbiq bu icazələrdən istifadə etmir və sizə kamera sorğusu göstərmir.",

    "privacy.s13.title": "Bu siyasətdə dəyişikliklər",
    "privacy.s13.body":
      "Siyasəti yeniləyə bilərik. Yenilədikdə yuxarıdakı «Son yenilənmə» tarixini dəyişəcəyik. Əhəmiyyətli dəyişiklik olarsa, tətbiq daxilində və ya e-poçt vasitəsilə xəbərdarlıq edəcəyik. Dəyişiklik qüvvəyə mindikdən sonra xidmətdən istifadəni davam etdirməyiniz yenilənmiş siyasəti qəbul etdiyiniz anlamına gəlir.",
    "privacy.s13.contact": "Suallarınız üçün",

    // Consent line under the parent registration form. Rendered as
    // "{Pre} {Link}{Post}" so each language keeps its own word order.
    "privacy.consentPre": "Hesab yaratmaqla",
    "privacy.consentLink": "Məxfilik Siyasəti",
    "privacy.consentPost": " ilə tanış olduğunuzu təsdiqləyirsiniz.",
    // Shown on the parent profile page, next to the account-deletion controls.
    "privacy.profileHint":
      "Hansı məlumatları topladığımızı, kimin nəyi görə bildiyini və hesabı sildikdə nə baş verdiyini burada oxuya bilərsiniz.",

    // — Round3 E — Profile, info carousel, news panel, profile nav —
    "nav.profile": "Profil",
    "profile.title": "Profil",
    "profile.account": "Hesab",
    "profile.logout": "Çıxış",
    "profile.deleteAccount": "Hesabı sil",
    "profile.changePassword": "Şifrəni dəyiş",
    "profile.currentPassword": "Cari şifrə",
    "profile.newPassword": "Yeni şifrə",
    "profile.save": "Yadda saxla",
    "profile.saving": "Yadda saxlanılır…",
    "profile.editName": "Redaktə et",
    "profile.fullName": "Ad Soyad",
    "profile.firstNameLabel": "Ad",
    "profile.lastNameLabel": "Soyad",
    "profile.err.nameRequired": "Ad boş ola bilməz.",
    "profile.saved": "Yadda saxlanıldı ✓",
    "profile.cancel": "Ləğv et",
    "profile.passwordChanged": "Şifrə yeniləndi ✓",
    "profile.avatar": "Profil şəkli",
    "profile.uploadAvatar": "Şəkil yüklə",
    "profile.changeAvatar": "Şəkli dəyiş",
    "profile.removeAvatar": "Şəkli sil",
    "profile.avatarHint": "JPG və ya PNG, maksimum 2 MB.",
    "profile.noAvatar": "Şəkil yoxdur",
    "profile.err.passwordShort": "Yeni şifrə ən az 8 simvol olmalıdır.",
    "profile.err.passwordEqualsId": "Şifrə ID ilə eyni ola bilməz.",
    "profile.err.fileType": "Yalnız JPG və ya PNG şəkil yükləyin.",
    "profile.err.fileTooLarge": "Fayl 2 MB-dan böyük olmamalıdır.",
    "profile.err.uploadFailed": "Şəkil yüklənə bilmədi. Yenidən cəhd edin.",
    "profile.err.updateFailed": "Yenilənmə alınmadı. Yenidən cəhd edin.",

    // — Round3 E — Information carousel (parent onboarding) —
    "carousel.title": "Necə başlamalı",
    "carousel.i1.title": "Övladınızı əlavə edin",
    "carousel.i1.body":
      "İdarə panelindən «Uşaq əlavə et» seçin, övladınızın adını, şəhərini, məktəbini və sinfini daxil edin. Hər övlad üçün ayrıca hesab yaranır.",
    "carousel.i2.title": "Fənləri seçin və sınağı başladın",
    "carousel.i2.body":
      "Riyaziyyat, Elm, Məntiq və İngilis dilindən lazım olanları seçin. Hər yeni fənn 7 günlük pulsuz sınaqla başlayır — sınaq bitənə qədər ödəniş yoxdur.",
    "carousel.i3.title": "Uşaq 8 rəqəmli ID ilə daxil olur",
    "carousel.i3.body":
      "Plan seçiləndən sonra sistem unikal 8 rəqəmli giriş ID-si verir. Övladınız bu ID və sizin təyin etdiyiniz parolla daxil olur — e-poçt lazım deyil.",
    "carousel.i4.title": "İrəliləyişi izləyin",
    "carousel.i4.body":
      "Hər övladın nəticələrini, dəqiqliyini və fənn üzrə gücünü panelinizdən izləyin. Fənləri istənilən vaxt əlavə edib silə bilərsiniz.",
    "carousel.i5.title": "Olimpiada hazırlığı və dəstək",
    "carousel.i5.body":
      "Olimpiada paketini bir dəfə alın — övladınız ömürlük giriş əldə edir. Sualınız olsa, Əlaqə səhifəsindən bizə yazın.",

    // — Round3 E — News panel (latest news widget) —
    "news.latest": "Son xəbərlər",
    "news.viewAll": "Hamısına bax",
    "news.none": "Hələ xəbər yoxdur.",
    "news.published": "Dərc olundu",
    "news.readMore": "Ətraflı",
    "news.unavailable": "Xəbərlər hazırda əlçatan deyil.",

    // — Round4 — Landing stats (labels only; numbers are illustrative) —
    "stats.title": "OlympIQ Rəqəmlərlə",
    "stats.tests": "Test bazası",
    "stats.olympiads": "Olimpiada paketi",
    "stats.students": "Aktiv məktəbli",
    "stats.successRate": "Uğur göstəricisi",

    // — Round4 — About Us (hero + vision + 4 values) —
    "about.hero.title": "Olimpiadaya aparan aydın yol",
    "about.hero.body":
      "OlympIQ 1–11-ci sinif şagirdlərini olimpiadalara hazırlayan süni intellekt əsaslı təhsil platformasıdır. Platforma hər şagirdin nəticələrini analiz edərək onun bilik səviyyəsinə uyğun fərdi hesabatlar və inkişaf tövsiyələri hazırlayır. Gündəlik məşqlər, olimpiada formatında testlər və detallı analitika sayəsində həm şagird, həm də valideyn inkişafı aydın şəkildə izləyə bilir.",
    "about.vision.title": "Viziyonumuz",
    "about.vision.body":
      "Bizim vizyonumuz olimpiada hazırlığını hər bir Azərbaycan ailəsi üçün əlçatan etməkdir. Süni intellektlə fərdiləşdirilmiş təhsil, ətraflı hesabatlar və müasir öyrənmə metodlarını bir fincan qəhvə qiymətinə təqdim edərək minlərlə şagirdin gələcəyinə töhfə verməyi hədəfləyirik.",
    "about.values.title": "Bizi fərqləndirən dəyərlər",
    "about.value1.title": "Üçdilli öyrənmə",
    "about.value1.body":
      "Bütün interfeys Azərbaycan, ingilis və rus dilində işləyir — hər şagird özünə rahat dildə öyrənə bilər.",
    "about.value2.title": "Valideyn idarəli təhlükəsizlik",
    "about.value2.body":
      "Hesabları valideyn yaradır və idarə edir. Uşaqlar e-poçt və ödəniş məlumatı daxil etmir. Hər şey valideynin nəzarətindədir.",
    "about.value3.title": "Olimpiada hazırlığı",
    "about.value3.body":
      "Limitsiz girişli xüsusi paketlər və serverdə seçilən 25 suallıq cəhdlər real olimpiada təcrübəsi yaradır.",
    "about.value4.title": "Ölçüləbilən irəliləyiş",
    "about.value4.body":
      "Nəticələr, dəqiqlik və fənn üzrə potensial şəffaf göstərilir — hər addımda harada olduğunuzu görürsünüz.",

    // — Round4 — News browse (sort + pager + views) —
    "news.sort.latest": "Ən yeni",
    "news.sort.oldest": "Ən köhnə",
    "news.sort.mostViewed": "Ən çox baxılan",
    "news.sort.mostLiked": "Ən çox bəyənilən",
    "news.like": "Bəyən",
    "news.liked": "Bəyənildi",
    "news.likes": "bəyənmə",
    "news.page.prev": "Əvvəlki",
    "news.page.next": "Növbəti",
    "news.page.indicator": "Səhifə {current} / {total}",
    "news.views": "baxış",
    "news.empty2": "Bu bölmədə hələ xəbər yoxdur.",

    // — Round4 — Language dropdown —
    "lang.select": "Dil seçin",

    // — Round4 PARENT — nav / drawer / analytics / subscription / help —
    "nav.analytics": "Analitika",
    "nav.subscription": "Abunəlik",
    "nav.help": "Yardım",
    "drawer.title": "Hesab",
    "drawer.account": "Hesab",
    "drawer.language": "Dil",
    "drawer.theme": "Görünüş",
    "drawer.close": "Bağla",
    "drawer.profileBtn": "Profilim",
    "drawer.logout": "Çıxış",
    "analytics.title": "Analitika",
    "analytics.subtitle": "Övladlarınızın irəliləyişinə ümumi baxış.",
    "analytics.totalChildren": "Uşaqlar",
    "analytics.activeSubs": "Aktiv abunəliklər",
    "analytics.attempts": "Cəhdlər",
    "analytics.avgScore": "Orta nəticə",
    "analytics.none": "Hələ məlumat yoxdur.",
    "subscription.title": "Abunəlik",
    "subscription.subtitle": "Övladlarınızın fənlərini və abunəliklərini idarə edin.",
    "help.faqTitle": "Tez-tez verilən suallar",
    "help.contactTitle": "Əlaqə",

    // — Round4 Phase4 — subscription cards + cancel modal + arena controls —
    "subscription.child": "Övlad",
    "subscription.status.trialing": "Sınaq müddəti",
    "subscription.status.active": "Aktiv",
    "subscription.status.past_due": "Ödəniş gecikib",
    "subscription.status.canceled": "Ləğv edilib",
    "subscription.status.expired": "Müddəti bitib",
    "subscription.status.none": "Abunəlik yoxdur",
    "subscription.subjects": "Fənlər",
    "subscription.interval": "Dövr",
    "subscription.manageSubjects": "Fənləri idarə et",
    "subscription.startPlan": "Abunəliyə başla",
    "subscription.cancelBtn": "Abunəliyi ləğv et",
    "cancel.title": "Abunəliyi ləğv etmək istəyirsiniz?",
    "cancel.intro": "Getməzdən əvvəl bir neçə saniyənizi ayırın. Ləğv etmə səbəbinizi bizə bildirin.",
    "cancel.reasonLabel": "Ləğv etmə səbəbi",
    "cancel.reason.price": "Qiymət mənə uyğun deyil",
    "cancel.reason.notUsing": "Kifayət qədər istifadə etmirik",
    "cancel.reason.features": "İstədiyim imkanlar yoxdur",
    "cancel.reason.temporary": "Müvəqqəti fasilə verirəm",
    "cancel.reason.other": "Digər səbəb",
    "cancel.benefitsTitle": "Ləğv etsəniz, itirəcəksiniz:",
    "cancel.benefit1": "Bu fənn üzrə məşq və gündəlik tapşırıqlara girişi",
    "cancel.benefit2": "Övladınızın irəliləyiş və nəticələrinin izlənməsini",
    "cancel.benefit3": "Cari sınaq müddətini və qazandığınız endirimi",
    "cancel.confirm": "Bəli, ləğv et",
    "cancel.keep": "Abunəliyi saxla",
    "cancel.done": "Abunəlik ləğv edildi.",
    "cancel.err": "Abunəlik ləğv edilə bilmədi. Yenidən cəhd edin.",
    // ---- TEST ENGINE (T1/T2) — timed topic tests (child arena) ----
    "arena.nav.test": "Sınaq",
    "test.home.eyebrow": "Sınaq mərkəzi",
    "test.home.title": "Sınaq testləri",
    "test.home.sub": "Fənni seç, mövzuları müəyyən et və 25 dəqiqəlik sınaq testinə başla.",
    "test.home.subjects": "Fənlər",
    "test.home.continueTitle": "Davam edən sınağın var",
    "test.home.continueSub": "Vaxt hələ də işləyir — qaldığın yerdən davam et.",
    "test.home.continueCta": "Davam et",
    "test.home.recent": "Son sınaqlar",
    "test.home.noAttempts": "Hələ sınaq işləməmisən — ilk sınağına indi başla!",
    "test.home.noticeClosed": "Bu sınaq artıq bağlanıb — ləğv edilib və ya vaxtı bitib.",
    "test.status.in_progress": "Davam edir",
    "test.status.canceled": "Ləğv edilib",
    "test.status.expired": "Vaxtı bitib",
    "test.err.noAccess": "Bu fənnə girişin yoxdur — valideynindən abunəliyi soruş.",
    "test.err.noQuestions": "Bu seçim üzrə hələ sual yoxdur — tezliklə əlavə olunacaq.",
    "test.err.generic": "Nəsə alınmadı. Bir az sonra yenidən cəhd et.",
    "test.setup.eyebrow": "Sınaq hazırlığı",
    "test.setup.topicsTitle": "Mövzular",
    "test.setup.pickHint": "Sınaq üçün mövzu və alt mövzu seç.",
    "test.setup.topic": "Mövzu",
    "test.setup.subtopic": "Alt mövzu",
    "test.setup.topicPh": "Mövzu seç…",
    "test.setup.subtopicPh": "Alt mövzu seç…",
    "test.setup.noSubtopics": "Bu mövzunun alt mövzusu yoxdur — birbaşa mövzu üzrə başlaya bilərsən.",
    "test.setup.selectWarn": "Sınağa başlamazdan əvvəl mövzu və alt mövzu seç.",
    "test.setup.noTopics": "Bu fənn üzrə mövzu siyahısı hələ yoxdur — sınağa başlamaq üçün əvvəlcə mövzular əlavə olunmalıdır.",
    "test.setup.rulesTitle": "Qaydalar",
    "test.setup.qCount": "25 sual",
    "test.setup.duration": "25 dəqiqə",
    "test.setup.rule1": "Vaxt sınağa başlayan kimi işə düşür və dayandırıla bilmir.",
    "test.setup.rule2": "Səhifədən çıxsan da vaxt işləməyə davam edir — geri qayıdıb davam edə bilərsən.",
    "test.setup.rule3": "Cavabların avtomatik yadda saxlanılır.",
    "test.setup.rule4": "Sınağı ləğv etsən, heç nə hesablanmır.",
    "test.setup.scoringTitle": "Qiymətləndirmə",
    "test.setup.scoring": "Hər düzgün cavab 1 bal. Səhv cavab bal azaltmır.",
    "test.setup.consent": "Qaydaları oxudum və başa düşdüm",
    "test.setup.start": "Sınağa başla",
    "test.setup.starting": "Başladılır…",
    "test.run.title": "Sınaq testi",
    "test.run.olympiad": "Olimpiada",
    "test.run.leaveTitle": "Testdən çıxmaq istədiyinə əminsən?",
    "test.run.leaveMsg": "Hazırkı irəliləyişin təsirlənə bilər.",
    "test.run.leaveStay": "Testə davam et",
    "test.run.leaveConfirm": "Testdən çıx",
    "test.run.noLimit": "Vaxt limiti yoxdur",
    "test.run.daily": "Günün raundu",
    "test.run.ratedBadge": "Reytinqə təsir edir",
    "test.run.practiceBadge": "Məşq",
    "test.home.sub2": "Hər gün hər fənn üzrə bir reytinqli raund — 25 sual, vaxt limiti yoxdur. İstəsən, mövzular üzrə sərbəst məşq də edə bilərsən.",
    "test.rounds.today": "Bugünün raundları",
    "test.rounds.yesterday": "Dünənin raundları",
    "test.rounds.recent": "Son raundlar",
    "test.rounds.start": "Başla",
    "test.rounds.attempted": "Bu gün iştirak etmisən",
    "test.rounds.timedBadge": "25 sual · vaxt limiti yoxdur",
    "test.rounds.rated": "Reytinqə təsir edir",
    "test.rounds.replay": "Təkrar həll et",
    "test.rounds.practiceNote": "Bu testlər yalnız təkrar üçündür və nəticələr reytinq cədvəlinə təsir etmir.",
    "test.rounds.noYesterday": "Dünən raund keçirilməyib.",
    "test.rounds.noRoundYet": "Bu raund hələ hazır deyil — bir azdan yenidən yoxla.",
    "test.rounds.doneAlert": "Bugünkü raundu artıq tamamladınız.",
    "test.rounds.alreadyNote": "Bu fənn üzrə bugünkü raundda artıq iştirak etmisən — sabah yenidən gəl!",
    "test.rounds.noGrade": "Profilində sinif göstərilməyib — valideynindən sinfini əlavə etməsini xahiş et.",
    "test.rounds.practiceCta": "Məşq et",
    "test.rounds.practiceMeta": "vaxt limiti yoxdur, xal vermir",
    "test.rounds.ratedChip": "Reytinqli",
    "test.rounds.usedToday": "Bu gün üçün sınaq cəhdinizi artıq istifadə etmisiniz. Yeni sınaq sabah aktiv olacaq.",
    "test.rounds.rulesTitle": "Sınaq qaydaları",
    "test.rounds.rulesRated": "Bu, gündəlik reytinqli sınaqdır — nəticə xalına, faizinə və seriyana təsir edir.",
    "test.rounds.rulesOnce": "Hər fənn üzrə gündə yalnız bir sınaq keçmək olar.",
    "test.rounds.rulesNoLimit": "Vaxt limiti yoxdur — tələsmə, hər sualı diqqətlə cavabla.",
    "test.rounds.rulesSaved": "Cavabların avtomatik yadda saxlanılır.",
    "test.img.alt": "Sualın şəkli",
    "test.img.hint": "Böyütmək üçün klik et",
    "test.img.close": "Bağla",
    "test.setup.noLimit": "Vaxt limiti yoxdur",
    "test.setup.noPoints": "Xal vermir",
    "test.setup.rulePractice1": "Bu, məşq testidir — nəticə reytinqə təsir etmir.",
    "test.setup.rulePractice2": "Vaxt yoxdur — istədiyin qədər düşün, fasilə verib sonra davam edə bilərsən.",
    "test.setup.practiceScoring": "Hər düzgün cavab 1 bal. Nəticəni dərhal görürsən, amma reytinq xalı verilmir.",
    "lb.colDistrict": "Rayon",
    "lb.scope.district": "Rayon",
    "lb.colNo": "Sıra",
    "plb.board.empty": "Bu filtr üzrə hələ nəticə yoxdur.",
    "plb.pos.title": "Övladlarınızın mövqeyi",
    "plb.pos.notInFilter": "Bu filtr üzrə reytinqdə iştirak etmir",
    "plb.pos.noChildren": "Hələ övlad hesabı yaratmamısınız. Övlad əlavə edin və onun reytinqdəki yerini buradan izləyin.",
    "pub.lb.title": "Ümumi Reytinq Cədvəli",
    "pub.lb.sub": "Platformada ən yüksək nəticə göstərən şagirdlər",
    "pub.lb.empty": "Hazırda reytinq məlumatı mövcud deyil.",
    "lb.myRank.notInFilter": "Bu filtr üzrə reytinqdə deyilsən.",
    "test.run.timeLeft": "Qalan vaxt",
    "test.run.resumed": "Qaldığın yerdən davam edirsən.",
    "test.run.palette": "Suallar",
    "test.run.answered": "Cavablanıb",
    "test.run.flagged": "Saxlanılan",
    "test.run.unanswered": "Cavabsız",
    "test.run.current": "Cari sual",
    "test.run.subject": "Fənn",
    "test.run.topic": "Mövzu",
    "test.run.flag": "Saxla",
    "test.run.unflag": "Saxlamadan çıxar",
    "test.run.next": "Növbəti",
    "test.run.submit": "Sınağı bitir",
    "test.run.submitting": "Göndərilir…",
    "test.run.cancel": "Ləğv et",
    "test.run.canceling": "Ləğv edilir…",
    "test.run.saving": "Yadda saxlanılır…",
    "test.run.saved": "Yadda saxlanıldı",
    "test.run.saveError": "Cavabları yadda saxlamaq alınmadı — internet bağlantını yoxla.",
    "test.run.submitTitle": "Sınağı bitirirsən?",
    "test.run.submitMsg": "Cavabsız sual: {n}. Bitirdikdən sonra cavabları dəyişmək olmur.",
    "test.run.submitConfirm": "Bəli, bitir",
    "test.run.back": "Geri qayıt",
    "test.run.cancelTitle": "Sınağı ləğv edirsən?",
    "test.run.cancelMsg": "Ləğv etsən, heç nə hesablanmayacaq — nə bal, nə nəticə.",
    "test.run.cancelConfirm": "Bəli, ləğv et",
    "test.run.keepGoing": "Davam et",
    "test.run.timeUp": "Vaxt bitdi — sınağın göndərilir…",
    "test.result.eyebrow": "Nəticə",
    "test.result.title": "Sınaq nəticən",
    "test.result.olympiadTitle": "Olimpiada nəticən",
    "test.result.backToOlympiads": "Olimpiadalara qayıt",
    "test.result.topics": "Mövzular üzrə nəticə",
    "test.result.noTopics": "Mövzu üzrə bölgü yoxdur.",
    "test.result.timeSpent": "Sərf olunan vaxt",
    "test.result.minutes": "dəq",
    "test.result.review": "Cavablara bax",
    "test.result.newTest": "Yeni sınaq",
    "test.review.title": "Cavabların təhlili",
    "test.review.correct": "Düzgün",
    "test.review.wrong": "Səhv",
    "test.review.skipped": "Buraxılıb",
    "test.review.your": "Sənin seçimin",
    "test.review.correctAnswer": "Düzgün cavab",
    "test.review.explanation": "İzah",
    "test.review.explAzOnly": "Yalnız Azərbaycan dilində",
    "test.review.explAzNote":
      "Bu izah hələ tərcümə olunmayıb, ona görə orijinal Azərbaycan mətni göstərilir.",
    "test.review.backToResult": "Nəticəyə qayıt",
    "test.review.filterAll": "Hamısı",
    "test.review.filterCorrect": "Düzgün",
    "test.review.filterWrong": "Səhv",
    "test.review.filterSkipped": "Buraxılmış",
    // Report a problem (migration 115) — shown on the runner and the review
    // screen; the same dictionary feeds the mobile sheet.
    "test.report.action": "Problem bildir",
    "test.report.title": "Sualla bağlı problem bildir",
    "test.report.intro":
      "Bu sualda nə səhvdir? Qısaca yaz — məsələn, düzgün cavab səhvdir, yazı xətası var və ya şəkil görünmür.",
    "test.report.label": "Problemi təsvir et",
    "test.report.placeholder": "Məsələn: düzgün cavab B olmalıdır.",
    "test.report.remaining": "{n} simvol qalıb",
    "test.report.cancel": "Ləğv et",
    "test.report.submit": "Göndər",
    "test.report.sending": "Göndərilir…",
    "test.report.emptyErr": "Zəhmət olmasa, problemi qısaca yaz.",
    "test.report.successTitle": "Bildiriş göndərildi",
    "test.report.successBody": "Təşəkkür edirik! Sualı yoxlayacağıq.",
    "test.report.done": "Bağla",
    "test.report.err.generic": "Bildiriş göndərilmədi. Bir azdan yenidən cəhd et.",
    "test.report.err.duplicate": "Bu sualı artıq bildirmisən — baxılır.",
    "test.report.err.tooMany":
      "Çox sayda bildiriş göndərdin. Bir az sonra yenidən cəhd et.",
    // Child profile — read-only school details
    "prof2.schoolInfo": "Məktəb məlumatları",
    "prof2.schoolInfoHint": "Bu məlumatları yalnız valideynin dəyişə bilər.",
    "prof2.grade": "Sinif",
    "prof2.city": "Şəhər",
    "prof2.school": "Məktəb",
    // Parent edits a child's info
    "parent.dash.editInfo": "Məlumatı redaktə et",
    "childedit.title": "Uşağın məlumatını redaktə et",
    "childedit.intro": "Uşağın adını, sinfini, şəhərini və məktəbini yeniləyə bilərsən. Giriş ID-si dəyişmir.",
    "childedit.save": "Yadda saxla",
    "childedit.saving": "Saxlanılır…",
    "childedit.saved": "Uşaq məlumatları uğurla yeniləndi.",
    "childedit.back": "Geri",
    "childedit.internalId": "Daxili ID",
    "childedit.idNote": "Giriş ID-si və daxili identifikatorlar dəyişdirilə bilməz.",
    "childedit.err.generic": "Dəyişiklikləri yadda saxlamaq alınmadı. Yenidən cəhd et.",
    "childedit.err.notYourChild": "Bu uşaq sizin hesabınıza aid deyil.",
    // ---- Payment result (payres.*) — the bare page the bank returns the
    // cardholder to. Chrome-free by design: no site nav, no prices, no CTA.
    // It reports the RESULT OF A PAYMENT only; access is never granted here.
    "payres.title": "Ödəniş nəticəsi",
    "payres.ok": "Ödəniş təsdiqləndi.",
    "payres.pending": "Ödənişin nəticəsi hələ təsdiqlənməyib. Bir qədər sonra yenidən yoxlayın.",
    "payres.failed": "Ödəniş baş tutmadı.",
    "payres.close": "Bu pəncərəni bağlaya bilərsiniz.",
    "payres.redirect": "Ödəniş səhifəsinə yönləndirilirsiniz.",
    "payres.continue": "Davam et",
    // ---- Parent checkout (checkout.*) — the WEB purchase flow -------------
    // WEB ONLY. These strings name a price, a payment step and a bank page, all
    // of which are correct in a browser and forbidden in a store binary
    // (docs/STORE_PAYMENTS_COMPLIANCE.md section 5). The mobile catalog is
    // GENERATED from this file, so these keys will exist there — no mobile
    // screen may reference one. The amount itself is never in the catalog: it
    // is rendered from the server's own number, so no locale can drift from it.
    "checkout.title": "Ödənişi tamamlayın",
    "checkout.intro":
      "Ödənişi bankın təhlükəsiz səhifəsində tamamlayacaqsınız. Kart məlumatları yalnız orada daxil edilir və bizim serverlərimizə düşmür.",
    "checkout.amount": "Ödəniləcək məbləğ",
    "checkout.payNow": "Ödənişə keç",
    "checkout.starting": "Hazırlanır…",
    "checkout.redirectNote":
      "İndi bankın ödəniş səhifəsinə keçəcəksiniz. Ödəniş bitdikdən sonra bura qaytarılacaqsınız.",
    "checkout.continue": "Bank səhifəsinə keç",
    "checkout.err.notFound": "Bu ödəniş tapılmadı. Səhifəni yeniləyib yenidən cəhd edin.",
    "checkout.err.alreadyPaid": "Bu ödəniş artıq tamamlanıb.",
    "checkout.err.unavailable":
      "Ödəniş hazırda mümkün deyil. Bir qədər sonra yenidən cəhd edin.",
    "checkout.resume": "Ödənişi tamamla",
    "checkout.err.priceChanged":
      "Qiymət dəyişib. Seçiminizi yenidən nəzərdən keçirin — yeni məbləği göstərəcəyik.",
    "checkout.err.expired":
      "Bu ödənişin vaxtı bitib. Fənləri yenidən seçib davam edin.",
    "checkout.err.retryFromEditor":
      "Ödəniş alınmadı. Dəyişikliyi yenidən yadda saxlayın — planınız bu arada dəyişmiş ola bilər, ona görə məbləği yenidən hesablayacağıq.",
    "checkout.err.planChanged":
      "Plan başqa bir yerdə dəyişdirilib. Səhifəni yeniləyin və yenidən cəhd edin.",
    "checkout.err.tooMany": "Çox sayda cəhd oldu. Bir neçə dəqiqədən sonra yenidən yoxlayın.",
    // The result screen says what actually happened. Since migration 125 a
    // confirmed payment IS what creates the plan, so "ok" may say so — and it
    // is only ever shown when the redemption actually applied. A payment we
    // took but could not turn into a plan lands on "pending", which is what it
    // is from the payer's side: taken, not finished, and in front of a human.
    "checkout.res.ok.title": "Ödəniş təsdiqləndi",
    // Migration 127: the rail carries a PACKAGE now as well as a plan, so the
    // sentence names neither. "the plan is now active" would have been false on
    // every olympiad purchase.
    "checkout.res.ok.body":
      "Ödənişiniz təsdiqləndi və aldığınız giriş aktivləşdirildi. Valideyn panelində baxa bilərsiniz.",
    "checkout.res.pending.title": "Ödəniş hələ təsdiqlənməyib",
    "checkout.res.pending.body":
      "Bank hələ yekun cavab verməyib. Bu adətən bir neçə dəqiqə çəkir.",
    "checkout.res.pending.hint":
      "Zəhmət olmasa təkrar ödəniş etməyin — nəticə hazır olan kimi hesabınızda görünəcək. Bir müddət sonra da dəyişməzsə, bizimlə əlaqə saxlayın.",
    "checkout.res.failed.title": "Ödəniş baş tutmadı",
    "checkout.res.failed.body":
      "Məbləğ silinmədi. Kartınızı yoxlayıb yenidən cəhd edə bilərsiniz.",
    "checkout.res.back": "Valideyn panelinə qayıt",
  },
  en: {
    // ---- Notifications (notif.*) — in-app notification center ----
    "notif.bell": "Notifications",
    "notif.title": "Notifications",
    "notif.markAllRead": "Mark all as read",
    "notif.seeAll": "See all",
    "notif.empty": "No notifications yet",
    "notif.emptyHint": "New notifications will show up here.",
    "notif.delete": "Delete",
    "notif.markRead": "Mark as read",
    "notif.open": "Open",
    "notif.newLabel": "New notification",
    "notif.dismiss": "Dismiss",
    "notif.detailsTitle": "Notification",
    "notif.close": "Close",
    "notif.noLink": "This notification has no further link.",
    "notif.detailsData": "Details",
    "notif.timeNow": "now",
    "notif.timeMin": "min",
    "notif.timeHour": "h",
    "notif.timeDay": "d",
    "notif.filterAll": "All",
    "notif.cat.olympiad": "Olympiads",
    "notif.cat.progress": "Results",
    "notif.cat.billing": "Billing",
    "notif.cat.announcement": "Announcements",
    "notif.cat.news": "News",
    "notif.prefs.title": "Notification settings",
    "notif.prefs.desc": "Choose how you want to be notified. You can also manage your children's preferences here.",
    "notif.prefs.yourChannels": "Your notifications",
    "notif.prefs.children": "Children",
    "notif.prefs.inApp": "In-app",
    "notif.prefs.email": "Email",
    "notif.prefs.push": "Push",
    "notif.prefs.channelNote": "delivered when enabled",
    "notif.prefs.saved": "Saved",
    "notif.prefs.saving": "Saving…",
    "notif.prefs.error": "Couldn't save",
    "notif.prefs.noChildren": "No children added yet.",
    // ---- ROUND 11 (web) merged keys ----
    "pricing.perSubjectNote": "The price is calculated per subject.",
    "subjedit.activeChip": "Active",
    "subjedit.endingChip": "Ends at period end",
    "subjedit.save": "Save changes",
    "subjedit.saving": "Saving…",
    "subjedit.saved": "Changes saved.",
    "subjedit.selectedCount": "Selected subjects",
    "subjedit.pendingAdd": "Added",
    "subjedit.pendingRemove": "Removed",
    "subjedit.pendingReinstate": "Reinstated",
    "subjedit.reinstateLine": "{subject} — cancellation undone, renews on {date} as before.",
    "subjedit.reinstateNote":
      "Undoing a cancellation is free: the period you have already paid for stays exactly as it was, the subject renews on its own date, and nothing is charged now.",
    "subjedit.noChanges": "No changes yet",
    // ---- Structured change summary; proration retired (see the az block). ----
    "subjedit.dueNow": "Pay now",
    "subjedit.dueNowNote":
      "For every subject you add you pay the full price of the cycle you picked, and that cycle starts today. Nothing is split by days.",
    "subjedit.cycleNote":
      "Each subject is billed on its own: its cycle starts the day you add it and renews only at the end of that cycle. Adding or dropping one subject never moves the other subjects' dates.",
    "subjedit.perSubjectLabel": "Billing per subject",
    "subjedit.subjectPlanLine": "{subject} · {cycle} · {price}",
    "subjedit.renewsOn": "Renews on {date}",
    "subjedit.switchesOn": "Current cycle runs to {date}, then: {cycle}",
    "subjedit.startsToday": "Starts today — the full cycle is paid now",
    "subjedit.noteLabel": "Note",
    "subjedit.noteText":
      "Removed subjects stay active until the end of the period they are paid for — {date} at the latest. No refund is issued for removed subjects.",
    "subjedit.noChargeNow":
      "Nothing is charged now — the first payment is on {date}.",
    "subjedit.noteLine": "{subject} stays active until {date}.",
    "subjedit.noteNoRefund":
      "No refund is issued for removed subjects. The subjects you keep continue on their own cycles.",
    "subjedit.pendingChip": "Then: {cycle}",
    "pay.confirmNoCharge": "Confirm",
    "billing.giveawayNote": "During the free giveaway period access to all subjects is free — no subscription payment is required.",
    "billing.freeChip": "Free",
    "pay.cancel": "Cancel",
    "billing.selectChild": "Select a child",
    "addchild.giveawayGranted": "The free promo period is active — everything is unlocked for your child right away!",
    "addchild.freeAccessGranted": "Your free-access period is active — everything is unlocked for your child right away!",
    "freeact.note": "This child doesn't have a login ID yet. While the free period is running, you can activate it at no cost.",
    "freeact.cta": "Activate for free",
    "freeact.activating": "Activating…",
    "freeact.done": "Done! The login ID has been created.",
    "parent.auth.phone": "Phone number",
    "parent.auth.phonePh": "50 123 45 67",
    "parent.auth.phoneCountry": "Country code",
    "parent.auth.phoneSearch": "Search country…",
    "parent.err.phone": "Enter a valid phone number with your country code.",
    "profile.phoneLabel": "Phone",
    "profile.phoneEdit": "Change",
    "profile.phoneSaved": "Phone number updated",
    "profile.phoneHint": "We use this number to reach you about your account.",
    "profile.addPhone": "Add number",
    "gvw.title": "Free access is on! 🎁",
    "gvw.sub": "Try everything now — paid access starts later.",
    "gvw.remaining": "Time left",
    "gvw.days": "days",
    "gvw.hours": "hrs",
    "gvw.minutes": "min",
    "gvw.seconds": "sec",
    "gvw.ended": "The giveaway has ended — the free-access period is over.",
    "gvw.chip": "Free giveaway",
    "access.giveaway": "Free giveaway",
    "access.freeAccess": "Free access",
    "stk.sectionTitle": "Character stickers",
    "stk.sectionDesc": "Pick a favorite theme and playful stickers will decorate your pages.",
    "pal.title": "Colour theme",
    "pal.hint": "Choose how your panel looks — 26 ready-made colour themes.",
    "pal.darkNote": "Picking a theme turns Dark Mode off. If you switch Dark Mode back on your theme is kept — it returns as soon as you turn Dark Mode off again.",
    "pal.default": "Default",
    "pal.group.bright": "Bright",
    "pal.group.calm": "Calm",
    "pal.group.nature": "Nature",
    "pal.group.pastel": "Pastel",
    "pal.group.bold": "Bold",
    "pal.group.neutral": "Neutral",
    "pal.sky": "Sky",
    "pal.ocean": "Ocean Blue",
    "pal.cyan": "Cyan",
    "pal.aqua": "Aqua",
    "pal.teal": "Teal",
    "pal.arctic": "Arctic",
    "pal.navy": "Navy",
    "pal.indigo": "Royal Indigo",
    "pal.violet": "Violet Dream",
    "pal.lavender": "Lavender",
    "pal.rainbow": "Rainbow",
    "pal.aurora": "Aurora",
    "pal.bubblegum": "Bubblegum",
    "pal.sakura": "Sakura",
    "pal.rose": "Rose",
    "pal.berry": "Berry",
    "pal.coral": "Coral",
    "pal.peach": "Peach",
    "pal.sunset": "Sunset Orange",
    "pal.amber": "Amber",
    "pal.sand": "Sand",
    "pal.lime": "Lime",
    "pal.mint": "Mint",
    "pal.emerald": "Emerald",
    "pal.forest": "Forest",
    "pal.graphite": "Graphite",
    "stk.none": "No stickers",
    "stk.empty": "No sticker themes yet — coming soon!",
    "stk.countTitle": "Number of stickers",
    "stk.err.generic": "Couldn't save your choice. Please try again.",
    // ---- Round 9 (merged) ----
    "ana.subject.all": "All",
    "ana.kpi.last7": "Practice (last 7 days)",
    "ana.chart.trendSub30": "Daily accuracy over the last 30 days (%)",
    "ana.th.questions": "Questions",
    "ana.rangeNote": "Figures cover the last 30 days.",
    "ana.empty.title": "No practice data for this selection yet.",
    "ana.empty.sub": "Results will appear here once your child starts taking tests.",
    "ana.empty.trend": "Not enough data for a trend yet.",
    "ana.empty.mistakes": "No mistakes in this period — great job!",
    "ana.mode.label": "Analytics type",
    "ana.mode.subjects": "Subjects",
    "ana.mode.olympiads": "Olympiads",
    "ana.olymp.kpi.attempts": "Olympiad attempts",
    "ana.olymp.perPackage": "Results by package",
    "ana.olymp.perPackageSub": "Attempts, answers and accuracy for each olympiad package",
    "ana.th.package": "Package",
    "ana.th.attempts": "Attempts",
    "ana.olymp.empty.title": "No olympiad attempts yet",
    "ana.olymp.empty.sub": "Results will appear here once your child takes a test in an olympiad package.",
    "poly.nav": "Olympiads",
    "poly.title": "Olympiads",
    "poly.subtitle": "Browse the active olympiad packages and get them for the child you choose.",
    "poly.chooseChild": "Choose a child",
    "poly.noChildren": "To buy an olympiad package, first add a child profile.",
    "poly.addChild": "Add a child",
    "poly.none": "There are no active olympiad packages right now.",
    "poly.owned": "Owned",
    "poly.buy": "Get",
    "poly.buyNow": "Get it",
    "poly.questions": "questions",
    "poly.price": "Price",
    "poly.free": "Free",
    "poly.modal.title": "Confirm purchase",
    "poly.modal.package": "Package",
    "poly.modal.child": "Child",
    "poly.modal.payNote": "The next step takes you to the bank's payment page. The package is unlocked only after the payment is confirmed, and access is then for life.",
    "poly.modal.confirm": "Confirm and buy",
    "poly.modal.cancel": "Cancel",
    "poly.modal.close": "Close",
    "poly.modal.pending": "Processing payment…",
    "poly.modal.success": "Purchase complete! The package now appears in your child's \"My Olympiads\" section.",
    "poly.modal.already": "This package is already owned for this child.",
    "poly.err.generic": "Something went wrong during the purchase. Please try again in a moment.",
    // Sale window (olympiad_packages.sale_starts_at/sale_ends_at)
    "poly.err.notOnSale": "Sales for this package have ended.",
    "poly.err.notForGrade": "This package is not intended for the selected student's grade.",
    "poly.err.alreadyOwned": "This child already has this package — access is for life.",
    "poly.err.priceMoved":
      "The price has been updated. Refresh the page to see the new one.",
    "oly5.errNotForGrade": "This olympiad isn't intended for your grade.",
    "poly.notOnSale": "Sales ended",
    // ---- Olympiad card "Details" (Round 43) ----
    "poly.details": "Details",
    "poly.det.type": "Olympiad type",
    "poly.det.subject": "Subject",
    "poly.det.grade": "Grade",
    "poly.det.grades": "Grades",
    "poly.det.questions": "Questions",
    "poly.det.perAttempt": "Questions per attempt",
    "poly.det.duration": "Duration",
    "poly.det.eventAt": "Event date",
    "poly.det.saleStart": "Sales start",
    "poly.det.saleEnd": "Sales end",
    "poly.det.price": "Price",
    "poly.det.description": "Description",
    "poly.det.minutes": "min",
    // ---- Public olympiad packages section (landing + Services) ----
    "polyPub.eyebrow": "Olympiads",
    "polyPub.title": "Active olympiad packages",
    "polyPub.sub": "Pick an olympiad package for your child — join before sales close.",
    "polyPub.empty": "There are no olympiad packages on sale right now. New packages will be announced soon.",
    "polyPub.salesUntil": "On sale until {date}",
    "polyPub.eventAt": "Olympiad date: {date}",
    "polyPub.cta": "Sign up",
    "polyPub.ctaParent": "Get this package",
    "polyPub.seeAll": "See all",
    "polyPub.pageTitle": "All olympiad packages",
    "polyPub.pageLead": "Find the right olympiad package for your child — every active package is listed here.",
    "polyPub.statusOnSale": "On sale",
    "polyPub.error": "We couldn't load the olympiad list. Please try again in a moment.",
    "polyPub.back": "All olympiads",
    "polyPub.howTitle": "How to take part",
    "polyPub.how1": "Create a parent account and add your child's profile.",
    "polyPub.how2": "Get the package from your parent panel — access is lifetime and never expires.",
    "polyPub.how3": "Your child then answers the package's full question set within the time limit.",
    "polyPub.parentOnlyNote": "Olympiad packages are bought from the parent account only — students can't make purchases.",
    // ---- Child avatar (Add/Edit-Child, parent-managed) ----
    "addchild.avatar.title": "Profile picture",
    "addchild.avatar.hint": "Choose a ready-made avatar for your child or upload a photo (optional).",
    "addchild.avatar.default": "Default",
    "addchild.avatar.boy": "Boy",
    "addchild.avatar.girl": "Girl",
    "addchild.avatar.upload": "Upload photo",
    "addchild.avatar.replace": "Replace photo",
    "addchild.avatar.removePhoto": "Remove photo",
    "addchild.avatar.photoSelected": "Photo selected",
    "addchild.avatar.requirements": "PNG, JPEG or WebP, up to 2 MB.",
    // ---- Round 8 (merged) ----
    "about2.hero.eyebrow": "About us",
    "about2.hero.title": "Great peaks are conquered in small steps",
    "about2.hero.lead": "Behind every olympiad winner's success stand planned preparation, consistent practice and the right guidance. OlympIQ is an AI-powered olympiad preparation platform built exactly for that. It gives students in grades 1–11 the opportunity to grow their knowledge systematically, prepare for olympiads at a professional level and unlock their full potential.",
    "about2.hero.p2": "The AI technology analyses each student's results, identifies strong topics and those that need work, and prepares personalised reports and learning recommendations. Every student grows according to their own knowledge level and needs, learns more efficiently and moves toward their goals step by step.",
    "about2.hero.p3": "The platform offers thousands of tasks in mathematics, science, logic and English, olympiad-format mock tests and daily practice. Questions are matched to the student's grade level and chosen topics, while regular practice consolidates knowledge and develops olympiad skills.",
    "about2.hero.p4": "On OlympIQ, accounts are managed by the parent. The parent adds their children and manages subject choices and subscriptions, while the student focuses purely on learning through a simple, safe sign-in system. This approach ensures safety and lets parents comfortably steer the preparation process.",
    "about2.hero.chip1": "Grades 1–11",
    "about2.hero.chip2": "4 subjects",
    "about2.hero.chip3": "3 interface languages",
    "about2.b1.tag": "Daily practice",
    "about2.b1.title": "Learn, try, rise!",
    "about2.b1.body": "Students practise every day with questions matched to their grade level. Small but steady steps build the solid foundation an olympiad demands.",
    "about2.b2.tag": "Family model",
    "about2.b2.title": "Parents manage, children learn",
    "about2.b2.body": "The parent creates each child's account, picks subject subscriptions and tracks progress from one panel. The child simply signs in to the platform with an 8-digit ID.",
    "about2.b3.tag": "Olympiad Preparation",
    "about2.b3.title": "Tests in a real olympiad format",
    "about2.b3.body": "On every attempt the AI automatically selects 25 questions — nobody picks the difficulty themselves. Packages are bought once and give unlimited access.",
    "about2.b4.tag": "Analytics",
    "about2.b4.title": "Progress you can see in numbers",
    "about2.b4.body": "Results, strengths and weaknesses per subject, the daily streak — everything is presented in clear charts. The parent sees exactly which tasks the child did and how they scored.",
    "about2.b5.tag": "Safety",
    "about2.b5.title": "A safe space for children",
    "about2.b5.body": "Child accounts work without email and can never make a payment — every payment happens only from the parent account. Children's data is protected and never used for unauthorised marketing.",
    "about2.values.title": "OlympIQ at a glance",
    "about2.values.sub": "Four principles, one platform.",
    "about2.v1.title": "Our mission",
    "about2.v1.body": "Make quality olympiad preparation accessible for every family. Regular, measurable preparation — for every student.",
    "about2.v2.title": "What we offer",
    "about2.v2.body": "Subject subscriptions (Mathematics, Science, Logic, English), Olympiad Preparation packages, daily mock rounds and progress analytics.",
    "about2.v3.title": "Who it's for",
    "about2.v3.body": "For students in grades 1–11 and their parents. The parent manages the account; the child focuses on learning.",
    "about2.v4.title": "Trust and transparency",
    "about2.v4.body": "Questions are selected on the server, results are shown transparently, and payments are secure and parent-only.",
    "about2.team.title": "Our Team",
    "about2.team.sub": "The team and legal information behind the OlympIQ project.",
    "about2.team.body": "The OlympIQ project is implemented by Kamil Piriyev (Tax Identification Number: 6300091352) and his partners.",
    "about2.team.addrLabel": "Legal address",
    "about2.team.addrValue": "Peshtatuk village,\nLerik District,\nRepublic of Azerbaijan",
    "ana.section.title": "Detailed progress",
    "ana.section.sub": "Choose a child and a subject to see detailed results below.",
    "ana.noChildren": "Add a child first to see their analytics.",
    "ana.addChild": "Add a child",
    "ana.childLabel": "Child",
    "ana.subjectLabel": "Subject",
    "ana.subject.math": "Math",
    "ana.subject.science": "Science",
    "ana.subject.logic": "Logic",
    "ana.subject.english": "English",
    "ana.locked": "Subscribe to unlock this subject's analytics.",
    "ana.noActive": "This child doesn't have an active subject subscription yet.",
    "ana.goSubscribe": "Go to subscription",
    "ana.kpi.weekly": "Practice this week",
    "ana.kpi.tests": "Tests completed",
    "ana.kpi.correct": "Correct answers",
    "ana.kpi.wrong": "Wrong answers",
    "ana.kpi.skipped": "Skipped answers",
    "ana.kpi.accuracy": "Average accuracy",
    "ana.kpi.time": "Time practicing",
    "ana.kpi.best": "Best topic",
    "ana.kpi.weak": "Weakest topic",
    "ana.topic.needSample": "A topic needs at least {n} answers before it can be rated ({a}/{n}).",
    "ana.topic.needTopics": "At least {n} topics need enough answers before they can be compared.",
    "ana.topic.allEqual": "Every topic is at the same level ({p}%) — nothing to separate them yet.",
    "ana.kpi.last": "Last activity",
    "ana.chart.weekly": "Weekly practice",
    "ana.chart.weeklySub": "Practice sessions over the last 7 days",
    "ana.chart.trend": "Accuracy trend",
    "ana.chart.trendSub": "Average accuracy over the last 8 weeks (%)",
    "ana.chart.topics": "Topic performance",
    "ana.chart.mistakes": "Mistakes by topic",
    "ana.th.topic": "Topic",
    "ana.th.subtopic": "Subtopic",
    "ana.th.tests": "Tests",
    "ana.th.accuracy": "Accuracy",
    "ana.th.mistakes": "Mistakes",
    "ana.day.mon": "Mon",
    "ana.day.tue": "Tue",
    "ana.day.wed": "Wed",
    "ana.day.thu": "Thu",
    "ana.day.fri": "Fri",
    "ana.day.sat": "Sat",
    "ana.day.sun": "Sun",
    "ana.unit.h": "h",
    "ana.unit.m": "min",
    "ana.weekAbbr": "W",
    "ana.topic.fractions": "Fractions",
    "ana.topic.comparingFractions": "Comparing fractions",
    "ana.topic.geometry": "Geometry",
    "ana.topic.angles": "Angles",
    "ana.topic.wordProblems": "Word problems",
    "ana.topic.multiStep": "Multi-step problems",
    "ana.topic.multiplication": "Multiplication",
    "ana.topic.plants": "Plants",
    "ana.topic.photosynthesis": "Photosynthesis",
    "ana.topic.humanBody": "Human body",
    "ana.topic.skeleton": "Skeleton",
    "ana.topic.matter": "Matter",
    "ana.topic.statesOfMatter": "States of matter",
    "ana.topic.space": "Space",
    "ana.topic.patterns": "Patterns",
    "ana.topic.shapePatterns": "Shape patterns",
    "ana.topic.sequences": "Sequences",
    "ana.topic.numberSequences": "Number sequences",
    "ana.topic.spatial": "Spatial reasoning",
    "ana.topic.mirror": "Mirror images",
    "ana.topic.puzzles": "Puzzles",
    "ana.topic.vocabulary": "Vocabulary",
    "ana.topic.irregularVerbs": "Irregular verbs",
    "ana.topic.grammar": "Grammar",
    "ana.topic.presentSimple": "Present Simple",
    "ana.topic.reading": "Reading",
    "ana.topic.shortStories": "Short stories",
    "ana.topic.listening": "Listening",
    "billing.tab.plans": "Plans",
    "billing.tab.billing": "Billing",
    "billing.tab.invoices": "Invoices",
    "billing.tabsAria": "Subscription sections",
    "billing.plansTitle": "Plans & subjects",
    "billing.billingTitle": "Billing details",
    "billing.invoicesTitle": "Invoices",
    "billing.invoicesEmpty": "No invoices yet. They will appear here once your first payment goes through.",
    "billing.noBillingYet":
      "No billing details yet. Once a plan is active, the billing cycle, the next charge date and its amount appear here.",
    "billing.current": "Current plan",
    "billing.popular": "Most popular",
    "billing.addSubjects": "Add subjects",
    "billing.noSubjects": "No subjects selected yet",
    "billing.totalLabel": "Total",
    "billing.perWeek": "/ week",
    "billing.perMonth": "/ month",
    "billing.perYear": "/ year",
    "billing.row.cycle": "Billing cycle",
    "billing.row.next": "Next billing date",
    "drawer2.account": "Account",
    "drawer2.language": "Language",
    "drawer2.appearance": "Appearance",
    "drawer2.session": "Session",
    "drawer2.themeLight": "Light",
    "drawer2.themeDark": "Dark",
    "oly4.eyebrow": "Competitions",
    "oly4.pageTitle": "Olympiads",
    "oly4.plannedTitle": "Planned olympiads",
    "oly4.mineTitle": "My olympiads",
    "oly4.none": "There are no planned olympiads right now.",
    "oly4.details": "Details",
    "oly4.buyNote": "To join this olympiad, ask your parent to buy the package.",
    "oly4.close": "Close",
    "oly4.subject": "Subject",
    "oly4.type": "Olympiad type",
    "oly4.date": "Date",
    "oly4.qcount": "Number of questions",
    "oly4.price": "Price",
    "oly4.questions": "questions",
    "oly4.dateTbd": "Date to be announced",
    "oly4.free": "Free",
    "oly4.status.upcoming": "Upcoming",
    "oly4.status.planned": "Planned",
    "oly4.status.held": "Held",
    "pricing2.title": "Prices that fit your budget",
    "pricing2.sub": "Plans are priced separately per subject and per child. Pick the package you need — the total is calculated automatically.",
    "pricing2.popular": "Most popular",
    "pricing2.sibling.title": "Family package",
    "pricing2.sibling.body": "When several children from one family are added, the discount applies automatically: -10% for the 2nd child and -15% for the 3rd and every further child. No promo code needed.",
    "pricing2.note": "The prices shown are sample prices; final prices will be confirmed by the platform.",
    // ---- Public services configurator (cfg.*) — subject picker + live price ----
    "cfg.available": "Available subjects",
    "cfg.availableHint": "Add the subjects your child needs.",
    "cfg.selected": "Your selection",
    "cfg.add": "Add",
    "cfg.addAria": "Add {subject} to your selection",
    "cfg.removeAria": "Remove {subject} from your selection",
    "cfg.allAdded": "Every subject is already selected.",
    "cfg.emptySelection": "Select at least one subject to see the price.",
    "cfg.countLabel": "Subjects selected",
    "cfg.perSubjectLabel": "Price per subject",
    "cfg.perSubjectMixed": "varies by subject",
    "cfg.subtotalLabel": "Subtotal",
    "cfg.totalLabel": "Total",
    "cfg.unpriced": "Not sold for this period",
    "cfg.cta": "Continue",
    "cfg.ctaNoteGuest": "Next step: create a parent account — your selection comes with you.",
    "cfg.ctaNoteParent": "Next step: add a child — these subjects will already be ticked.",
    "cfg.warnAllUnpriced": "The subjects you picked aren't sold for this billing period. Choose another period.",
    "cfg.warnSomeUnpriced": "{n} subject(s) aren't sold for this billing period and are excluded from the total.",
    "cfg.childNote": "Only a parent account can buy a subscription.",
    "cfg.serverNote": "This calculation is for information only. The final amount is worked out on the server at checkout, where any family discount is applied.",
    "cfg.loadError": "Prices could not be loaded. Please try again shortly.",
    // ---- Per-subject billing cycles (plan.*) — migration 109. Each subject
    // carries its own cycle, so there is no single "billing period" label and
    // no single recurring total; the honest aggregate is plan.dueToday.
    "plan.cycle": "Billing cycle",
    "plan.cycleAria": "Billing cycle for {subject}",
    "plan.cycleChangedAria": "{subject}: {cycle}",
    "plan.group.weekly": "Weekly subjects",
    "plan.group.monthly": "Monthly subjects",
    "plan.group.yearly": "Yearly subjects",
    "plan.group.subtotal": "Subtotal",
    "plan.dueToday": "Due today",
    "plan.dueTodayNote":
      "These subjects run on different cycles, so there is no single recurring figure — each cycle renews on its own.",
    "plan.renewals": "Renewals",
    "plan.renewalLine.weekly": "Weekly subjects renew every week at {total} {currency}.",
    "plan.renewalLine.monthly": "Monthly subjects renew every month at {total} {currency}.",
    "plan.renewalLine.yearly": "Yearly subjects renew every year at {total} {currency}.",
    "plan.mixedNote":
      "Every subject has its own billing cycle. Changing one never changes another.",
    "plan.fromPrice": "from {price} / {cycle}",
    "plan.removeAria": "Remove {subject} from your selection",
    "plan.removeSubject": "Remove",
    "plan.perSubjectHint": "Pick a billing cycle for each subject.",
    "subjedit.pendingPlanChange": "Cycle change",
    "subjedit.planChangeLine": "{subject}: {from} → {to} (from {date})",
    "subjedit.planChangeNote":
      "Nothing is charged now — the new cycle starts at that subject's next renewal.",
    "sub.err.badInterval": "That billing cycle isn't valid.",
    "cfg.noSubjects": "No subjects are on sale right now.",
    "cfg.recap.title": "Your selection",
    "cfg.recap.note": "After you register, these subjects will already be ticked when you add your child.",
    "prof2.accountInfo": "Account information",
    "prof2.name": "Name",
    "prof2.email": "Email",
    "prof2.security": "Security",
    "prof2.securityHint": "Update your password from time to time to keep your account secure.",
    "prof2.danger": "Danger zone",
    "prof2.dangerHint": "Deleting your account removes your parent profile, every child profile you created and all of their learning data. This action cannot be undone. A small number of records are kept in anonymised form for accounting and security — see the Privacy Policy.",
    "prof2.session": "Session",
    "prof2.sessionHint": "Sign out of your account on this device.",
    "prof2.idHint": "You use this ID to log in.",
    "prof2.selected": "Selected",
    "app.brand": "OlympIQ",
    "home.subtitle": "Student & Parent Web App — foundation skeleton.",
    "supabase.heading": "Supabase connection",
    "supabase.configured": "configured ✓",
    "supabase.notConfigured":
      "not configured — copy .env.local.example to .env.local and add your Supabase URL + anon key",
    "home.note":
      "Auth, dashboards, daily tasks, tests and reports are added in later stages. This page only verifies the app boots.",
    "state.loading": "Loading…",
    "error.title": "Something went wrong",
    "error.desc": "An unexpected error occurred. Please try again.",
    "action.retry": "Try again",
    "notFound.title": "Page not found",
    "notFound.desc": "The page you’re looking for doesn’t exist.",
    "action.goHome": "Go home",
    "unauthorized.title": "Unauthorized",
    "unauthorized.desc": "You don’t have access to this page.",
    "lang.label": "Language",
    "auth.child.err.idFormat": "Enter the 8-digit ID.",
    "auth.child.err.passwordRequired": "Enter the password.",
    "auth.child.err.passwordTooShort": "Password must be at least 8 characters.",
    "auth.child.err.nameTooLong": "The name is too long (80 characters max).",
    "auth.child.err.passwordEqualsId": "Password cannot be the same as the ID.",
    "auth.child.err.firstNameRequired": "Enter the first name.",
    "auth.child.err.lastNameRequired": "Enter the last name.",
    "auth.child.err.invalidCredentials": "Incorrect ID or password.",
    "auth.child.err.locked": "Too many failed attempts. Please try again later.",
    "auth.child.err.notYourChild": "This child is not on your account.",
    "auth.child.err.childNotFound": "Child account not found.",
    "auth.child.err.createFailed": "Could not create the child account. Please try again.",
    "auth.child.err.updateFailed": "Could not update the password. Please try again.",
    "auth.child.err.serverError": "Server error. Please try again.",
    "auth.child.created": "Child account created.",
    "auth.child.passwordReset": "Password updated.",
    "nav.home": "Home",
    "nav.back": "Back",
    "nav.subjects": "Subjects",
    "nav.pricing": "Services",
    "nav.news": "News",
    "nav.about": "About us",
    "nav.faq": "FAQ",
    "nav.contact": "Contact",
    "nav.login": "Log in",
    "nav.myPanel": "My panel",
    "nav.register": "Register",
    "foot.rights": "One step higher every day",
    "home.heroTitle": "OlympIQ — One step higher every day",
    "home.heroLead":
      "An olympiad preparation portal for grades 1–11. A subscription-based platform for students — the parent manages, the child learns.",
    "home.ctaStart": "Get started",
    "home.ctaSubjects": "Explore subjects",
    "home.ctaOlympiads": "Browse olympiads",
    "home.f1Title": "Parent-managed accounts",
    "home.f1Desc":
      "The parent registers and creates a separate account for each child — the child signs in with a simple 8-digit ID.",
    "home.f2Title": "Subject packages",
    "home.f2Desc":
      "Weekly, monthly or yearly subscriptions per child across the subjects — Mathematics, Science, Logic and English",
    "home.f3Title": "Olympiad preparation",
    "home.f3Desc": "Dedicated olympiad packages — unlimited access and daily mock runs",
    "home.f4Title": "Daily practice",
    "home.f4Desc":
      "Questions are selected on the server to match the student's level — refreshed every weekday. Steady progress.",
    "about.title": "About OlympIQ",
    "about.p1":
      "OlympIQ helps Azerbaijani students in grades 1–11 prepare for olympiads and build strong fundamentals through daily practice.",
    "about.p2":
      "Parents stay in control: they create and manage each child's account, choose subjects, and follow progress — all in one place.",
    "subjects.title": "Subjects",
    "subjects.lead": "Choose the subjects your child needs. You can add more at any time.",
    "subjects.note":
      "Pricing is per subject, per child. Sibling discounts apply automatically.",
    "subject.math": "Mathematics",
    "subject.science": "Science",
    "subject.logic": "Logic",
    "subject.english": "English",
    "pricing.title": "Services",
    "pricing.lead": "Simple, per-subject pricing for each child.",
    "pricing.perSubject": "per subject",
    "pricing.weekly": "Weekly",
    "pricing.monthly": "Monthly",
    "pricing.yearly": "Yearly",
    "pricing.trial": "Every new subject starts with a 7-day free trial.",
    "pricing.sibling": "Automatic sibling discount: 2nd child −10%, 3rd+ child −15%.",
    "pricing.promo":
      "A launch promotion runs at start; prices are illustrative and set by the platform.",
    "pricing.note": "Only parents can purchase. Children never see prices or payments.",
    "faq.title": "Frequently asked questions",
    "faq.q1": "Who creates the student's account?",
    "faq.a1":
      "Only the parent. After registering, the parent adds each child and sets a password. The system issues a unique 8-digit ID the student uses to log in.",
    "faq.q2": "How do students log in?",
    "faq.a2":
      "Students log in to the portal with their 8-digit ID and the password set by the parent. No email is required.",
    "faq.q3": "How does pricing work?",
    "faq.a3":
      "Each subject and each child has its own subscription package (weekly, monthly or yearly). It starts with a free 7-day trial, and an automatic sibling discount applies for 2 or more children from the same family.",
    "faq.q4": "What is Olympiad Preparation?",
    "faq.a4":
      "Unlimited access to questions built around olympiad topics.",
    "faq.q5": "Can students make purchases themselves?",
    "faq.a5": "No. All payments and subscription choices are made only by the parent.",
    "contact.title": "Contact",
    "contact.lead": "Questions or feedback? We'd love to hear from you.",
    "contact.email": "Email",
    "contact.note": "A contact form will be available soon.",
    "newsp.none": "No news yet.",
    "newsp.back": "← Back to news",
    "login.title": "Log in",
    "login.studentTitle": "Student login",
    "login.studentHint": "Log in with your 8-digit ID and password (not an email).",
    "login.studentCta": "Log in as a student",
    "login.parentTitle": "Parent login",
    "login.parentHint": "Log in with your email and password.",
    "login.lead": "Parent and child login arrives in the next stage.",
    "register.title": "Create a parent account",
    "register.lead": "Parent registration arrives in the next stage.",
    "auth.childLoginHint":
      "Children log in with their 8-digit ID and a parent-set password.",
    "parent.auth.name": "Your name",
    "parent.auth.email": "Email",
    "parent.auth.firstName": "First name",
    "parent.auth.lastName": "Last name",
    "parent.err.unverified": "Please verify your email. We sent you a confirmation link.",
    "verify.title": "Verify your email",
    "verify.body": "Click the confirmation link we sent to your inbox to activate your account.",
    "verify.bodyTo": "We sent a confirmation link to:",
    "verify.hint": "Don't see it? Check your spam folder.",
    "verify.resendPrompt":
      "Email never arrived? Enter your address and we'll send the confirmation link again.",
    "verify.resend": "Resend link",
    "verify.resent":
      "If that address is waiting to be confirmed, we've sent the link again. Check your inbox and your spam folder.",
    "verify.resendFailed": "Couldn't send the link. Please try again in a moment.",
    "verify.state.ok": "Your email is confirmed. You can sign in now.",
    "verify.state.expired": "That confirmation link has expired. We can send you a new one.",
    "verify.state.failed": "That confirmation link did not work. It may already have been used, or copied incompletely.",
    "confirmed.title": "Your email is confirmed",
    "confirmed.body": "Your account is active. You can sign in now.",
    "confirmed.openApp": "Open the OlympIQ app",
    "confirmed.continueWeb": "Continue on the website",
    "confirmed.goDashboard": "Go to dashboard",
    "confirmed.appHint": "If the app does not open, open it yourself and sign in with your email address and password.",
    "confirmed.desktopHint": "If you use the mobile app, open it and sign in with your email address and password.",
    "forgot.title": "Reset password",
    "forgot.hint": "Enter your email and we'll send a reset link.",
    "forgot.submit": "Send link",
    "forgot.sent": "If that email is registered, a reset link has been sent. Check your inbox.",
    "reset.title": "Set a new password",
    "reset.hint": "Enter a new password for your account (at least 8 characters).",
    "reset.newPassword": "New password",
    "reset.submit": "Update password",
    "account.delete": "Delete account",
    "account.deleteConfirm": "Your account, all your children's accounts and their learning data will be permanently deleted. A small number of records are kept in anonymised form (see the Privacy Policy). Continue?",
    "child.resetPw": "Reset password",
    "child.newPassword": "New password",
    "child.resetPwSubmit": "Update",
    "child.resetPwOk": "Updated ✓",
    "child.deleteChild": "Delete child",
    "child.deleteConfirm": "Permanently delete this child account?",
    "parent.auth.password": "Password",
    "parent.auth.login": "Log in",
    "parent.auth.register": "Create account",
    "parent.auth.submitting": "Please wait…",
    "parent.auth.noAccount": "No account yet?",
    "parent.auth.haveAccount": "Already have an account?",
    "parent.auth.registerNote":
      "Register as a parent to add and manage your child.",
    "parent.err.email": "Enter a valid email.",
    "parent.err.password": "Password must be at least 8 characters.",
    "parent.err.tooMany":
      "Too many attempts. Please try again in a few minutes.",
    "parent.err.required": "Enter your email and password.",
    "parent.err.invalid": "Incorrect email or password.",
    "parent.err.createFailed":
      "Could not create the account. The email may already be in use.",
    "parent.nav.dashboard": "Dashboard",
    "parent.nav.addChild": "Add child",
    "parent.nav.logout": "Log out",
    "parent.dash.title": "My children",
    "parent.dash.addChild": "Add child",
    "parent.dash.noChildren": "You haven't added any children yet.",
    "parent.dash.childId": "Login ID",
    "parent.child.title": "Add a child",
    "parent.child.intro":
      "Enter your child's details. The 8-digit login ID is created after you choose a plan.",
    "parent.child.first": "First name",
    "parent.child.last": "Last name",
    "parent.child.city": "City",
    "parent.child.citySelect": "Select a city",
    "parent.child.cityOther": "Other…",
    "parent.child.cityOtherLabel": "City name",
    "parent.child.school": "School",
    "parent.child.grade": "Class / grade",
    "parent.child.gradeSelect": "Select a grade",
    "parent.child.password": "Child's password",
    "parent.child.passwordHint":
      "At least 8 characters. Your child uses this with their 8-digit ID.",
    "parent.child.submit": "Create child",
    "parent.child.submitting": "Creating…",
    "parent.child.created": "Child account created.",
    "parent.child.choosePlan": "Choose a plan & get the ID",
    "parent.child.choosePlanNote":
      "The 8-digit login ID is created once you choose a plan. Select subjects to continue.",
    "parent.child.idLabel": "8-digit login ID",
    "parent.child.idNote":
      "Save this ID. Your child logs in with it and the password you set.",
    "parent.child.another": "Add a new child",
    "access.inactive": "No access",
    "access.trialing": "Trial",
    "access.active": "Active",
    "access.locked": "Locked",
    "access.expired": "Expired",
    "parent.dash.manage": "Subjects",
    "parent.dash.choosePlan": "Choose a plan",
    "parent.dash.idPending": "ID pending — choose a plan",
    "sub.title": "Subjects & subscription",
    "sub.interval": "Billing period",
    "sub.subjects": "Subjects",
    "sub.subtotal": "Subtotal",
    "sub.siblingNote": "sibling discount is applied on confirmation",
    "sub.submit": "Start 7-day free trial",
    "sub.submitting": "Starting…",
    "sub.done": "Trial started.",
    "sub.base": "Base price",
    "sub.discount": "Sibling discount",
    "sub.total": "Total after trial",
    "sub.totalNow": "Total payable",
    "sub.trial": "Free trial",
    "sub.days": "days",
    "sub.previewHint": "Select at least one subject to see the price.",
    "sub.calculating": "Calculating…",
    "sub.noSibling": "no discount",
    "sub.discount.rank2": "Second child discount",
    "sub.discount.rank3": "Third and further child discount",
    "sub.discount.hint":
      "A second child gets 10% off automatically, a third and any after that 15%.",
    "sub.discount.saved": "You save",
    "sub.noSubjectsAvailable": "No subjects with active pricing yet.",
    "sub.err.invalid": "Please choose a billing period.",
    "sub.err.noSubjects": "Select at least one subject.",
    // Migration 125 — the plan is created only after the bank confirms the
    // payment, so the start-a-plan screen ends on a payment step, not on a
    // "done" message.
    "sub.payFirst": "Complete your payment",
    "sub.payFirstNote":
      "The plan becomes active once the payment is confirmed. Your child's 8-digit login ID is created at the same moment and appears in the parent panel.",
    "sub.trialNoChargeToday":
      "Nothing is charged today — a {days}-day trial starts now, and the first payment is taken only when it ends.",
    "sub.err.notYourChild": "This child is not on your account.",
    "sub.err.idFailed": "Could not assign the login ID. Please try again.",
    "sub.err.failed": "The operation could not be completed. Please try again.",
    "sub.err.priceMoved":
      "The prices changed. Refresh the page and confirm your choice again.",
    "gate.paymentsOff":
      "Payments are temporarily paused. New subscriptions and purchases are unavailable right now.",
    "gate.giveawayFree":
      "A free giveaway period is running — everything is unlocked at no cost, so no payment is needed right now.",
    "gate.freeAccess":
      "A free-access period is active for you — all subscription features are unlocked at no cost right now.",
    // Migration 126 — a change that costs money, asked for on a surface that
    // may not take money (the mobile BFF). The copy is bound by
    // docs/STORE_PAYMENTS_COMPLIANCE.md section 5: it states a FACT about where
    // subscriptions are managed and names no price, no destination, no URL and
    // no purchase verb. "Manage it on your web account" is specifically the
    // WRONG form (audit finding I6) — it is the sentence an App Store reviewer
    // screenshots. This one is the shape section 5 lists as right.
    "gate.notInApp":
      "This change can't be completed in the app. Subscriptions aren't managed in this app.",
    "fa.title": "Free access",
    "fa.sub": "All subscription features are free for you right now.",
    "gate.olympiadOff": "The olympiad module is currently unavailable.",
    "gate.leaderboardOff":
      "Ranking is currently unavailable — the feature has been temporarily disabled by an administrator.",
    "subjedit.title": "Manage subjects",
    "subjedit.current": "Current subjects",
    "subjedit.add": "Add",
    "subjedit.remove": "Remove",
    "subjedit.addPick": "Choose a subject",
    "subjedit.none": "No subjects.",
    "subjedit.minOne": "At least one subject must remain.",
    "subjedit.err.addFailed": "Could not add the subject.",
    "subjedit.err.removeFailed": "Could not remove the subject.",
    "child.loginNote": "Log in with your 8-digit ID and the password your parent set.",
    "child.id": "8-digit ID",
    "child.password": "Password",
    "child.login": "Log in",
    "child.loggingIn": "Logging in…",
    "child.parentLogin": "Are you a parent? Log in here",
    "child.logout": "Log out",
    "child.hello": "Hi",
    "child.contentTitle": "Your learning",
    "child.contentSoon":
      "Daily tasks, tests and olympiad practice appear here soon.",
    "child.locked.inactive": "No active subscription yet",
    "child.locked.locked": "Access is paused",
    "child.locked.expired": "Subscription expired",
    "child.lockedNote":
      "Ask your parent to activate a subject subscription so you can start learning.",
    "child.noSubjects": "No subjects yet — ask your parent to add one.",
    "practice.title": "Practice",
    "practice.start": "Practice",
    "practice.questions": "questions",
    "practice.submit": "Submit answers",
    "practice.submitting": "Submitting…",
    "practice.result": "Your result",
    "practice.back": "Back to dashboard",
    "practice.error": "Something went wrong. Please try again.",
    "oly3.parentTitle": "Olympiad packages",
    "oly3.none": "No packages available right now.",
    "oly3.owned": "Owned",
    "oly3.buy": "Buy",
    "oly3.childTitle": "My olympiads",
    "oly3.childNone": "No olympiad packages yet — ask your parent to buy one.",
    "oly3.start": "Start",
    "oly5.continueTitle": "You have an olympiad attempt in progress",
    "oly5.noticeClosed": "That olympiad attempt is already closed — it was canceled or ran out of time.",
    "oly5.errNoAccess": "You don't have access to this olympiad — ask your parent to purchase it.",
    "oly5.errEmpty": "This olympiad has no questions yet — coming soon.",
    "oly5.perAttemptShort": "{n} per attempt",
    "oly5.practiceOnly":
      "Olympiad attempts are practice — they don't affect points, percentage, or ranking.",
    "parent.dash.olympiads": "Olympiads",
    "child.myOlympiads": "My olympiads",
    "prog.title": "Progress",
    "prog.none": "No results yet.",
    "prog.recent": "Recent results",
    "parent.dash.progress": "Progress",
    "kind.practice": "Practice",
    "kind.olympiad": "Olympiad",
    "kind.test": "Test",
    "kind.daily": "Daily",
    "arena.brand": "OlympIQ",
    "arena.nav.arena": "Home",
    "arena.nav.tasks": "Olympiads",
    "arena.nav.rank": "Ranking",
    "arena.nav.profile": "Profile",
    "arena.streak": "day streak",
    "arena.heroEyebrow": "Competition arena",
    "arena.heroTitle": "Take the next round and climb.",
    "arena.startRound": "Start a round",
    "arena.join": "Join",
    "arena.rankLabel": "Country rank",
    "arena.statPoints": "Points",
    "arena.statAccuracy": "Accuracy",
    "arena.statRounds": "Rounds",
    "arena.tickerLive": "LIVE",
    "arena.tickerToday": "TODAY",
    "arena.todaysRounds": "Today's rounds",
    "arena.subjectStrength": "Subject strength",
    "arena.questionsShort": "questions",
    "arena.go": "Start ▸",
    "arena.noStrength": "No data yet — finish a round.",
    "arena.recentRounds": "Recent rounds",
    "arena.lb.title": "Leaderboard",
    "arena.lb.eyebrow": "Leaders",
    "arena.lb.country": "Country",
    "arena.lb.region": "Region",
    "arena.lb.school": "School",
    "arena.lb.grade": "Grade",
    "arena.lb.colRank": "Rank",
    "arena.lb.colParticipant": "Participant",
    "arena.lb.colAccuracy": "Accuracy",
    "arena.lb.colPoints": "Points",
    "arena.lb.you": "You",
    "arena.lb.soon": "The full leaderboard opens soon — for now we show your own standing.",
    "arena.lb.empty": "Finish your first round to appear on the leaderboard.",
    // — L1: real leaderboard (lb.*) —
    "lb.title": "Leaderboard",
    "lb.eyebrow": "Leaders",
    "lb.board.points": "Points",
    "lb.board.percent": "Percent",
    "lb.board.streak": "Streak",
    "lb.scope.global": "Global",
    "lb.scope.subject": "Subject",
    "lb.scope.grade": "Grade",
    "lb.scope.city": "City",
    "lb.scope.school": "School",
    "lb.period.month": "This month",
    "lb.period.all": "All time",
    "lb.colRank": "Rank",
    "lb.colStudent": "Participant",
    "lb.colPoints": "Points",
    "lb.colPercent": "Percent",
    "lb.colStreak": "Streak",
    "lb.you": "You",
    "lb.colCity": "City",
    "lb.colSchool": "School",
    "lb.colGrade": "Grade",
    "lb.subjectLabel": "Subject",
    "lb.days": "days",
    "lb.pointsUnit": "pts",
    "lb.empty.month": "No one has posted a result this month yet — be the first!",
    "lb.empty.all": "No one has posted a result yet — be the first!",
    "lb.empty.streak": "No one has a streak yet — start yours today!",
    "lb.myRank.title": "Your rank",
    "lb.myRank.none": "You're not on the board yet — finish your first round!",
    "lb.provisional": "Provisional",
    "lb.provisionalHint": "At least {n} rounds are required for an official position.",
    "lb.myRank.provisional": "Your result is provisional — {a}/{n} rounds for an official position.",
    "lb.streak.current": "Current streak",
    "lb.streak.best": "Best",
    "lb.streak.active": "You're safe today — keep it going!",
    "lb.streak.atRisk": "About {h} h left to keep your streak!",
    "lb.streak.lost": "Your streak reset — start again today!",
    "plb.title": "Leaderboard",
    "plb.seeFull": "See full leaderboard",
    "plb.rankThisMonth": "Rank this month",
    "plb.rankAllTime": "Rank all-time",
    "plb.points": "Points",
    "plb.pointsMonth": "Points this month",
    "plb.pointsAllTime": "Points all-time",
    "plb.pct": "Percent",
    "plb.pctMonth": "This month's percent",
    "plb.pctAllTime": "All-time percent",
    "plb.provisionalShort": "Provisional result",
    "plb.pts": "pts",
    "plb.streak": "Streak",
    "plb.currentStreak": "Current streak",
    "plb.bestStreak": "Best streak",
    "plb.best": "best",
    "plb.notRanked": "Not ranked yet — finish a test to get on the board!",
    "plb.notRankedShort": "Not ranked yet",
    "plb.improvementTitle": "Leaderboard & improvement",
    "plb.improvementSub": "How this child ranks and how their streak is progressing.",
    "plb.emptyTitle": "No leaderboard activity yet.",
    "plb.emptySub": "Once your child earns points, their rank and streak will show here.",
    "arena.quizPrev": "Back",
    "arena.quizConfirm": "Confirm",
    "arena.quizQuestion": "Question",
    "arena.quizOf": "/",
    "auth.tab.student": "Student",
    "auth.tab.parent": "Parent",
    "auth.brandTagline": "The olympiad-prep arena — one round a day.",

    // — Cross-cutting (theme + password visibility + nav) —
    "theme.toggle": "Theme",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "auth.showPassword": "Show password",
    "auth.hidePassword": "Hide password",

    // — Round3 D — auth placeholders + existence errors —
    "parent.auth.emailPh": "you@example.com",
    "parent.auth.passwordPh": "••••••••",
    "parent.auth.firstNamePh": "Your first name",
    "parent.auth.lastNamePh": "Your last name",
    "parent.err.emailExists":
      "This email is already registered. Log in or reset your password.",
    "parent.err.noAccount": "No account found for this email. Register first.",
    "parent.err.incompleteAccount":
      "Your account is not fully set up. Please try again in a moment; if it persists, contact support.",
    "parent.err.staffAccount":
      "This email belongs to an administration account. Please create a separate account for the parent panel.",
    "parent.err.wrongPassword": "Incorrect password. Please try again.",

    // — Round3 D — Add-child wizard (used by D2) —
    "addchild.step.info": "Details",
    "addchild.step.subjects": "Subjects",
    "addchild.step.plan": "Plan",
    "addchild.step.payment": "Payment",
    "addchild.step.done": "Done",
    "addchild.field.city": "City",
    "addchild.field.school": "School",
    "addchild.field.grade": "Grade",
    "addchild.field.selectCity": "Select a city",
    "addchild.field.selectSchool": "Select a school",
    "addchild.field.selectGrade": "Select a grade",
    "addchild.field.cityFirst": "Choose a city first",
    "addchild.field.privateSchools": "Private schools",
    "addchild.field.publicSchools": "Public schools",
    "addchild.err.cityRequired": "Select a city.",
    "addchild.err.schoolRequired": "Select a school.",
    "addchild.err.gradeRequired": "Select a grade.",
    "addchild.field.district": "District",
    "addchild.field.selectDistrict": "Select a district",
    "addchild.field.noDistricts": "No districts are set up for this city",
    "addchild.err.districtRequired": "Select a district.",
    "subj.math": "Mathematics",
    "subj.az_language": "Azerbaijani",
    "subj.english": "English",
    "subj.informatics": "Informatics",
    "subj.science": "Science",
    "subj.logic": "Logic",
    "addchild.next": "Next",
    "addchild.back": "Back",
    "addchild.createChild": "Create child",
    "addchild.summary": "Summary",

    // — Payment confirmation (Add-Child step 4 + the plan-change sheet) —
    "pay.title": "Payment",
    "pay.note":
      "Confirm the amount below — the subscription starts right away and your child's login ID is created.",
    "pay.payNow": "Pay now",
    // Migration 125 — the plan-change sheet leads to the bank, so its primary
    // button says so. `pay.payNow` stays for the add-child wizard only.
    "pay.continue": "Continue to payment",
    "pay.processing": "Processing…",
    "pay.success": "Payment successful",
    "pay.idRevealed": "Your child's 8-digit login ID has been created.",
    "pay.subtotal": "Subtotal",
    "pay.discount": "Discount",
    "pay.total": "Total",

    // — Pricing (placeholder figures) —
    "pricing.intro":
      "Simple per-subject pricing, per child. Add as many subjects as you like — the total is calculated automatically.",
    "pricing.subjectsNote":
      "Pricing is per subject, per child. You can choose Math, Science, Logic and English independently.",
    "pricing.perChild": "per child",
    "pricing.plan.weekly.name": "Weekly",
    "pricing.plan.weekly.price": "≈ {price} AZN",
    "pricing.plan.weekly.unit": "per week / subject",
    "pricing.plan.weekly.note": "Great for trying things out short-term.",
    "pricing.plan.weekly.save": "",
    "pricing.plan.monthly.name": "Monthly",
    "pricing.plan.monthly.price": "≈ {price} AZN",
    "pricing.plan.monthly.unit": "per month / subject",
    "pricing.plan.monthly.note": "Most popular — best for steady learning.",
    "pricing.plan.monthly.save": "Better value than weekly",
    "pricing.plan.yearly.name": "Yearly",
    "pricing.plan.yearly.price": "≈ {price} AZN",
    "pricing.plan.yearly.unit": "per year / subject",
    "pricing.plan.yearly.note": "Best value for the whole year.",
    "pricing.plan.yearly.save": "Better value than monthly",
    "pricing.trialLine": "Every new subject starts with a 7-day free trial — no charge until the trial ends.",
    "pricing.siblingTitle": "Automatic sibling discount",
    "pricing.siblingBody":
      "When you add more than one child, the discount is applied automatically: −10% for the 2nd child, −15% for the 3rd and beyond. No code required.",
    "pricing.disclaimer":
      "Note: the prices shown are placeholders and not final. Final pricing will be confirmed by the platform.",

    // — About (official multi-section) —
    "about.mission.title": "Our mission",
    "about.mission.body":
      "OlympIQ was created to help students in grades 1–11 across Azerbaijan build a strong academic foundation and prepare for olympiads with confidence. Our goal is to make high-quality, consistent, and measurable preparation accessible to every family.",
    "about.offer.title": "What the platform offers",
    "about.offer.body":
      "Parent-managed child accounts, per-subject subscriptions (Mathematics, Science, Logic, and English), one-time Olympiad Preparation packages with lifetime access, daily practice, and progress tracking — all in one place. The entire interface works in three languages: Azerbaijani, English, and Russian.",
    "about.audience.title": "Who it's for",
    "about.audience.body":
      "The platform is designed for students in grades 1–11 in Azerbaijan and their parents. The parent creates and manages the account, while the child simply logs in with an 8-digit ID and starts learning.",
    "about.trust.title": "Trust and transparency",
    "about.trust.body":
      "Questions are selected on the server by grade level, results are shown transparently, and payments are made only by the parent through a secure, verified method. Children's data is protected and never used for marketing.",

    // — FAQ (extended) —
    "faq.q6": "How does the 7-day free trial work?",
    "faq.a6":
      "Every new subject selected on the platform gives the student a 7-day free trial. You are not charged during the trial; once it ends, billing starts for the period you chose.",
    "faq.q7": "Is there a discount for 2 or more children from the same family?",
    "faq.a7":
      "Yes. The sibling discount is applied automatically: 10% for the 2nd child and 15% for the 3rd and subsequent children. No code is needed — the system calculates it automatically.",
    "faq.q8": "How do the tests work?",
    "faq.a8":
      "Questions are selected randomly on the server for each test (olympiad attempts consist of 25 questions). Students never choose the difficulty themselves — this keeps assessment fair and objective.",
    "faq.q9": "How is our data protected?",
    "faq.a9":
      "Personal data is stored securely and used only to operate the service. Child accounts are linked to the parent, and children never enter email or payment details. Platform data is never shared with third parties.",
    "faq.q10": "Which languages are supported? How can I get in touch?",
    "faq.a10":
      "The platform works in Azerbaijani (default), English, and Russian. For questions or support, you can reach us by email or WhatsApp — see the Contact page.",

    // — Contact (details) —
    "contact.address": "Address",
    "contact.addressValue": "Government House of Baku, Azerbaijan",
    "contact.emailLabel": "Support email",
    "contact.phoneLabel": "Phone",
    "contact.whatsappLabel": "WhatsApp",
    "maintenance.title": "We’ll be right back",
    "maintenance.body":
      "The site is briefly down for maintenance. Please check back in a little while.",
    "contact.mapsCaption": "Government House, Baku — our location on the map.",
    "contact.shortNote":
      "We usually reply during business days. Write to us with questions, suggestions, or technical support requests.",
    // The two labelled purposes on the redesigned contact card. contact.emailLabel
    // and contact.shortNote above are KEPT: the mobile contact screen still
    // renders both, and this redesign is web-only.
    "contact.generalTitle": "Questions & feedback",
    "contact.generalDesc":
      "Questions about the service or pricing, partnership requests, suggestions and feedback.",
    "contact.supportTitle": "Technical support",
    "contact.supportDesc":
      "Errors on the platform, sign-in problems, or trouble with a payment.",
    "contact.responseTime": "Your request will be answered within 24 hours.",

    // — Footer —
    "footer.tagline": "An olympiad preparation portal for grades 1–11",
    "footer.product": "Services",
    "footer.company": "Company",
    "footer.legal": "Legal",

    // ---- Privacy policy (privacy.*) — see the az block for the format rules ----
    "nav.privacy": "Privacy policy",
    "privacy.title": "Privacy Policy",
    "privacy.eyebrow": "Legal document",
    "privacy.lead":
      "This policy covers the OlympIQ website and the OlympIQ mobile app for iOS and Android.\n\n" +
      "OlympIQ is an education product for school students in grades 1–11. Because we handle children's data, we try to be short and honest.",
    "privacy.effective": "Effective date",
    "privacy.updated": "Last updated",
    "privacy.tbd": "to be confirmed",
    "privacy.toc": "Sections",
    "privacy.draft.title": "This document is still a draft",
    "privacy.draft.body":
      "The text was written from how the product actually works, but it has not yet been reviewed by a lawyer and no effective date has been set. A few details — contact addresses, retention periods, the region the servers are in, and the legal status of the data controller — are still being confirmed.",

    "privacy.s1.title": "The short version",
    "privacy.s1.doTitle": "What we do",
    "privacy.s1.do":
      "We collect only what an account needs to work: the parent's contact details, the child's name, school, grade, and their practice results.\n" +
      "A parent creates and controls the child's profile. A child can never register on their own.\n" +
      "A parent can delete the entire family account from inside the app at any time.",
    "privacy.s1.dontTitle": "What we never do",
    "privacy.s1.dont":
      "No advertising. There is no ad network and no ad SDK anywhere in the app.\n" +
      "No tracking. Neither the mobile app nor the website contains any third-party analytics, attribution or crash-reporting tool. We never read an advertising identifier (no IDFA, no Android Advertising ID).\n" +
      "We do not sell, rent or trade your data, and we never hand it to anyone for marketing.\n" +
      "We never ask for your location, camera, contacts or microphone.\n" +
      "We do not build advertising profiles from a child's behaviour.\n" +
      "We never see your card details. There is no checkout in the mobile app — purchases happen only on the website.",

    "privacy.s2.title": "Who we are and how to reach us",
    "privacy.s2.product": "Product",
    "privacy.s2.productValue":
      "OlympIQ — an olympiad and exam preparation platform for grades 1–11",
    "privacy.s2.operator": "Operated by",
    "privacy.s2.operatorValue":
      "Kamil Piriyev (Tax Identification Number / VÖEN: 6300091352) and his partners",
    "privacy.s2.address": "Legal address",
    "privacy.s2.addressValue": "Peshtatuk village, Lerik District, Republic of Azerbaijan",
    "privacy.s2.email": "Support email",
    "privacy.s2.phone": "Phone",
    "privacy.s2.website": "Website",
    "privacy.s2.requests": "Privacy and data requests",
    "privacy.s2.note":
      "For any question, complaint or deletion request about your data, write to the address above.",

    "privacy.s3.title": "The family account model",
    "privacy.s3.intro":
      "OlympIQ's account model is unusual, and it is built that way specifically for child safety.",
    "privacy.s3.points":
      "Only a parent can register, using an email address and a password.\n" +
      "A child can never register. There is no sign-up path for a child on the website or in the mobile app. This is a design decision and it is enforced on the server.\n" +
      "A parent creates the child's profile and enters every piece of information about the child themselves: first name, last name, city, district, school and grade.\n" +
      "A child has no email address. Internally, the child's login record uses a technical, non-deliverable address that never receives mail; the child never sees or uses it.\n" +
      "A child signs in with an 8-digit number issued by our server, plus a password the parent chose.\n" +
      "A child can never buy anything. This is enforced on the server, not merely hidden in the interface.\n" +
      "A child can never delete anything. The parent is the account holder for the whole family, and holds the deletion power.",
    "privacy.s3.result":
      "The result: the parent decides how much data about the child exists, and can remove all of it at any time.",

    "privacy.s4.title": "What we collect",
    "privacy.s4.parentTitle": "Parent account",
    "privacy.s4.parentTable":
      "Data | Required? | Why we collect it\n" +
      "Name (display name) | Yes | To identify the account and address you in the app\n" +
      "Email address | Yes | Your login credential; password reset; account notices\n" +
      "Phone number (international format) | Yes | Account contact and recovery. We do not send SMS — SMS is not implemented in the product at all\n" +
      "Password | Yes | To sign in. We do not store your password: it is held only by our authentication service in hashed form, which nobody can read back\n" +
      "Interface language (az / en / ru) | No | To show the app in your language\n" +
      "Profile picture (avatar) | No | Cosmetic only. This file goes to a publicly-readable storage area — see «Avatar photos»\n" +
      "Notification preferences | No | To remember which channels you want to hear from\n" +
      "News articles you liked | No | A record of the like you placed on an article",
    "privacy.s4.parentNote":
      "A parent can change their name, phone, password and avatar in the app. The email address cannot be changed in the app — contact us instead.",
    "privacy.s4.childTitle": "Child (student) profile — entered by the parent",
    "privacy.s4.childTable":
      "Data | Required? | Why we collect it\n" +
      "First name and last name | Yes | To address the child in the app; shown on leaderboards as «Firstname L.»\n" +
      "City and district (rayon) | Yes | For regional leaderboards\n" +
      "School name | Yes | For the school leaderboard\n" +
      "Grade | Yes | So the child is served questions that match their grade\n" +
      "8-digit login ID | Issued by our server | The child's login credential. The last 4 digits of this number are shown on the public leaderboard\n" +
      "Password | Yes (set by the parent) | To sign in. Held only by our authentication service, in hashed form\n" +
      "Avatar | No | Either a preset image or an uploaded photo. A photo is always kept in private storage — see «Avatar photos»\n" +
      "Colour and sticker choice | No | The child's chosen look\n" +
      "Learning data | Automatic | Questions answered, options selected, right and wrong answers, time spent per question, points, percentages, streaks, active days, leaderboard position, achievements\n" +
      "Which olympiad questions the child has already seen | Automatic | So the same question is not served twice\n" +
      "Notification preferences and liked news | No | Same purpose as on the parent account",
    "privacy.s4.childNoDob":
      "We do not collect a date of birth or a year of birth. We never ask a child's age — the grade is enough.",
    "privacy.s4.childEditable":
      "A child can change only the following about themselves: their own first and last name (which also changes the name shown on the leaderboard), their password, their avatar and their colour choice. School, city, district and grade are read-only to the child — only the parent can change them.",
    "privacy.s4.techTitle": "Technical and device data",
    "privacy.s4.techTable":
      "Data | When | Why\n" +
      "Push notification token, device model name, OS version and app version | Only if push notifications are switched on and you granted permission | To deliver a notification to the right device. No advertising identifier and no hardware identifier is ever read. The token is deleted from our server when you sign out\n" +
      "Child sign-in attempt log: the 8-digit number, a SHA-256 hash of the IP address, the outcome and the time | On every sign-in attempt | To stop password-guessing attacks. The raw IP address is never stored\n" +
      "Server logs — including IP address and browser user agent | On every request | Standard technical logs kept by our hosting providers, for security and troubleshooting\n" +
      "Sign-in records held by the authentication service | On every sign-in | Our authentication service keeps its own security log",
    "privacy.s4.logRetention": "Server log retention",
    "privacy.s4.deviceTitle": "Kept in your device's protected storage (mobile app)",
    "privacy.s4.deviceIntro":
      "The mobile app stores only the following in the device's own protected storage (iOS Keychain / Android Keystore):",
    "privacy.s4.deviceList":
      "your sign-in session;\n" +
      "whether the biometric app lock is on or off (literally just «1» or «0»);\n" +
      "whether the welcome screens have been shown;\n" +
      "a copy of the push token;\n" +
      "your chosen language and light or dark theme.",
    "privacy.s4.deviceNote":
      "The preferences in this list (the lock, the welcome screens, your language and theme) never leave the device at all. Your sign-in session is sent to our authentication service on every request — that is what it is for — and the push token is stored on our server while push is enabled (see the technical data table above). Nothing else is transmitted.",
    "privacy.s4.cookiesTitle": "Cookies — website",
    "privacy.s4.cookiesIntro": "The website uses strictly necessary cookies only:",
    "privacy.s4.cookiesList":
      "Session cookies — to keep you signed in while you are on the site.\n" +
      "A «locale» cookie — to remember your chosen interface language (1 year).\n" +
      "The light or dark theme choice is stored in your browser's own local storage.\n" +
      "A short-lived marker in your browser's session storage, so the same news article is not counted twice in its view count. It is cleared when the browser tab closes.",
    "privacy.s4.cookiesNote":
      "There are no advertising cookies, no analytics cookies and no tracking pixels.",

    "privacy.s5.title": "Children's data",
    "privacy.s5.callout":
      "This section is OlympIQ's children's privacy policy. Because our product is directed at minors, we set it out separately so a parent can see everything in one place.",
    "privacy.s5.storedTitle": "What is stored about a child",
    "privacy.s5.stored":
      "Everything in the «Child profile» table above: first name, last name, city, district, school, grade, the 8-digit login number, the chosen avatar and look, and practice results (answers, points, percentages, streaks, active days, leaderboard placement).",
    "privacy.s5.notCollected":
      "What we never collect about a child: date of birth, email address, phone number, home address, location, health data, financial data, contacts, browsing history, advertising identifiers or hardware identifiers.",
    "privacy.s5.neverTitle": "What we never do with a child's data",
    "privacy.s5.never":
      "We do not show advertising to a child and we do not build advertising profiles.\n" +
      "We do not track a child's behaviour across other apps or websites.\n" +
      "We do not sell, rent or share children's data for marketing.\n" +
      "We do not publish anything a child writes, with one exception: their own first and last name. A student can change these themselves, and it is that name which appears on leaderboards as «Firstname L.». There is no other free text a child can show to other users.\n" +
      "There is no chat, no messaging, no comments and no forum in the app. A child cannot communicate with another user.\n" +
      "We never encourage a child to buy anything. No price, no payment option and no purchase button is displayed in a student session.",
    "privacy.s5.lbTitle": "What appears on leaderboards, and to whom",
    "privacy.s5.lbIntro":
      "This is one of the most important things for a parent to understand. There are two different leaderboards.",
    "privacy.s5.lb1Title": "1) The in-app leaderboard — visible to signed-in users only",
    "privacy.s5.lb1Intro":
      "Any signed-in parent and any signed-in student sees the following about every ranked child:",
    "privacy.s5.lb1Table":
      "Shown | Example\n" +
      "First name and the initial of the surname | Aysel M.\n" +
      "City | Baku\n" +
      "District (rayon) | Nasimi\n" +
      "School name | School No. 142\n" +
      "Grade | 7\n" +
      "Performance figures | percentage, questions answered, correct answers, number of attempts",
    "privacy.s5.lb1Note":
      "The child's full surname, avatar, 8-digit number and the parent's contact details are not shown.",
    "privacy.s5.lb2Title":
      "2) The public top-10 on the website's home page — visible to anyone, with no account",
    "privacy.s5.lb2Body":
      "Here the child's name is not shown; instead a pseudonym such as «Şagird 4821» is displayed. Those four digits are the last four digits of the child's 8-digit login number. Alongside the pseudonym, this public table also shows the city, district, school name and grade.",
    "privacy.s5.lbWarn":
      "An honest warning for parents: in a small district school, the combination of school, grade and district may be enough to recognise a child even without a name. We are not hiding this.",
    "privacy.s5.lbNoMedals":
      "Leaderboards carry no medals, no prizes and no money — only numeric ranks.",
    "privacy.s5.avatarTitle": "Avatar photos — an important difference",
    "privacy.s5.avatarTable":
      "Which path | Where the file is stored | Who can see it\n" +
      "A parent uploads a photo for a child (Add child / Edit child) | Private storage area | Only family members, through a short-lived signed link\n" +
      "A student uploads a photo from their own profile | Private storage area | Only family members, through a short-lived signed link\n" +
      "A parent uploads their own avatar | Public storage area | Anyone who has the file's direct link",
    "privacy.s5.avatarWarn":
      "A child's photo never goes to a publicly-readable storage area: whether a parent uploaded it or the student uploaded it themselves, the file is written to the private area and opens only through a short-lived signed link issued to family members. The public storage area applies to one thing only — a parent's own avatar, which anyone holding the file's direct link can open. Preset avatars are the default and no photo is ever required — if you do not want your child's photo uploaded, use a preset avatar.",
    "privacy.s5.avatarUnlink":
      "Removing an avatar behaves differently depending on the path. A child's photo — uploaded by a parent or by the student themselves — is erased from the private storage area when it is replaced or removed. A parent's own avatar is only unlinked: the picture stops appearing on the profile, but the file remains in the public storage area.",
    "privacy.s5.removeTitle": "How a parent removes a child's data",
    "privacy.s5.removeList":
      "Delete the whole family account: parent profile → «Danger Zone» → «Delete account» → a two-step confirmation. This deletes the parent account and every child profile the parent created. Available both on the website and in the mobile app.\n" +
      "Delete a single child: currently on the website only, from the parent dashboard. The mobile app has no delete-a-child option.\n" +
      "A student can delete nothing.",
    "privacy.s5.removeNote":
      "Deletion is immediate — there is no waiting period, no undo and no archive state. What is erased and what survives is set out in detail in «Retention and deletion».",

    "privacy.s6.title": "How we use the data",
    "privacy.s6.useTitle": "We use it to",
    "privacy.s6.use":
      "Create the account, sign you in and keep the account secure.\n" +
      "Select questions that match the child's grade and the current school term.\n" +
      "Score answers and calculate points, percentages, streaks and progress statistics.\n" +
      "Show the parent a report of the child's progress.\n" +
      "Build the leaderboards.\n" +
      "Send notifications (a new round, a result, a streak, news, account notices).\n" +
      "Prevent abuse, automated attacks and password-guessing.\n" +
      "Provide support and answer your requests.\n" +
      "Determine which subjects and olympiad packages the family has access to.\n" +
      "Meet our legal obligations where the law requires it.",
    "privacy.s6.notTitle": "We do not use it to",
    "privacy.s6.not":
      "Show advertising or build advertising profiles.\n" +
      "Track you or your child across other apps and websites.\n" +
      "Sell, rent or hand data to advertising brokers.\n" +
      "Make credit, insurance, employment or similar decisions.\n" +
      "Make automated decisions about a child with legal effect.\n" +
      "Train third-party advertising or profiling systems.",

    "privacy.s7.title": "Who we share data with",
    "privacy.s7.staffTitle": "Access inside OlympIQ",
    "privacy.s7.staff":
      "To be straightforward about this: authorised OlympIQ administrators and content managers can access account and learning data through an internal admin panel, in order to run the service, manage content and answer support requests. Access is limited by role: the database enforces row-level security and each internal role holds only the permissions its job requires. Administrator actions on accounts and content are written to an audit log.",
    "privacy.s7.intro":
      "We do not sell your data. The following service providers are needed to run the service, and each one receives only what its function requires:",
    "privacy.s7.table":
      "Service provider | Role | What it receives | Status\n" +
      "Supabase | Database, authentication, file storage | All product data, over an encrypted connection | Active\n" +
      "Vercel | Website hosting | Standard server request logs (IP, user agent) | Active\n" +
      "Expo / EAS | Mobile app updates and push notification relay | An update check at launch: the app version, the platform, an anonymous per-installation identifier and your IP address; the push token when push is enabled | Update check active\n" +
      "Apple (APNs) | iOS push delivery | Only once push is on — standard push transport | Receives nothing until push is enabled\n" +
      "Google (FCM) | Android push delivery | Only once push is on — standard push transport | Receives nothing until push is enabled\n" +
      "Google Fonts | A font on some website pages | Your browser's IP address and user agent | Active (website only; not in the mobile app)\n" +
      "Google Maps | The map on the «Contact» screen | Your IP address and user agent at the moment that screen is opened. No account data is passed | Active\n" +
      "Payment provider | Future web payments | — | See the «Payments» section",
    "privacy.s7.pushOff":
      "Push notifications are not operational today: the feature is switched off server-side, so no device token is ever created and Expo, Apple and Google receive nothing at all for it.",
    "privacy.s7.pushOn":
      "Push notifications are live: a token is created for the devices you allowed, and notifications are delivered through Expo over the Apple and Google networks.",
    "privacy.s7.otherIntro": "Beyond this, we may share data only:",
    "privacy.s7.other":
      "where the law requires it (a court order, a lawful request from a competent authority);\n" +
      "to prevent an urgent threat to life or health;\n" +
      "to defend our rights and investigate abuse.",
    "privacy.s7.regionLabel": "Where the servers are located",

    "privacy.s8.title": "Payments",
    "privacy.s8.list":
      "A purchase can never be completed in the mobile app: there is no card form, no card entry and no payment step in the app at all.\n" +
      "Payments happen only on the website, in a browser, in Azerbaijani manat.\n" +
      "Payment will use a full redirect to the bank's own hosted page. Card numbers, CVV codes and other card details will never reach OlympIQ servers and will never be stored by us.\n" +
      "Our database will record only the amount, the currency, the status and the provider's transaction reference.",
    "privacy.s8.statusOff":
      "Current status: payments are switched off on the platform and no payment provider has been integrated yet. While payments are off, no price is displayed anywhere in the mobile app.",
    "privacy.s8.statusOn":
      "Current status: payments are live and happen only on the website, through the bank's own hosted payment page. The mobile app may show subscription prices for information to a parent or a signed-out visitor; a student session never shows a price, and no purchase can be completed inside the app.",

    "privacy.s9.title": "Retention and deletion",
    "privacy.s9.activeTitle": "While the account is open",
    "privacy.s9.activeBody":
      "Account details and practice results are kept for as long as the account exists — because they are the product: progress charts, streaks and ranking are all built on them.",
    "privacy.s9.notifRetention":
      "Read notifications are deleted automatically — currently after 180 days — and each user's inbox is currently capped at 500 items. Both figures are platform settings and can be changed.",
    "privacy.s9.otherRetention":
      "Retention for learning data, audit entries and sign-in attempt logs",
    "privacy.s9.howTitle": "How to delete the account",
    "privacy.s9.howBody":
      "In the mobile app or on the website: sign in as a parent, tap the avatar at the top, open «Profile», scroll to «Danger Zone» and choose «Delete account». A two-step confirmation is required.",
    "privacy.s9.howNote":
      "This runs immediately and cannot be undone. In the rare case that a technical fault interrupts it, write to the address above and we will complete the deletion manually.",
    "privacy.s9.erasedTitle": "What is erased",
    "privacy.s9.erasedIntro":
      "When a parent account is deleted, all of the following go with it:",
    "privacy.s9.erased":
      "the parent profile and login record;\n" +
      "every child profile the parent created and their login records;\n" +
      "the 8-digit numbers and their allocation records;\n" +
      "all attempts, answers, points, percentages, streaks, active days and achievements;\n" +
      "leaderboard entries and the record of olympiad questions already seen;\n" +
      "subscriptions, access entitlements, discount and coupon records;\n" +
      "notifications, notification preferences and push tokens;\n" +
      "the record of news articles that were liked.",
    "privacy.s9.survivesTitle": "What survives deletion",
    "privacy.s9.survivesIntro":
      "The following are kept on purpose, or remain for technical reasons:",
    "privacy.s9.survivesTable":
      "What survives | Why | Does personal data remain?\n" +
      "Payment and purchase records | Accounting and tax obligations | Anonymised: the link to the person is removed, only amount, currency, status and date remain\n" +
      "Audit entries for account actions (registration, creating a child profile, password resets, subscription and purchase events, and the deletion itself) | Security log | The link to the person is removed. These entries store no name, no IP address and no browser user agent\n" +
      "Frozen leaderboard archives (season and monthly finals) | A historical record of past results | A season archive may retain the «Firstname L.» label and an internal identifier\n" +
      "Uploaded avatar files and their metadata | Technical reason | Yes — deleting the account removes the database records but not the files themselves, in both the public and the private storage areas\n" +
      "The child sign-in attempt log (8-digit number, hashed IP, timestamp) | Security | Yes, it is retained\n" +
      "Raw payment notifications received from the bank (only once a payment provider is connected — none is today) | Financial reconciliation | Stored as the bank sends them, keyed by the provider's transaction reference. They may contain whatever the bank includes, such as a payer name or a masked card number",
    "privacy.s9.backupNote":
      "Backups are kept for disaster recovery, and deleted data may remain in them for a period.",
    "privacy.s9.backupLabel": "Backup retention",
    "privacy.s9.copyTitle": "Getting a copy of your data",
    "privacy.s9.copyBody":
      "There is no «download my data» button in the app today. If you want a copy of your family's data, write to the email address above and we will respond to your request.",

    "privacy.s10.title": "Security",
    "privacy.s10.intro": "The following are genuinely in place:",
    "privacy.s10.list":
      "All traffic is encrypted (HTTPS/TLS). The website enforces HSTS; the iOS app forbids unencrypted connections entirely.\n" +
      "We do not store passwords. Both parent and child passwords are held only by our authentication service, in hashed form. Our database has no password column.\n" +
      "Row-level security is enabled across the database: a student can read only their own record, and a parent only the records of their own children.\n" +
      "The mobile app holds no privileged key. Privileged operations run only on the server.\n" +
      "Session tokens live in the device's own protected storage (iOS Keychain / Android Keystore) — never in an ordinary file or plain storage.\n" +
      "Child sign-in lockout: after 8 failed attempts within 15 minutes, that number is temporarily locked. The IP address is recorded as a hash, never in raw form.\n" +
      "Parent sign-in, registration and password-reset pages are rate limited.\n" +
      "Uploaded images are validated from the file's actual bytes, not from its name. Permitted formats: PNG, JPEG and WebP; GIF is additionally accepted for a parent's own avatar, but never for a child's photo, whoever uploads it. Maximum size 2 MB. SVG is banned entirely.\n" +
      "Biometric app lock: your device returns only a «verified» or «not verified» answer to us. Biometric data never leaves your device and is never transmitted to us — we store only whether the lock is on or off.\n" +
      "Administrator actions are written to an audit log.",
    "privacy.s10.caveat":
      "That said, we should be honest: no system on the internet is 100% secure. We take reasonable technical and organisational measures, but we cannot guarantee absolute security. Never share your password with anyone.",

    "privacy.s11.title": "Your rights and how to exercise them",
    "privacy.s11.table":
      "What you want to do | How\n" +
      "Change the parent name, phone, password or avatar | In the app: profile page\n" +
      "Change the parent email address | Not possible in the app — write to us\n" +
      "Change a child's name, city, district, school or grade | In the app: parent, then «Edit child»\n" +
      "Reset a child's password | In the app: parent, then «Edit child»\n" +
      "Change or remove a child's avatar | In the app: parent or student profile\n" +
      "Turn notifications off | Notification preferences in the app, and your device's system settings\n" +
      "Delete one child | On the website: parent dashboard\n" +
      "Delete the whole family account | In the app and on the website: profile, then «Danger Zone»\n" +
      "Get a copy of your data | Write to us\n" +
      "Complain or ask a question | Write to us",
    "privacy.s11.note":
      "Depending on where you live, you may have additional legal rights.",

    "privacy.s12.title": "Device permissions",
    "privacy.s12.table":
      "Permission | When it is asked for | What it is for\n" +
      "Photo library | Only when you tap «change avatar» | To choose a profile picture. Preset avatars are the default — uploading a photo is never required\n" +
      "Notifications | Only after signing in, and only when the feature is enabled | For new rounds, results, streaks and account notices. Never for advertising. If you decline, you are never asked again\n" +
      "Fingerprint / Face ID | Only when you turn on the optional app lock yourself | To open the app without typing a password. Turning the lock both on and off requires a successful check",
    "privacy.s12.never":
      "We never ask you for: camera, location, contacts, microphone, calendar, health, Bluetooth, or tracking permission (App Tracking Transparency). The app never opens the camera and has no way to take a photo at all. An honest note for Android: the photo-picker component we use declares camera and storage permissions in its own manifest, so you may see them listed in the phone's App info screen — the app never uses them and never shows you a camera prompt.",

    "privacy.s13.title": "Changes to this policy",
    "privacy.s13.body":
      "We may update this policy. When we do, we will change the «Last updated» date above. If the change is significant, we will tell you in the app or by email. Continuing to use the service after a change takes effect means you accept the updated policy.",
    "privacy.s13.contact": "Questions",

    "privacy.consentPre": "By creating an account you confirm that you have read our",
    "privacy.consentLink": "Privacy Policy",
    "privacy.consentPost": ".",
    "privacy.profileHint":
      "Read what we collect, who can see what, and exactly what happens when you delete the account.",

    // — Round3 E — Profile, info carousel, news panel, profile nav —
    "nav.profile": "Profile",
    "profile.title": "Profile",
    "profile.account": "Account",
    "profile.logout": "Log out",
    "profile.deleteAccount": "Delete account",
    "profile.changePassword": "Change password",
    "profile.currentPassword": "Current password",
    "profile.newPassword": "New password",
    "profile.save": "Save",
    "profile.saving": "Saving…",
    "profile.editName": "Edit",
    "profile.fullName": "Full name",
    "profile.firstNameLabel": "First name",
    "profile.lastNameLabel": "Last name",
    "profile.err.nameRequired": "Name cannot be empty.",
    "profile.saved": "Saved ✓",
    "profile.cancel": "Cancel",
    "profile.passwordChanged": "Password updated ✓",
    "profile.avatar": "Profile photo",
    "profile.uploadAvatar": "Upload photo",
    "profile.changeAvatar": "Change photo",
    "profile.removeAvatar": "Remove photo",
    "profile.avatarHint": "JPG or PNG, up to 2 MB.",
    "profile.noAvatar": "No photo",
    "profile.err.passwordShort": "The new password must be at least 8 characters.",
    "profile.err.passwordEqualsId": "The password cannot be the same as the ID.",
    "profile.err.fileType": "Please upload a JPG or PNG image only.",
    "profile.err.fileTooLarge": "The file must not exceed 2 MB.",
    "profile.err.uploadFailed": "Could not upload the photo. Please try again.",
    "profile.err.updateFailed": "Update failed. Please try again.",

    // — Round3 E — Information carousel (parent onboarding) —
    "carousel.title": "How to get started",
    "carousel.i1.title": "Add your child",
    "carousel.i1.body":
      "From your dashboard, choose “Add child” and enter your child's name, city, school, and grade. A separate account is created for each child.",
    "carousel.i2.title": "Choose subjects & start the trial",
    "carousel.i2.body":
      "Pick the subjects you need from Math, Science, Logic, and English. Every new subject starts with a 7-day free trial — no charge until the trial ends.",
    "carousel.i3.title": "Your child logs in with an 8-digit ID",
    "carousel.i3.body":
      "Once you choose a plan, the system issues a unique 8-digit login ID. Your child signs in with that ID and the password you set — no email needed.",
    "carousel.i4.title": "Track progress",
    "carousel.i4.body":
      "Follow each child's results, accuracy, and subject strength right from your dashboard. You can add or remove subjects at any time.",
    "carousel.i5.title": "Olympiad preparation & support",
    "carousel.i5.body":
      "Buy an olympiad package once and your child keeps lifetime access. Have a question? Reach us from the Contact page.",

    // — Round3 E — News panel (latest news widget) —
    "news.latest": "Latest news",
    "news.viewAll": "View all",
    "news.none": "No news yet.",
    "news.published": "Published",
    "news.readMore": "Read more",
    "news.unavailable": "News is currently unavailable.",

    // — Round4 — Landing stats (labels only; numbers are illustrative) —
    "stats.title": "OlympIQ in numbers",
    "stats.tests": "Question bank",
    "stats.olympiads": "Olympiad packages",
    "stats.students": "Active students",
    "stats.successRate": "Success rate",

    // — Round4 — About Us (hero + vision + 4 values) —
    "about.hero.title": "A clear path to the olympiad",
    "about.hero.body":
      "OlympIQ is an AI-powered education platform that prepares students in grades 1–11 for olympiads. It analyses each student's results and builds personalised reports and improvement recommendations matched to their knowledge level. With daily practice, olympiad-format tests and detailed analytics, both the student and the parent can clearly track progress.",
    "about.vision.title": "Our vision",
    "about.vision.body":
      "Our vision is to make olympiad preparation accessible to every family in Azerbaijan. By delivering AI-personalised learning, detailed reports and modern study methods for the price of a cup of coffee, we aim to contribute to the future of thousands of students.",
    "about.values.title": "What sets us apart",
    "about.value1.title": "Trilingual learning",
    "about.value1.body":
      "The entire interface works in Azerbaijani, English and Russian — every student can learn in the language they find comfortable.",
    "about.value2.title": "Parent-controlled safety",
    "about.value2.body":
      "Accounts are created and managed by the parent. Children never enter an email or payment details. Everything stays under the parent's control.",
    "about.value3.title": "Olympiad preparation",
    "about.value3.body":
      "Dedicated packages with unlimited access and 25-question attempts selected on the server create a real olympiad experience.",
    "about.value4.title": "Measurable progress",
    "about.value4.body":
      "Results, accuracy and per-subject potential are shown transparently — you see where you stand at every step.",

    // — Round4 — News browse (sort + pager + views) —
    "news.sort.latest": "Newest",
    "news.sort.oldest": "Oldest",
    "news.sort.mostViewed": "Most viewed",
    "news.sort.mostLiked": "Most liked",
    "news.like": "Like",
    "news.liked": "Liked",
    "news.likes": "likes",
    "news.page.prev": "Previous",
    "news.page.next": "Next",
    "news.page.indicator": "Page {current} of {total}",
    "news.views": "views",
    "news.empty2": "No news in this view yet.",

    // — Round4 — Language dropdown —
    "lang.select": "Select language",

    // — Round4 PARENT — nav / drawer / analytics / subscription / help —
    "nav.analytics": "Analytics",
    "nav.subscription": "Subscription",
    "nav.help": "Help",
    "drawer.title": "Account",
    "drawer.account": "Account",
    "drawer.language": "Language",
    "drawer.theme": "Appearance",
    "drawer.close": "Close",
    "drawer.profileBtn": "My profile",
    "drawer.logout": "Log out",
    "analytics.title": "Analytics",
    "analytics.subtitle": "An overview of your children's progress.",
    "analytics.totalChildren": "Children",
    "analytics.activeSubs": "Active subscriptions",
    "analytics.attempts": "Attempts",
    "analytics.avgScore": "Average score",
    "analytics.none": "No data yet.",
    "subscription.title": "Subscription",
    "subscription.subtitle": "Manage your children's subjects and subscriptions.",
    "help.faqTitle": "Frequently asked questions",
    "help.contactTitle": "Contact",

    // — Round4 Phase4 — subscription cards + cancel modal + arena controls —
    "subscription.child": "Child",
    "subscription.status.trialing": "Trial",
    "subscription.status.active": "Active",
    "subscription.status.past_due": "Payment due",
    "subscription.status.canceled": "Canceled",
    "subscription.status.expired": "Expired",
    "subscription.status.none": "No subscription",
    "subscription.subjects": "Subjects",
    "subscription.interval": "Billing",
    "subscription.manageSubjects": "Manage subjects",
    "subscription.startPlan": "Start a plan",
    "subscription.cancelBtn": "Cancel subscription",
    "cancel.title": "Cancel your subscription?",
    "cancel.intro": "Before you go, take a moment. Let us know why you're canceling.",
    "cancel.reasonLabel": "Reason for canceling",
    "cancel.reason.price": "The price isn't right for me",
    "cancel.reason.notUsing": "We're not using it enough",
    "cancel.reason.features": "It's missing features I need",
    "cancel.reason.temporary": "Just taking a break",
    "cancel.reason.other": "Another reason",
    "cancel.benefitsTitle": "If you cancel, you'll lose:",
    "cancel.benefit1": "Access to this subject's practice and daily tasks",
    "cancel.benefit2": "Your child's progress tracking and results",
    "cancel.benefit3": "Your current trial period and earned discount",
    "cancel.confirm": "Yes, cancel",
    "cancel.keep": "Keep subscription",
    "cancel.done": "Subscription canceled.",
    "cancel.err": "Couldn't cancel the subscription. Please try again.",
    // ---- TEST ENGINE (T1/T2) — timed topic tests (child arena) ----
    "arena.nav.test": "Test",
    "test.home.eyebrow": "Test center",
    "test.home.title": "Practice tests",
    "test.home.sub": "Pick a subject, choose your topics and start a 25-minute test.",
    "test.home.subjects": "Subjects",
    "test.home.continueTitle": "You have a test in progress",
    "test.home.continueSub": "The clock is still running — pick up where you left off.",
    "test.home.continueCta": "Continue",
    "test.home.recent": "Recent tests",
    "test.home.noAttempts": "You haven't taken a test yet — start your first one now!",
    "test.home.noticeClosed": "That test is already closed — it was canceled or ran out of time.",
    "test.status.in_progress": "In progress",
    "test.status.canceled": "Canceled",
    "test.status.expired": "Time ran out",
    "test.err.noAccess": "You don't have access to this subject — ask your parent about a subscription.",
    "test.err.noQuestions": "There are no questions for this selection yet — coming soon.",
    "test.err.generic": "Something went wrong. Please try again in a moment.",
    "test.setup.eyebrow": "Test setup",
    "test.setup.topicsTitle": "Topics",
    "test.setup.pickHint": "Choose a topic and a subtopic for this test.",
    "test.setup.topic": "Topic",
    "test.setup.subtopic": "Subtopic",
    "test.setup.topicPh": "Select a topic…",
    "test.setup.subtopicPh": "Select a subtopic…",
    "test.setup.noSubtopics": "This topic has no subtopics — you can start with the topic alone.",
    "test.setup.selectWarn": "Please select a topic and subtopic before starting the test.",
    "test.setup.noTopics": "No topics are listed for this subject yet — topics must be added before a test can start.",
    "test.setup.rulesTitle": "Rules",
    "test.setup.qCount": "25 questions",
    "test.setup.duration": "25 minutes",
    "test.setup.rule1": "The timer starts as soon as you begin and can't be paused.",
    "test.setup.rule2": "Leaving the page doesn't stop the clock — you can come back and continue.",
    "test.setup.rule3": "Your answers are saved automatically.",
    "test.setup.rule4": "If you cancel the test, nothing is counted.",
    "test.setup.scoringTitle": "Scoring",
    "test.setup.scoring": "Each correct answer is worth 1 point. Wrong answers don't take points away.",
    "test.setup.consent": "I've read and understood the rules",
    "test.setup.start": "Start test",
    "test.setup.starting": "Starting…",
    "test.run.title": "Test",
    "test.run.olympiad": "Olympiad",
    "test.run.leaveTitle": "Are you sure you want to leave the test?",
    "test.run.leaveMsg": "Your current progress may be affected.",
    "test.run.leaveStay": "Continue Test",
    "test.run.leaveConfirm": "Leave Test",
    "test.run.noLimit": "No time limit",
    "test.run.daily": "Round of the day",
    "test.run.ratedBadge": "Counts for the rating",
    "test.run.practiceBadge": "Practice",
    "test.home.sub2": "One rated round per subject every day — 25 questions, no time limit. You can also practise any topic freely.",
    "test.rounds.today": "Today's rounds",
    "test.rounds.yesterday": "Yesterday's rounds",
    "test.rounds.recent": "Recent rounds",
    "test.rounds.start": "Start",
    "test.rounds.attempted": "Attempted today",
    "test.rounds.timedBadge": "25 questions · no time limit",
    "test.rounds.rated": "Counts for the rating",
    "test.rounds.replay": "Replay",
    "test.rounds.practiceNote": "These tests are for revision only — the results never affect the leaderboard.",
    "test.rounds.noYesterday": "No round was held yesterday.",
    "test.rounds.noRoundYet": "This round isn't ready yet — check back a little later.",
    "test.rounds.doneAlert": "You have already completed today's round.",
    "test.rounds.alreadyNote": "You've already taken today's round in this subject — come back tomorrow!",
    "test.rounds.noGrade": "Your profile has no grade yet — ask your parent to add your grade.",
    "test.rounds.practiceCta": "Practise",
    "test.rounds.practiceMeta": "no time limit, no points",
    "test.rounds.ratedChip": "Rated",
    "test.rounds.usedToday": "You have already used today's exam attempt. A new exam unlocks tomorrow.",
    "test.rounds.rulesTitle": "Exam rules",
    "test.rounds.rulesRated": "This is the daily rated exam — the result affects your points, percentage and streak.",
    "test.rounds.rulesOnce": "You can take only one exam per subject each day.",
    "test.rounds.rulesNoLimit": "There is no time limit — take your time and answer every question carefully.",
    "test.rounds.rulesSaved": "Your answers are saved automatically.",
    "test.img.alt": "Question image",
    "test.img.hint": "Click to zoom",
    "test.img.close": "Close",
    "test.setup.noLimit": "No time limit",
    "test.setup.noPoints": "No rating points",
    "test.setup.rulePractice1": "This is a practice test — the result doesn't affect the rating.",
    "test.setup.rulePractice2": "There's no clock — think as long as you like, take a break and come back.",
    "test.setup.practiceScoring": "Each correct answer is 1 point. You see your result right away, but no rating points are awarded.",
    "lb.colDistrict": "District",
    "lb.scope.district": "District",
    "lb.colNo": "Rank",
    "plb.board.empty": "No results for this filter yet.",
    "plb.pos.title": "Your children's positions",
    "plb.pos.notInFilter": "Not participating in the ranking under this filter",
    "plb.pos.noChildren": "You haven't added a child yet. Add a child and follow their ranking position here.",
    "pub.lb.title": "Overall Leaderboard",
    "pub.lb.sub": "The top-performing students on the platform",
    "pub.lb.empty": "No leaderboard data is available right now.",
    "lb.myRank.notInFilter": "You're not on the board under this filter.",
    "test.run.timeLeft": "Time left",
    "test.run.resumed": "You're continuing where you left off.",
    "test.run.palette": "Questions",
    "test.run.answered": "Answered",
    "test.run.flagged": "Saved",
    "test.run.unanswered": "Unanswered",
    "test.run.current": "Current question",
    "test.run.subject": "Subject",
    "test.run.topic": "Topic",
    "test.run.flag": "Save",
    "test.run.unflag": "Unsave",
    "test.run.next": "Next",
    "test.run.submit": "Finish test",
    "test.run.submitting": "Submitting…",
    "test.run.cancel": "Cancel",
    "test.run.canceling": "Canceling…",
    "test.run.saving": "Saving…",
    "test.run.saved": "Saved",
    "test.run.saveError": "Couldn't save your answers — check your internet connection.",
    "test.run.submitTitle": "Finish the test?",
    "test.run.submitMsg": "Unanswered questions: {n}. You can't change your answers after finishing.",
    "test.run.submitConfirm": "Yes, finish",
    "test.run.back": "Go back",
    "test.run.cancelTitle": "Cancel the test?",
    "test.run.cancelMsg": "If you cancel, nothing will be counted — no score, no result.",
    "test.run.cancelConfirm": "Yes, cancel",
    "test.run.keepGoing": "Keep going",
    "test.run.timeUp": "Time's up — submitting your test…",
    "test.result.eyebrow": "Result",
    "test.result.title": "Your test result",
    "test.result.olympiadTitle": "Your olympiad result",
    "test.result.backToOlympiads": "Back to olympiads",
    "test.result.topics": "Results by topic",
    "test.result.noTopics": "No topic breakdown available.",
    "test.result.timeSpent": "Time spent",
    "test.result.minutes": "min",
    "test.result.review": "Review answers",
    "test.result.newTest": "New test",
    "test.review.title": "Answer review",
    "test.review.correct": "Correct",
    "test.review.wrong": "Wrong",
    "test.review.skipped": "Skipped",
    "test.review.your": "Your choice",
    "test.review.correctAnswer": "Correct answer",
    "test.review.explanation": "Explanation",
    "test.review.explAzOnly": "Azerbaijani only",
    "test.review.explAzNote":
      "This explanation has not been translated yet, so the original Azerbaijani text is shown.",
    "test.review.backToResult": "Back to result",
    "test.review.filterAll": "All",
    "test.review.filterCorrect": "Correct",
    "test.review.filterWrong": "Wrong",
    "test.review.filterSkipped": "Skipped",
    // Report a problem (migration 115) — shown on the runner and the review
    // screen; the same dictionary feeds the mobile sheet.
    "test.report.action": "Report a problem",
    "test.report.title": "Report a problem with this question",
    "test.report.intro":
      "What is wrong with this question? A short note is enough — for example the answer key looks wrong, there is a typo, or the image does not load.",
    "test.report.label": "Describe the problem",
    "test.report.placeholder": "For example: the correct answer should be B.",
    "test.report.remaining": "{n} characters left",
    "test.report.cancel": "Cancel",
    "test.report.submit": "Send",
    "test.report.sending": "Sending…",
    "test.report.emptyErr": "Please describe the problem first.",
    "test.report.successTitle": "Report sent",
    "test.report.successBody": "Thanks! We will check this question.",
    "test.report.done": "Close",
    "test.report.err.generic":
      "The report could not be sent. Please try again in a moment.",
    "test.report.err.duplicate":
      "You have already reported this question; it is being reviewed.",
    "test.report.err.tooMany":
      "You have sent a lot of reports. Please try again a little later.",
    // Child profile — read-only school details
    "prof2.schoolInfo": "School details",
    "prof2.schoolInfoHint": "Only your parent can change these details.",
    "prof2.grade": "Grade",
    "prof2.city": "City",
    "prof2.school": "School",
    // Parent edits a child's info
    "parent.dash.editInfo": "Edit info",
    "childedit.title": "Edit child info",
    "childedit.intro": "Update your child's name, grade, city and school. The login ID never changes.",
    "childedit.save": "Save",
    "childedit.saving": "Saving…",
    "childedit.saved": "Child information updated successfully.",
    "childedit.back": "Back",
    "childedit.internalId": "Internal ID",
    "childedit.idNote": "The login ID and internal identifiers cannot be changed.",
    "childedit.err.generic": "Couldn't save the changes. Please try again.",
    "childedit.err.notYourChild": "This child doesn't belong to your account.",
    // ---- Payment result (payres.*) — see the az block for why it is bare.
    "payres.title": "Payment result",
    "payres.ok": "Payment confirmed.",
    "payres.pending": "This payment has not been confirmed yet. Please check again shortly.",
    "payres.failed": "The payment did not go through.",
    "payres.close": "You can close this window.",
    "payres.redirect": "You are being redirected to the payment page.",
    "payres.continue": "Continue",
    // ---- Parent checkout (checkout.*) — the WEB purchase flow -------------
    // WEB ONLY. These strings name a price, a payment step and a bank page, all
    // of which are correct in a browser and forbidden in a store binary
    // (docs/STORE_PAYMENTS_COMPLIANCE.md section 5). The mobile catalog is
    // GENERATED from this file, so these keys will exist there — no mobile
    // screen may reference one. The amount itself is never in the catalog: it
    // is rendered from the server's own number, so no locale can drift from it.
    "checkout.title": "Complete your payment",
    "checkout.intro":
      "You will finish this payment on your bank's secure page. Card details are entered there only and never reach our servers.",
    "checkout.amount": "Amount due",
    "checkout.payNow": "Continue to payment",
    "checkout.starting": "Preparing…",
    "checkout.redirectNote":
      "You are about to be taken to the bank's payment page. You will be brought back here once the payment is finished.",
    "checkout.continue": "Go to the bank's page",
    "checkout.err.notFound": "We could not find this payment. Refresh the page and try again.",
    "checkout.err.alreadyPaid": "This payment has already been completed.",
    "checkout.err.unavailable":
      "Payment is not available right now. Please try again shortly.",
    "checkout.resume": "Complete this payment",
    "checkout.err.priceChanged":
      "The price has changed. Please review your selection — we will show you the new amount.",
    "checkout.err.expired":
      "This payment has expired. Choose the subjects again to continue.",
    "checkout.err.retryFromEditor":
      "The payment did not go through. Save the change again — your plan may have moved in the meantime, so we will re-calculate the amount.",
    "checkout.err.planChanged":
      "The plan was changed somewhere else. Refresh the page and try again.",
    "checkout.err.tooMany": "Too many attempts. Please check again in a few minutes.",
    // The result screen says what actually happened. Since migration 125 a
    // confirmed payment IS what creates the plan, so "ok" may say so — and it
    // is only ever shown when the redemption actually applied. A payment we
    // took but could not turn into a plan lands on "pending", which is what it
    // is from the payer's side: taken, not finished, and in front of a human.
    "checkout.res.ok.title": "Payment confirmed",
    "checkout.res.ok.body":
      "Your payment is confirmed and what you bought is now active. You can see it in the parent panel.",
    "checkout.res.pending.title": "Payment not confirmed yet",
    "checkout.res.pending.body":
      "The bank has not given a final answer yet. This usually takes a few minutes.",
    "checkout.res.pending.hint":
      "Please do not pay again — the result will appear in your account as soon as it is ready. If it still has not after a while, get in touch with us.",
    "checkout.res.failed.title": "Payment did not go through",
    "checkout.res.failed.body":
      "No money was taken. You can check your card and try again.",
    "checkout.res.back": "Back to the parent panel",
  },
  ru: {
    // ---- Notifications (notif.*) — in-app notification center ----
    "notif.bell": "Уведомления",
    "notif.title": "Уведомления",
    "notif.markAllRead": "Отметить все как прочитанные",
    "notif.seeAll": "Показать все",
    "notif.empty": "Уведомлений пока нет",
    "notif.emptyHint": "Новые уведомления появятся здесь.",
    "notif.delete": "Удалить",
    "notif.markRead": "Отметить как прочитанное",
    "notif.open": "Открыть",
    "notif.newLabel": "Новое уведомление",
    "notif.dismiss": "Закрыть",
    "notif.detailsTitle": "Уведомление",
    "notif.close": "Закрыть",
    "notif.noLink": "У этого уведомления нет дополнительной ссылки.",
    "notif.detailsData": "Подробности",
    "notif.timeNow": "сейчас",
    "notif.timeMin": "мин",
    "notif.timeHour": "ч",
    "notif.timeDay": "д",
    "notif.filterAll": "Все",
    "notif.cat.olympiad": "Олимпиады",
    "notif.cat.progress": "Результаты",
    "notif.cat.billing": "Платежи",
    "notif.cat.announcement": "Объявления",
    "notif.cat.news": "Новости",
    "notif.prefs.title": "Настройки уведомлений",
    "notif.prefs.desc": "Выберите, как получать уведомления. Здесь же можно управлять настройками для детей.",
    "notif.prefs.yourChannels": "Ваши уведомления",
    "notif.prefs.children": "Дети",
    "notif.prefs.inApp": "В приложении",
    "notif.prefs.email": "Эл. почта",
    "notif.prefs.push": "Push",
    "notif.prefs.channelNote": "доставляется при включении",
    "notif.prefs.saved": "Сохранено",
    "notif.prefs.saving": "Сохранение…",
    "notif.prefs.error": "Не удалось сохранить",
    "notif.prefs.noChildren": "Дети ещё не добавлены.",
    // ---- ROUND 11 (web) merged keys ----
    "pricing.perSubjectNote": "Цена рассчитывается за 1 предмет.",
    "subjedit.activeChip": "Активен",
    "subjedit.endingChip": "Заканчивается в конце периода",
    "subjedit.save": "Сохранить изменения",
    "subjedit.saving": "Сохранение…",
    "subjedit.saved": "Изменения сохранены.",
    "subjedit.selectedCount": "Выбранные предметы",
    "subjedit.pendingAdd": "Добавлено",
    "subjedit.pendingRemove": "Удалено",
    "subjedit.pendingReinstate": "Возобновлено",
    "subjedit.reinstateLine": "{subject} — отказ отменён, продлевается {date}, как и раньше.",
    "subjedit.reinstateNote":
      "Отмена отказа бесплатна: уже оплаченный период сохраняется полностью, предмет продлевается в свою обычную дату, и сейчас с вас ничего не списывается.",
    "subjedit.noChanges": "Изменений пока нет",
    // ---- Structured change summary; proration retired (see the az block). ----
    "subjedit.dueNow": "К оплате сейчас",
    "subjedit.dueNowNote":
      "За каждый добавленный предмет сейчас списывается полная стоимость выбранного периода, и период начинается сегодня. Оплата не делится по дням.",
    "subjedit.cycleNote":
      "Каждый предмет оплачивается отдельно: его период начинается в день добавления и продлевается только в конце этого периода. Добавление или удаление одного предмета не сдвигает даты остальных.",
    "subjedit.perSubjectLabel": "Оплата по предметам",
    "subjedit.subjectPlanLine": "{subject} · {cycle} · {price}",
    "subjedit.renewsOn": "Продлевается {date}",
    "subjedit.switchesOn": "Текущий период до {date}, затем: {cycle}",
    "subjedit.startsToday": "Начинается сегодня — полный период оплачивается сейчас",
    "subjedit.noteLabel": "Примечание",
    "subjedit.noteText":
      "Удалённые предметы остаются активными до конца оплаченного периода — не позднее {date}. Возврат за удалённые предметы не производится.",
    "subjedit.noChargeNow":
      "Сейчас списаний нет — первый платёж {date}.",
    "subjedit.noteLine": "«{subject}» остаётся активным до {date}.",
    "subjedit.noteNoRefund":
      "Возврат за удалённые предметы не производится. Оставшиеся предметы продолжают действовать по своим периодам.",
    "subjedit.pendingChip": "Затем: {cycle}",
    "pay.confirmNoCharge": "Подтвердить",
    "billing.giveawayNote": "В период бесплатной акции доступ ко всем предметам бесплатный — оплата подписки не требуется.",
    "billing.freeChip": "Бесплатно",
    "pay.cancel": "Отмена",
    "billing.selectChild": "Выберите ребёнка",
    "addchild.giveawayGranted": "Сейчас идёт бесплатный акционный период — все возможности для вашего ребёнка открыты сразу!",
    "addchild.freeAccessGranted": "Для вас действует период бесплатного доступа — все возможности для вашего ребёнка открыты сразу!",
    "freeact.note": "У этого ребёнка ещё нет ID для входа. Пока действует бесплатный период, вы можете активировать его бесплатно.",
    "freeact.cta": "Активировать бесплатно",
    "freeact.activating": "Активация…",
    "freeact.done": "Готово! ID для входа создан.",
    "parent.auth.phone": "Номер телефона",
    "parent.auth.phonePh": "50 123 45 67",
    "parent.auth.phoneCountry": "Код страны",
    "parent.auth.phoneSearch": "Поиск страны…",
    "parent.err.phone": "Введите корректный номер телефона (с кодом страны).",
    "profile.phoneLabel": "Телефон",
    "profile.phoneEdit": "Изменить",
    "profile.phoneSaved": "Номер телефона обновлён",
    "profile.phoneHint": "По этому номеру мы свяжемся с вами по вопросам аккаунта.",
    "profile.addPhone": "Добавить номер",
    "gvw.title": "Бесплатный доступ открыт! 🎁",
    "gvw.sub": "Попробуйте все возможности прямо сейчас — платный доступ начнётся позже.",
    "gvw.remaining": "Осталось",
    "gvw.days": "дн.",
    "gvw.hours": "ч.",
    "gvw.minutes": "мин.",
    "gvw.seconds": "сек.",
    "gvw.ended": "Акция завершилась — период бесплатного доступа закончился.",
    "gvw.chip": "Бесплатная акция",
    "access.giveaway": "Бесплатный период",
    "access.freeAccess": "Бесплатный доступ",
    "stk.sectionTitle": "Стикеры с персонажами",
    "stk.sectionDesc": "Выбери любимую тему — весёлые стикеры украсят твои страницы.",
    "pal.title": "Цветовая тема",
    "pal.hint": "Выбери, как выглядит твоя панель — 26 готовых цветовых тем.",
    "pal.darkNote": "При выборе темы тёмный режим выключается. Если включить его снова, тема сохранится и вернётся, как только ты выключишь тёмный режим.",
    "pal.default": "По умолчанию",
    "pal.group.bright": "Яркие",
    "pal.group.calm": "Спокойные",
    "pal.group.nature": "Природные",
    "pal.group.pastel": "Пастельные",
    "pal.group.bold": "Насыщенные",
    "pal.group.neutral": "Нейтральные",
    "pal.sky": "Небо",
    "pal.ocean": "Океан",
    "pal.cyan": "Бирюза",
    "pal.aqua": "Аква",
    "pal.teal": "Морская волна",
    "pal.arctic": "Арктика",
    "pal.navy": "Тёмно-синяя",
    "pal.indigo": "Королевский индиго",
    "pal.violet": "Фиолетовая мечта",
    "pal.lavender": "Лаванда",
    "pal.rainbow": "Радуга",
    "pal.aurora": "Северное сияние",
    "pal.bubblegum": "Жвачка",
    "pal.sakura": "Сакура",
    "pal.rose": "Роза",
    "pal.berry": "Ягода",
    "pal.coral": "Коралл",
    "pal.peach": "Персик",
    "pal.sunset": "Закат",
    "pal.amber": "Янтарь",
    "pal.sand": "Песок",
    "pal.lime": "Лайм",
    "pal.mint": "Мята",
    "pal.emerald": "Изумруд",
    "pal.forest": "Лес",
    "pal.graphite": "Графит",
    "stk.none": "Без стикеров",
    "stk.empty": "Тем со стикерами пока нет — скоро появятся!",
    "stk.countTitle": "Количество стикеров",
    "stk.err.generic": "Не удалось сохранить выбор. Попробуй ещё раз.",
    // ---- Round 9 (merged) ----
    "ana.subject.all": "Все",
    "ana.kpi.last7": "Занятий за 7 дней",
    "ana.chart.trendSub30": "Точность по дням за последние 30 дней (%)",
    "ana.th.questions": "Вопросы",
    "ana.rangeNote": "Показатели за последние 30 дней.",
    "ana.empty.title": "По этому выбору пока нет данных о занятиях.",
    "ana.empty.sub": "Результаты появятся здесь, когда ребёнок начнёт проходить тесты.",
    "ana.empty.trend": "Пока недостаточно данных для тренда.",
    "ana.empty.mistakes": "За этот период нет ошибок — отличный результат!",
    "ana.mode.label": "Тип аналитики",
    "ana.mode.subjects": "Предметы",
    "ana.mode.olympiads": "Олимпиады",
    "ana.olymp.kpi.attempts": "Попытки олимпиад",
    "ana.olymp.perPackage": "Результаты по пакетам",
    "ana.olymp.perPackageSub": "Попытки, ответы и точность по каждому олимпиадному пакету",
    "ana.th.package": "Пакет",
    "ana.th.attempts": "Попытки",
    "ana.olymp.empty.title": "Пока нет попыток по олимпиадам",
    "ana.olymp.empty.sub": "Результаты появятся здесь, когда ребёнок пройдёт тест в олимпиадном пакете.",
    "poly.nav": "Олимпиады",
    "poly.title": "Олимпиады",
    "poly.subtitle": "Просматривайте активные олимпиадные пакеты и приобретайте их для выбранного ребёнка.",
    "poly.chooseChild": "Выберите ребёнка",
    "poly.noChildren": "Чтобы купить олимпиадный пакет, сначала добавьте профиль ребёнка.",
    "poly.addChild": "Добавить ребёнка",
    "poly.none": "Сейчас нет активных олимпиадных пакетов.",
    "poly.owned": "Куплено",
    "poly.buy": "Получить",
    "poly.buyNow": "Получить",
    "poly.questions": "вопросов",
    "poly.price": "Цена",
    "poly.free": "Бесплатно",
    "poly.modal.title": "Подтверждение покупки",
    "poly.modal.package": "Пакет",
    "poly.modal.child": "Ребёнок",
    "poly.modal.payNote": "На следующем шаге вы перейдёте на страницу оплаты банка. Пакет открывается только после подтверждения платежа, и доступ остаётся навсегда.",
    "poly.modal.confirm": "Подтвердить и купить",
    "poly.modal.cancel": "Отмена",
    "poly.modal.close": "Закрыть",
    "poly.modal.pending": "Платёж обрабатывается…",
    "poly.modal.success": "Покупка завершена! Пакет уже отображается в разделе «Мои олимпиады» вашего ребёнка.",
    "poly.modal.already": "Этот пакет уже куплен для этого ребёнка.",
    "poly.err.generic": "Во время покупки произошла ошибка. Пожалуйста, попробуйте ещё раз чуть позже.",
    // Sale window (olympiad_packages.sale_starts_at/sale_ends_at)
    "poly.err.notOnSale": "Продажи этого пакета уже завершены.",
    "poly.err.notForGrade": "Этот пакет не предназначен для класса выбранного ученика.",
    "poly.err.alreadyOwned": "У этого ребёнка уже есть этот пакет — доступ пожизненный.",
    "poly.err.priceMoved":
      "Цена обновилась. Обновите страницу, чтобы увидеть новую.",
    "oly5.errNotForGrade": "Эта олимпиада не предназначена для твоего класса.",
    "poly.notOnSale": "Продажи завершены",
    // ---- Olympiad card "Подробнее" (Round 43) ----
    "poly.details": "Подробнее",
    "poly.det.type": "Тип олимпиады",
    "poly.det.subject": "Предмет",
    "poly.det.grade": "Класс",
    "poly.det.grades": "Классы",
    "poly.det.questions": "Количество вопросов",
    "poly.det.perAttempt": "Вопросов за попытку",
    "poly.det.duration": "Длительность",
    "poly.det.eventAt": "Дата проведения",
    "poly.det.saleStart": "Начало продаж",
    "poly.det.saleEnd": "Окончание продаж",
    "poly.det.price": "Цена",
    "poly.det.description": "Описание",
    "poly.det.minutes": "мин",
    // ---- Public olympiad packages section (landing + Services) ----
    "polyPub.eyebrow": "Олимпиады",
    "polyPub.title": "Активные олимпиадные пакеты",
    "polyPub.sub": "Выберите олимпиадный пакет для вашего ребёнка — присоединяйтесь до окончания продаж.",
    "polyPub.empty": "Сейчас в продаже нет олимпиадных пакетов. Новые пакеты появятся совсем скоро.",
    "polyPub.salesUntil": "Продажа до {date}",
    "polyPub.eventAt": "Дата олимпиады: {date}",
    "polyPub.cta": "Зарегистрироваться",
    "polyPub.ctaParent": "Приобрести пакет",
    "polyPub.seeAll": "Смотреть все",
    "polyPub.pageTitle": "Все олимпиадные пакеты",
    "polyPub.pageLead": "Выберите подходящий олимпиадный пакет для вашего ребёнка — здесь собраны все активные пакеты.",
    "polyPub.statusOnSale": "В продаже",
    "polyPub.error": "Не удалось загрузить список олимпиад. Пожалуйста, попробуйте ещё раз чуть позже.",
    "polyPub.back": "Все олимпиады",
    "polyPub.howTitle": "Как принять участие",
    "polyPub.how1": "Создайте родительский аккаунт и добавьте профиль ребёнка.",
    "polyPub.how2": "Оформите пакет в родительской панели — доступ бессрочный и не сгорает.",
    "polyPub.how3": "Ребёнок отвечает на все вопросы пакета за отведённое время.",
    "polyPub.parentOnlyNote": "Олимпиадные пакеты оформляются только из родительского аккаунта — ученик не может совершать покупки.",
    // ---- Child avatar (Add/Edit-Child, parent-managed) ----
    "addchild.avatar.title": "Фото профиля",
    "addchild.avatar.hint": "Выберите готовый аватар для ребёнка или загрузите фото (необязательно).",
    "addchild.avatar.default": "Стандартный",
    "addchild.avatar.boy": "Мальчик",
    "addchild.avatar.girl": "Девочка",
    "addchild.avatar.upload": "Загрузить фото",
    "addchild.avatar.replace": "Заменить фото",
    "addchild.avatar.removePhoto": "Удалить фото",
    "addchild.avatar.photoSelected": "Фото выбрано",
    "addchild.avatar.requirements": "PNG, JPEG или WebP, до 2 МБ.",
    // ---- Round 8 (merged) ----
    "about2.hero.eyebrow": "О нас",
    "about2.hero.title": "Большие вершины покоряются маленькими шагами",
    "about2.hero.lead": "За успехом каждого победителя олимпиады стоят планомерная подготовка, постоянная практика и правильное направление. OlympIQ — платформа олимпиадной подготовки на основе искусственного интеллекта, созданная именно для этого. Она даёт ученикам 1–11 классов возможность системно развивать знания, готовиться к олимпиадам на профессиональном уровне и полностью раскрывать свой потенциал.",
    "about2.hero.p2": "Технология искусственного интеллекта анализирует результаты каждого ученика, определяет сильные темы и темы, требующие развития, и готовит персональные отчёты и рекомендации по обучению. Так каждый ученик развивается в соответствии со своим уровнем и потребностями, учится эффективнее и шаг за шагом приближается к целям.",
    "about2.hero.p3": "Платформа предлагает тысячи заданий по математике, естественным наукам, логике и английскому языку, испытания в олимпиадном формате и ежедневные тренировки. Вопросы подбираются под класс ученика и выбранные темы, а регулярная практика закрепляет знания и развивает олимпиадные навыки.",
    "about2.hero.p4": "В OlympIQ аккаунтами управляет родитель: он добавляет детей, управляет выбором предметов и подписками, а ученик через простую и безопасную систему входа сосредоточен только на учёбе. Такой подход обеспечивает безопасность и позволяет родителям удобно вести процесс подготовки.",
    "about2.hero.chip1": "1–11 классы",
    "about2.hero.chip2": "4 предмета",
    "about2.hero.chip3": "Интерфейс на 3 языках",
    "about2.b1.tag": "Ежедневная практика",
    "about2.b1.title": "Учись, пробуй, поднимайся!",
    "about2.b1.body": "Ученики каждый день тренируются на вопросах своего уровня. Маленькие, но постоянные шаги строят прочный фундамент, которого требует олимпиада.",
    "about2.b2.tag": "Семейная модель",
    "about2.b2.title": "Родитель управляет — ребёнок учится",
    "about2.b2.body": "Родитель создаёт аккаунт каждого ребёнка, выбирает подписки по предметам и следит за прогрессом с одной панели. Ребёнок просто входит на платформу по 8-значному ID.",
    "about2.b3.tag": "Подготовка к олимпиадам",
    "about2.b3.title": "Тесты в формате настоящей олимпиады",
    "about2.b3.body": "В каждой попытке искусственный интеллект автоматически подбирает 25 вопросов — сложность никто не выбирает сам. Пакеты покупаются один раз и дают безлимитный доступ.",
    "about2.b4.tag": "Аналитика",
    "about2.b4.title": "Прогресс, который виден в цифрах",
    "about2.b4.body": "Результаты, сильные и слабые стороны по предметам, ежедневная серия — всё в наглядных графиках. Родитель ясно видит, какие задания выполнял ребёнок и с какими результатами.",
    "about2.b5.tag": "Безопасность",
    "about2.b5.title": "Безопасная среда для детей",
    "about2.b5.body": "Детские аккаунты работают без электронной почты и никогда не могут платить — все платежи выполняются только с родительского аккаунта. Данные детей защищены и не используются для несанкционированного маркетинга.",
    "about2.values.title": "OlympIQ в двух словах",
    "about2.values.sub": "Четыре принципа — одна платформа.",
    "about2.v1.title": "Наша миссия",
    "about2.v1.body": "Сделать качественную подготовку к олимпиадам доступной каждой семье. Регулярная и измеримая подготовка — для каждого ученика.",
    "about2.v2.title": "Что мы предлагаем",
    "about2.v2.body": "Подписки по предметам (математика, естественные науки, логика, английский), пакеты олимпиадной подготовки, ежедневные испытания и аналитика прогресса.",
    "about2.v3.title": "Для кого",
    "about2.v3.body": "Для учеников 1–11 классов и их родителей. Родитель управляет аккаунтом, ребёнок сосредоточен на учёбе.",
    "about2.v4.title": "Доверие и прозрачность",
    "about2.v4.body": "Вопросы подбираются на сервере, результаты показываются прозрачно, а платежи безопасны и доступны только родителям.",
    "about2.team.title": "Наша команда",
    "about2.team.sub": "Команда и юридическая информация проекта OlympIQ.",
    "about2.team.body": "Проект OlympIQ реализуется Камилем Пириевым (ИНН: 6300091352) и его партнёрами.",
    "about2.team.addrLabel": "Юридический адрес",
    "about2.team.addrValue": "Азербайджанская Республика,\nЛерикский район,\nсело Пештатюк",
    "ana.section.title": "Подробный прогресс",
    "ana.section.sub": "Выберите ребёнка и предмет — подробные результаты появятся ниже.",
    "ana.noChildren": "Чтобы увидеть аналитику, сначала добавьте ребёнка.",
    "ana.addChild": "Добавить ребёнка",
    "ana.childLabel": "Ребёнок",
    "ana.subjectLabel": "Предмет",
    "ana.subject.math": "Математика",
    "ana.subject.science": "Естествознание",
    "ana.subject.logic": "Логика",
    "ana.subject.english": "Английский язык",
    "ana.locked": "Оформите подписку, чтобы открыть аналитику по этому предмету.",
    "ana.noActive": "У этого ребёнка пока нет активной подписки на предметы.",
    "ana.goSubscribe": "Перейти к подписке",
    "ana.kpi.weekly": "Занятий за неделю",
    "ana.kpi.tests": "Пройдено тестов",
    "ana.kpi.correct": "Правильных ответов",
    "ana.kpi.wrong": "Неправильных ответов",
    "ana.kpi.skipped": "Пропущенные ответы",
    "ana.kpi.accuracy": "Средняя точность",
    "ana.kpi.time": "Время занятий",
    "ana.kpi.best": "Самая сильная тема",
    "ana.kpi.weak": "Самая слабая тема",
    "ana.topic.needSample": "Чтобы оценить тему, нужно не менее {n} ответов ({a}/{n}).",
    "ana.topic.needTopics": "Для сравнения нужно минимум {n} темы с достаточным числом ответов.",
    "ana.topic.allEqual": "Все темы на одном уровне ({p}%) — пока нет различий.",
    "ana.kpi.last": "Последняя активность",
    "ana.chart.weekly": "Занятия за неделю",
    "ana.chart.weeklySub": "Тренировки за последние 7 дней",
    "ana.chart.trend": "Динамика точности",
    "ana.chart.trendSub": "Средняя точность за последние 8 недель (%)",
    "ana.chart.topics": "Результаты по темам",
    "ana.chart.mistakes": "Ошибки по темам",
    "ana.th.topic": "Тема",
    "ana.th.subtopic": "Подтема",
    "ana.th.tests": "Тесты",
    "ana.th.accuracy": "Точность",
    "ana.th.mistakes": "Ошибки",
    "ana.day.mon": "Пн",
    "ana.day.tue": "Вт",
    "ana.day.wed": "Ср",
    "ana.day.thu": "Чт",
    "ana.day.fri": "Пт",
    "ana.day.sat": "Сб",
    "ana.day.sun": "Вс",
    "ana.unit.h": "ч",
    "ana.unit.m": "мин",
    "ana.weekAbbr": "Н",
    "ana.topic.fractions": "Дроби",
    "ana.topic.comparingFractions": "Сравнение дробей",
    "ana.topic.geometry": "Геометрия",
    "ana.topic.angles": "Углы",
    "ana.topic.wordProblems": "Текстовые задачи",
    "ana.topic.multiStep": "Многошаговые задачи",
    "ana.topic.multiplication": "Умножение",
    "ana.topic.plants": "Растения",
    "ana.topic.photosynthesis": "Фотосинтез",
    "ana.topic.humanBody": "Организм человека",
    "ana.topic.skeleton": "Скелет",
    "ana.topic.matter": "Вещество",
    "ana.topic.statesOfMatter": "Состояния вещества",
    "ana.topic.space": "Космос",
    "ana.topic.patterns": "Закономерности",
    "ana.topic.shapePatterns": "Закономерности фигур",
    "ana.topic.sequences": "Последовательности",
    "ana.topic.numberSequences": "Числовые последовательности",
    "ana.topic.spatial": "Пространственное мышление",
    "ana.topic.mirror": "Зеркальные отражения",
    "ana.topic.puzzles": "Головоломки",
    "ana.topic.vocabulary": "Словарный запас",
    "ana.topic.irregularVerbs": "Неправильные глаголы",
    "ana.topic.grammar": "Грамматика",
    "ana.topic.presentSimple": "Present Simple",
    "ana.topic.reading": "Чтение",
    "ana.topic.shortStories": "Короткие рассказы",
    "ana.topic.listening": "Аудирование",
    "billing.tab.plans": "Планы",
    "billing.tab.billing": "Оплата",
    "billing.tab.invoices": "Счета",
    "billing.tabsAria": "Разделы подписки",
    "billing.plansTitle": "Планы и предметы",
    "billing.billingTitle": "Платёжные данные",
    "billing.invoicesTitle": "Счета",
    "billing.invoicesEmpty": "Счетов пока нет. Они появятся здесь после первого платежа.",
    "billing.noBillingYet":
      "Платёжных данных пока нет. Как только план станет активным, здесь появятся цикл оплаты, дата следующего списания и сумма.",
    "billing.current": "Текущий план",
    "billing.popular": "Самый популярный",
    "billing.addSubjects": "Добавить предметы",
    "billing.noSubjects": "Предметы пока не выбраны",
    "billing.totalLabel": "Итого",
    "billing.perWeek": "/ нед.",
    "billing.perMonth": "/ мес.",
    "billing.perYear": "/ год",
    "billing.row.cycle": "Период оплаты",
    "billing.row.next": "Дата следующего списания",
    "drawer2.account": "Аккаунт",
    "drawer2.language": "Язык",
    "drawer2.appearance": "Оформление",
    "drawer2.session": "Сеанс",
    "drawer2.themeLight": "Светлая",
    "drawer2.themeDark": "Тёмная",
    "oly4.eyebrow": "Соревнования",
    "oly4.pageTitle": "Олимпиады",
    "oly4.plannedTitle": "Запланированные олимпиады",
    "oly4.mineTitle": "Мои олимпиады",
    "oly4.none": "Сейчас нет запланированных олимпиад.",
    "oly4.details": "Подробнее",
    "oly4.buyNote": "Чтобы участвовать в этой олимпиаде, попросите родителя купить пакет.",
    "oly4.close": "Закрыть",
    "oly4.subject": "Предмет",
    "oly4.type": "Тип олимпиады",
    "oly4.date": "Дата",
    "oly4.qcount": "Количество вопросов",
    "oly4.price": "Цена",
    "oly4.questions": "вопросов",
    "oly4.dateTbd": "Дата уточняется",
    "oly4.free": "Бесплатно",
    "oly4.status.upcoming": "Предстоит",
    "oly4.status.planned": "Планируется",
    "oly4.status.held": "Проведена",
    "pricing2.title": "Цены под ваш бюджет",
    "pricing2.sub": "Тарифы рассчитываются отдельно по каждому предмету и каждому ребёнку. Выберите нужный пакет — итоговая сумма рассчитается автоматически.",
    "pricing2.popular": "Самый популярный",
    "pricing2.sibling.title": "Семейный пакет",
    "pricing2.sibling.body": "Если в семье добавлено несколько детей, скидка применяется автоматически: -10% на второго ребёнка и -15% на третьего и каждого следующего. Промокод не нужен.",
    "pricing2.note": "Указанные цены являются примерными; окончательные цены будут подтверждены платформой.",
    // ---- Public services configurator (cfg.*) — выбор предметов + живая цена ----
    "cfg.available": "Доступные предметы",
    "cfg.availableHint": "Добавьте предметы, которые нужны вашему ребёнку.",
    "cfg.selected": "Ваш выбор",
    "cfg.add": "Добавить",
    "cfg.addAria": "Добавить предмет «{subject}» к выбору",
    "cfg.removeAria": "Убрать предмет «{subject}» из выбора",
    "cfg.allAdded": "Все предметы уже выбраны.",
    "cfg.emptySelection": "Выберите хотя бы один предмет, чтобы увидеть цену.",
    "cfg.countLabel": "Выбрано предметов",
    "cfg.perSubjectLabel": "Цена за предмет",
    "cfg.perSubjectMixed": "зависит от предмета",
    "cfg.subtotalLabel": "Промежуточный итог",
    "cfg.totalLabel": "Итого",
    "cfg.unpriced": "Не продаётся на этот период",
    "cfg.cta": "Продолжить",
    "cfg.ctaNoteGuest": "Следующий шаг — создайте родительский аккаунт: выбор сохранится.",
    "cfg.ctaNoteParent": "Следующий шаг — добавьте ребёнка: эти предметы уже будут отмечены.",
    "cfg.warnAllUnpriced": "Выбранные предметы не продаются на этот период оплаты. Выберите другой период.",
    "cfg.warnSomeUnpriced": "{n} предмет(ов) не продаются на этот период оплаты и не входят в сумму.",
    "cfg.childNote": "Оформить подписку может только родительский аккаунт.",
    "cfg.serverNote": "Расчёт носит информационный характер. Итоговая сумма рассчитывается на сервере при оплате — там же применяется семейная скидка.",
    "cfg.loadError": "Не удалось загрузить цены. Попробуйте чуть позже.",
    // ---- Per-subject billing cycles (plan.*) — migration 109. Each subject
    // carries its own cycle, so there is no single "billing period" label and
    // no single recurring total; the honest aggregate is plan.dueToday.
    "plan.cycle": "Период оплаты",
    "plan.cycleAria": "Период оплаты для предмета «{subject}»",
    "plan.cycleChangedAria": "{subject}: {cycle}",
    "plan.group.weekly": "Недельные предметы",
    "plan.group.monthly": "Месячные предметы",
    "plan.group.yearly": "Годовые предметы",
    "plan.group.subtotal": "Промежуточный итог",
    "plan.dueToday": "К оплате сейчас",
    "plan.dueTodayNote":
      "У предметов разные периоды, поэтому единой регулярной суммы нет — каждый период продлевается отдельно.",
    "plan.renewals": "Продление",
    "plan.renewalLine.weekly":
      "Недельные предметы продлеваются каждую неделю на {total} {currency}.",
    "plan.renewalLine.monthly":
      "Месячные предметы продлеваются каждый месяц на {total} {currency}.",
    "plan.renewalLine.yearly":
      "Годовые предметы продлеваются каждый год на {total} {currency}.",
    "plan.mixedNote":
      "У каждого предмета свой период оплаты. Изменение одного не влияет на другие.",
    "plan.fromPrice": "от {price} / {cycle}",
    "plan.removeAria": "Убрать предмет «{subject}» из выбора",
    "plan.removeSubject": "Убрать",
    "plan.perSubjectHint": "Выберите период оплаты для каждого предмета.",
    "subjedit.pendingPlanChange": "Смена периода",
    "subjedit.planChangeLine": "{subject}: {from} → {to} (с {date})",
    "subjedit.planChangeNote":
      "Сейчас ничего не списывается — новый период начнётся при следующем продлении этого предмета.",
    "sub.err.badInterval": "Указан недопустимый период оплаты.",
    "cfg.noSubjects": "Сейчас нет предметов в продаже.",
    "cfg.recap.title": "Ваш выбор",
    "cfg.recap.note": "После регистрации эти предметы уже будут отмечены при добавлении ребёнка.",
    "prof2.accountInfo": "Данные аккаунта",
    "prof2.name": "Имя",
    "prof2.email": "Эл. почта",
    "prof2.security": "Безопасность",
    "prof2.securityHint": "Время от времени меняйте пароль, чтобы ваш аккаунт оставался в безопасности.",
    "prof2.danger": "Опасная зона",
    "prof2.dangerHint": "При удалении аккаунта будут удалены ваш профиль родителя, все созданные вами профили детей и все их учебные данные. Это действие нельзя отменить. Небольшое количество записей сохраняется в обезличенном виде для бухгалтерии и безопасности — подробнее в Политике конфиденциальности.",
    "prof2.session": "Сеанс",
    "prof2.sessionHint": "Выйти из аккаунта на этом устройстве.",
    "prof2.idHint": "Этот ID нужен для входа в аккаунт.",
    "prof2.selected": "Выбрано",
    "app.brand": "OlympIQ",
    "home.subtitle": "Веб-приложение для учеников и родителей — основа.",
    "supabase.heading": "Подключение Supabase",
    "supabase.configured": "настроено ✓",
    "supabase.notConfigured":
      "не настроено — скопируйте .env.local.example в .env.local и добавьте URL и anon-ключ Supabase",
    "home.note":
      "Аутентификация, панели, ежедневные задания, тесты и отчёты добавляются на следующих этапах. Эта страница лишь проверяет, что приложение запускается.",
    "state.loading": "Загрузка…",
    "error.title": "Что-то пошло не так",
    "error.desc": "Произошла непредвиденная ошибка. Пожалуйста, попробуйте снова.",
    "action.retry": "Повторить",
    "notFound.title": "Страница не найдена",
    "notFound.desc": "Запрашиваемая страница не существует.",
    "action.goHome": "На главную",
    "unauthorized.title": "Нет доступа",
    "unauthorized.desc": "У вас нет доступа к этой странице.",
    "lang.label": "Язык",
    "auth.child.err.idFormat": "Введите 8-значный ID.",
    "auth.child.err.passwordRequired": "Введите пароль.",
    "auth.child.err.passwordTooShort": "Пароль должен содержать не менее 8 символов.",
    "auth.child.err.nameTooLong": "Слишком длинное имя (не более 80 символов).",
    "auth.child.err.passwordEqualsId": "Пароль не может совпадать с ID.",
    "auth.child.err.firstNameRequired": "Введите имя.",
    "auth.child.err.lastNameRequired": "Введите фамилию.",
    "auth.child.err.invalidCredentials": "Неверный ID или пароль.",
    "auth.child.err.locked": "Слишком много неудачных попыток. Повторите попытку позже.",
    "auth.child.err.notYourChild": "Этот ребёнок не привязан к вашему аккаунту.",
    "auth.child.err.childNotFound": "Аккаунт ребёнка не найден.",
    "auth.child.err.createFailed": "Не удалось создать аккаунт ребёнка. Попробуйте ещё раз.",
    "auth.child.err.updateFailed": "Не удалось обновить пароль. Попробуйте ещё раз.",
    "auth.child.err.serverError": "Ошибка сервера. Попробуйте ещё раз.",
    "auth.child.created": "Аккаунт ребёнка создан.",
    "auth.child.passwordReset": "Пароль обновлён.",
    "nav.home": "Главная",
    "nav.back": "Назад",
    "nav.subjects": "Предметы",
    "nav.pricing": "Услуги",
    "nav.news": "Новости",
    "nav.about": "О нас",
    "nav.faq": "FAQ",
    "nav.contact": "Контакты",
    "nav.login": "Войти",
    "nav.myPanel": "Мой кабинет",
    "nav.register": "Регистрация",
    "foot.rights": "Каждый день на ступень выше",
    "home.heroTitle": "OlympIQ — каждый день на ступень выше",
    "home.heroLead":
      "Портал подготовки к олимпиадам для 1–11 классов. Платформа по подписке для школьников — родитель управляет, ребёнок учится.",
    "home.ctaStart": "Начать",
    "home.ctaSubjects": "Посмотреть предметы",
    "home.ctaOlympiads": "Посмотреть олимпиады",
    "home.f1Title": "Аккаунты под управлением родителя",
    "home.f1Desc":
      "Родитель регистрируется и создаёт отдельный аккаунт для каждого ребёнка — ребёнок входит по простому 8-значному ID.",
    "home.f2Title": "Предметные пакеты",
    "home.f2Desc":
      "Недельная, месячная или годовая подписка для каждого ребёнка по предметам — математика, естественные науки, логика и английский язык",
    "home.f3Title": "Подготовка к олимпиадам",
    "home.f3Desc": "Специальные олимпиадные пакеты — безлимитный доступ и ежедневные пробные испытания",
    "home.f4Title": "Ежедневная практика",
    "home.f4Desc":
      "Вопросы подбираются на сервере под уровень ученика и обновляются каждый будний день. Стабильный прогресс.",
    "about.title": "Об OlympIQ",
    "about.p1":
      "OlympIQ помогает ученикам 1–11 классов Азербайджана готовиться к олимпиадам и строить прочную базу через ежедневную практику.",
    "about.p2":
      "Родитель сохраняет контроль: создаёт и ведёт аккаунт каждого ребёнка, выбирает предметы и следит за прогрессом — всё в одном месте.",
    "subjects.title": "Предметы",
    "subjects.lead": "Выберите нужные ребёнку предметы. Добавить новые можно в любой момент.",
    "subjects.note":
      "Цена — за предмет и за ребёнка. Скидка за второго и последующих детей применяется автоматически.",
    "subject.math": "Математика",
    "subject.science": "Наука",
    "subject.logic": "Логика",
    "subject.english": "Английский",
    "pricing.title": "Услуги",
    "pricing.lead": "Простые цены за каждый предмет для каждого ребёнка.",
    "pricing.perSubject": "за предмет",
    "pricing.weekly": "Еженедельно",
    "pricing.monthly": "Ежемесячно",
    "pricing.yearly": "Ежегодно",
    "pricing.trial": "Каждый новый предмет начинается с 7-дневного бесплатного периода.",
    "pricing.sibling": "Автоматическая скидка: 2-й ребёнок −10%, 3-й и далее −15%.",
    "pricing.promo":
      "На старте действует акция; цены ориентировочные и устанавливаются платформой.",
    "pricing.note": "Покупать может только родитель. Дети не видят цен и платежей.",
    "faq.title": "Частые вопросы",
    "faq.q1": "Кто создаёт аккаунт ученика?",
    "faq.a1":
      "Только родитель. После регистрации родитель добавляет каждого ребёнка и задаёт пароль. Система выдаёт уникальный 8-значный ID, по которому ученик входит в систему.",
    "faq.q2": "Как ученики входят в систему?",
    "faq.a2":
      "Ученик входит на портал по 8-значному ID и паролю, заданному родителем. Электронная почта не требуется.",
    "faq.q3": "Как работает оплата?",
    "faq.a3":
      "Для каждого предмета и каждого ребёнка есть свой пакет подписки (на неделю, месяц или год). Действует бесплатный 7-дневный пробный период, а для 2 и более детей из одной семьи автоматически применяется скидка для братьев и сестёр.",
    "faq.q4": "Что такое «Подготовка к олимпиадам»?",
    "faq.a4":
      "Безлимитный доступ к вопросам, составленным по олимпиадным темам.",
    "faq.q5": "Может ли ученик покупать самостоятельно?",
    "faq.a5": "Нет. Все платежи и выбор пакетов подписки совершает только родитель.",
    "contact.title": "Контакты",
    "contact.lead": "Вопросы или отзывы? Будем рады услышать вас.",
    "contact.email": "Эл. почта",
    "contact.note": "Форма обратной связи появится скоро.",
    "newsp.none": "Новостей пока нет.",
    "newsp.back": "← Назад к новостям",
    "login.title": "Вход",
    "login.studentTitle": "Вход для ученика",
    "login.studentHint": "Войдите по 8-значному ID и паролю (не по эл. почте).",
    "login.studentCta": "Войти как ученик",
    "login.parentTitle": "Вход для родителя",
    "login.parentHint": "Войдите по эл. почте и паролю.",
    "login.lead": "Вход для родителей и детей появится на следующем этапе.",
    "register.title": "Создать аккаунт родителя",
    "register.lead": "Регистрация родителей появится на следующем этапе.",
    "auth.childLoginHint":
      "Дети входят по 8-значному ID и паролю, заданному родителем.",
    "parent.auth.name": "Ваше имя",
    "parent.auth.email": "Эл. почта",
    "parent.auth.firstName": "Имя",
    "parent.auth.lastName": "Фамилия",
    "parent.err.unverified": "Подтвердите эл. почту. Мы отправили вам ссылку для подтверждения.",
    "verify.title": "Подтвердите эл. почту",
    "verify.body": "Перейдите по ссылке подтверждения из письма, чтобы активировать аккаунт.",
    "verify.bodyTo": "Ссылку для подтверждения мы отправили на адрес:",
    "verify.hint": "Не видите письмо? Проверьте папку «Спам».",
    "verify.resendPrompt":
      "Письмо так и не пришло? Укажите свой адрес — отправим ссылку для подтверждения ещё раз.",
    "verify.resend": "Отправить ссылку ещё раз",
    "verify.resent":
      "Если этот адрес ожидает подтверждения, ссылка отправлена повторно. Проверьте почту и папку «Спам».",
    "verify.resendFailed": "Не удалось отправить ссылку. Попробуйте ещё раз чуть позже.",
    "verify.state.ok": "E-mail подтверждён. Теперь вы можете войти.",
    "verify.state.expired": "Срок действия ссылки истёк. Мы можем отправить новую.",
    "verify.state.failed": "Ссылка не сработала. Возможно, её уже использовали или скопировали не полностью.",
    "confirmed.title": "E-mail подтверждён",
    "confirmed.body": "Аккаунт активен. Теперь вы можете войти.",
    "confirmed.openApp": "Открыть приложение OlympIQ",
    "confirmed.continueWeb": "Продолжить на сайте",
    "confirmed.goDashboard": "Перейти в панель",
    "confirmed.appHint": "Если приложение не открылось, откройте его сами и войдите, указав e-mail и пароль.",
    "confirmed.desktopHint": "Если вы пользуетесь мобильным приложением, откройте его и войдите с помощью e-mail и пароля.",
    "forgot.title": "Сброс пароля",
    "forgot.hint": "Введите эл. почту — мы отправим ссылку для сброса.",
    "forgot.submit": "Отправить ссылку",
    "forgot.sent": "Если эта почта зарегистрирована, ссылка для сброса отправлена. Проверьте почту.",
    "reset.title": "Задайте новый пароль",
    "reset.hint": "Введите новый пароль (не менее 8 символов).",
    "reset.newPassword": "Новый пароль",
    "reset.submit": "Обновить пароль",
    "account.delete": "Удалить аккаунт",
    "account.deleteConfirm": "Ваш аккаунт, все аккаунты детей и их учебные данные будут удалены навсегда. Небольшое количество записей сохраняется в обезличенном виде (см. Политику конфиденциальности). Продолжить?",
    "child.resetPw": "Сбросить пароль",
    "child.newPassword": "Новый пароль",
    "child.resetPwSubmit": "Обновить",
    "child.resetPwOk": "Обновлено ✓",
    "child.deleteChild": "Удалить ребёнка",
    "child.deleteConfirm": "Удалить аккаунт ребёнка навсегда?",
    "parent.auth.password": "Пароль",
    "parent.auth.login": "Войти",
    "parent.auth.register": "Создать аккаунт",
    "parent.auth.submitting": "Пожалуйста, подождите…",
    "parent.auth.noAccount": "Нет аккаунта?",
    "parent.auth.haveAccount": "Уже есть аккаунт?",
    "parent.auth.registerNote":
      "Зарегистрируйтесь как родитель, чтобы добавить ребёнка и управлять его аккаунтом.",
    "parent.err.email": "Введите корректную эл. почту.",
    "parent.err.password": "Пароль должен содержать не менее 8 символов.",
    "parent.err.tooMany":
      "Слишком много попыток. Повторите попытку через несколько минут.",
    "parent.err.required": "Введите эл. почту и пароль.",
    "parent.err.invalid": "Неверная эл. почта или пароль.",
    "parent.err.createFailed":
      "Не удалось создать аккаунт. Возможно, эл. почта уже используется.",
    "parent.nav.dashboard": "Панель",
    "parent.nav.addChild": "Добавить ребёнка",
    "parent.nav.logout": "Выйти",
    "parent.dash.title": "Мои дети",
    "parent.dash.addChild": "Добавить ребёнка",
    "parent.dash.noChildren": "Вы ещё не добавили детей.",
    "parent.dash.childId": "ID для входа",
    "parent.child.title": "Добавить ребёнка",
    "parent.child.intro":
      "Введите данные ребёнка. 8-значный ID для входа создаётся после выбора плана.",
    "parent.child.first": "Имя",
    "parent.child.last": "Фамилия",
    "parent.child.city": "Город",
    "parent.child.citySelect": "Выберите город",
    "parent.child.cityOther": "Другой…",
    "parent.child.cityOtherLabel": "Название города",
    "parent.child.school": "Школа",
    "parent.child.grade": "Класс",
    "parent.child.gradeSelect": "Выберите класс",
    "parent.child.password": "Пароль ребёнка",
    "parent.child.passwordHint":
      "Не менее 8 символов. Ребёнок использует его вместе с 8-значным ID.",
    "parent.child.submit": "Создать ребёнка",
    "parent.child.submitting": "Создание…",
    "parent.child.created": "Аккаунт ребёнка создан.",
    "parent.child.choosePlan": "Выбрать план и получить ID",
    "parent.child.choosePlanNote":
      "8-значный ID для входа создаётся после выбора плана. Выберите предметы, чтобы продолжить.",
    "parent.child.idLabel": "8-значный ID для входа",
    "parent.child.idNote":
      "Сохраните этот ID. Ребёнок входит по нему и заданному вами паролю.",
    "parent.child.another": "Добавить нового ребёнка",
    "access.inactive": "Нет доступа",
    "access.trialing": "Пробный",
    "access.active": "Активен",
    "access.locked": "Заблокирован",
    "access.expired": "Истёк",
    "parent.dash.manage": "Предметы",
    "parent.dash.choosePlan": "Выбрать план",
    "parent.dash.idPending": "ID ожидается — выберите план",
    "sub.title": "Предметы и подписка",
    "sub.interval": "Период оплаты",
    "sub.subjects": "Предметы",
    "sub.subtotal": "Промежуточный итог",
    "sub.siblingNote": "скидка за детей применяется при подтверждении",
    "sub.submit": "Начать 7-дневный бесплатный период",
    "sub.submitting": "Запуск…",
    "sub.done": "Пробный период начат.",
    "sub.base": "Базовая цена",
    "sub.discount": "Скидка за детей",
    "sub.total": "Итого после пробного периода",
    "sub.totalNow": "К оплате",
    "sub.trial": "Бесплатный период",
    "sub.days": "дн.",
    "sub.previewHint": "Выберите хотя бы один предмет, чтобы увидеть цену.",
    "sub.calculating": "Расчёт…",
    "sub.noSibling": "без скидки",
    "sub.discount.rank2": "Скидка за второго ребёнка",
    "sub.discount.rank3": "Скидка за третьего и следующих детей",
    "sub.discount.hint":
      "За второго ребёнка автоматически 10%, за третьего и последующих — 15%.",
    "sub.discount.saved": "Ваша экономия",
    "sub.noSubjectsAvailable": "Пока нет предметов с активной ценой.",
    "sub.err.invalid": "Выберите период оплаты.",
    "sub.err.noSubjects": "Выберите хотя бы один предмет.",
    // Migration 125 — the plan is created only after the bank confirms the
    // payment, so the start-a-plan screen ends on a payment step, not on a
    // "done" message.
    "sub.payFirst": "Завершите оплату",
    "sub.payFirstNote":
      "План станет активным после подтверждения оплаты. Тогда же будет создан 8-значный логин ребёнка, и он появится в родительской панели.",
    "sub.trialNoChargeToday":
      "Сегодня ничего не списывается — начинается пробный период на {days} дн., а первый платёж будет взят только после его окончания.",
    "sub.err.notYourChild": "Этот ребёнок не привязан к вашему аккаунту.",
    "sub.err.idFailed": "Не удалось назначить ID для входа. Попробуйте ещё раз.",
    "sub.err.failed": "Не удалось выполнить операцию. Пожалуйста, попробуйте ещё раз.",
    "sub.err.priceMoved":
      "Цены изменились. Обновите страницу и подтвердите выбор ещё раз.",
    "gate.paymentsOff":
      "Платежи временно приостановлены. Новые подписки и покупки сейчас недоступны.",
    "gate.giveawayFree":
      "Сейчас идёт бесплатный акционный период — все возможности открыты бесплатно, оплата не требуется.",
    "gate.freeAccess":
      "Для вас активен период бесплатного доступа — все возможности подписки сейчас открыты бесплатно.",
    // Migration 126 — a change that costs money, asked for on a surface that
    // may not take money (the mobile BFF). The copy is bound by
    // docs/STORE_PAYMENTS_COMPLIANCE.md section 5: it states a FACT about where
    // subscriptions are managed and names no price, no destination, no URL and
    // no purchase verb. "Manage it on your web account" is specifically the
    // WRONG form (audit finding I6) — it is the sentence an App Store reviewer
    // screenshots. This one is the shape section 5 lists as right.
    "gate.notInApp":
      "Это изменение нельзя завершить в приложении. Подписки не управляются в этом приложении.",
    "fa.title": "Бесплатный доступ",
    "fa.sub": "Все возможности подписки сейчас для вас бесплатны.",
    "gate.olympiadOff": "Модуль олимпиад в данный момент недоступен.",
    "gate.leaderboardOff":
      "Рейтинг сейчас недоступен — функция временно отключена администратором.",
    "subjedit.title": "Управление предметами",
    "subjedit.current": "Текущие предметы",
    "subjedit.add": "Добавить",
    "subjedit.remove": "Удалить",
    "subjedit.addPick": "Выберите предмет",
    "subjedit.none": "Нет предметов.",
    "subjedit.minOne": "Должен остаться хотя бы один предмет.",
    "subjedit.err.addFailed": "Не удалось добавить предмет.",
    "subjedit.err.removeFailed": "Не удалось удалить предмет.",
    "child.loginNote": "Войдите по 8-значному ID и паролю, который задал родитель.",
    "child.id": "8-значный ID",
    "child.password": "Пароль",
    "child.login": "Войти",
    "child.loggingIn": "Вход…",
    "child.parentLogin": "Вы родитель? Войдите здесь",
    "child.logout": "Выйти",
    "child.hello": "Привет",
    "child.contentTitle": "Ваше обучение",
    "child.contentSoon":
      "Ежедневные задания, тесты и подготовка к олимпиадам появятся здесь скоро.",
    "child.locked.inactive": "Активной подписки пока нет",
    "child.locked.locked": "Доступ приостановлен",
    "child.locked.expired": "Подписка истекла",
    "child.lockedNote":
      "Попросите родителя активировать подписку на предмет, чтобы начать учиться.",
    "child.noSubjects": "Предметов пока нет — попросите родителя добавить.",
    "practice.title": "Практика",
    "practice.start": "Практика",
    "practice.questions": "вопросов",
    "practice.submit": "Отправить ответы",
    "practice.submitting": "Отправка…",
    "practice.result": "Ваш результат",
    "practice.back": "Назад к панели",
    "practice.error": "Что-то пошло не так. Попробуйте снова.",
    "oly3.parentTitle": "Олимпиадные пакеты",
    "oly3.none": "Сейчас нет доступных пакетов.",
    "oly3.owned": "Куплено",
    "oly3.buy": "Купить",
    "oly3.childTitle": "Мои олимпиады",
    "oly3.childNone": "Олимпиадных пакетов пока нет — попросите родителя купить.",
    "oly3.start": "Начать",
    "oly5.continueTitle": "У тебя есть незавершённая попытка олимпиады",
    "oly5.noticeClosed": "Эта попытка олимпиады уже закрыта — она была отменена или время вышло.",
    "oly5.errNoAccess": "У тебя нет доступа к этой олимпиаде — попроси родителей купить её.",
    "oly5.errEmpty": "В этой олимпиаде пока нет вопросов — скоро появятся.",
    "oly5.perAttemptShort": "{n} за попытку",
    "oly5.practiceOnly":
      "Попытки олимпиад — это тренировка: они не влияют на баллы, процент и рейтинг.",
    "parent.dash.olympiads": "Олимпиады",
    "child.myOlympiads": "Мои олимпиады",
    "prog.title": "Прогресс",
    "prog.none": "Результатов пока нет.",
    "prog.recent": "Недавние результаты",
    "parent.dash.progress": "Прогресс",
    "kind.practice": "Практика",
    "kind.olympiad": "Олимпиада",
    "kind.test": "Тест",
    "kind.daily": "Ежедневное",
    "arena.brand": "OlympIQ",
    "arena.nav.arena": "Главная",
    "arena.nav.tasks": "Олимпиады",
    "arena.nav.rank": "Рейтинг",
    "arena.nav.profile": "Профиль",
    "arena.streak": "дней подряд",
    "arena.heroEyebrow": "Арена соревнований",
    "arena.heroTitle": "Берись за следующий раунд и поднимайся.",
    "arena.startRound": "Начать раунд",
    "arena.join": "Присоединиться",
    "arena.rankLabel": "Место в стране",
    "arena.statPoints": "Очки",
    "arena.statAccuracy": "Точность",
    "arena.statRounds": "Раунды",
    "arena.tickerLive": "ОНЛАЙН",
    "arena.tickerToday": "СЕГОДНЯ",
    "arena.todaysRounds": "Сегодняшние раунды",
    "arena.subjectStrength": "Сила по предметам",
    "arena.questionsShort": "вопросов",
    "arena.go": "Начать ▸",
    "arena.noStrength": "Данных пока нет — пройдите раунд.",
    "arena.recentRounds": "Недавние раунды",
    "arena.lb.title": "Таблица лидеров",
    "arena.lb.eyebrow": "Лидеры",
    "arena.lb.country": "Страна",
    "arena.lb.region": "Регион",
    "arena.lb.school": "Школа",
    "arena.lb.grade": "Класс",
    "arena.lb.colRank": "Место",
    "arena.lb.colParticipant": "Участник",
    "arena.lb.colAccuracy": "Точность",
    "arena.lb.colPoints": "Очки",
    "arena.lb.you": "Вы",
    "arena.lb.soon": "Полная таблица лидеров скоро откроется — пока показываем ваш результат.",
    "arena.lb.empty": "Пройдите первый раунд, чтобы попасть в таблицу лидеров.",
    // — L1: real leaderboard (lb.*) —
    "lb.title": "Таблица лидеров",
    "lb.eyebrow": "Лидеры",
    "lb.board.points": "Очки",
    "lb.board.percent": "Процент",
    "lb.board.streak": "Серия",
    "lb.scope.global": "Общий",
    "lb.scope.subject": "Предмет",
    "lb.scope.grade": "Класс",
    "lb.scope.city": "Город",
    "lb.scope.school": "Школа",
    "lb.period.month": "Этот месяц",
    "lb.period.all": "За всё время",
    "lb.colRank": "Место",
    "lb.colStudent": "Участник",
    "lb.colPoints": "Очки",
    "lb.colPercent": "Процент",
    "lb.colStreak": "Серия",
    "lb.you": "Вы",
    "lb.colCity": "Город",
    "lb.colSchool": "Школа",
    "lb.colGrade": "Класс",
    "lb.subjectLabel": "Предмет",
    "lb.days": "дн.",
    "lb.pointsUnit": "очк.",
    "lb.empty.month": "В этом месяце ещё никто не показал результат — станьте первым!",
    "lb.empty.all": "Пока никто не показал результат — станьте первым!",
    "lb.empty.streak": "Пока ни у кого нет серии — начните сегодня!",
    "lb.myRank.title": "Ваше место",
    "lb.myRank.none": "Вы пока не в рейтинге — завершите свой первый раунд!",
    "lb.provisional": "Предварительно",
    "lb.provisionalHint": "Для официального места нужно минимум {n} раундов.",
    "lb.myRank.provisional": "Результат предварительный — {a}/{n} раундов для официального места.",
    "lb.streak.current": "Текущая серия",
    "lb.streak.best": "Рекорд",
    "lb.streak.active": "Сегодня серия в безопасности — так держать!",
    "lb.streak.atRisk": "Осталось около {h} ч, чтобы сохранить серию!",
    "lb.streak.lost": "Серия обнулилась — начните сегодня заново!",
    "plb.title": "Рейтинг",
    "plb.seeFull": "Открыть весь рейтинг",
    "plb.rankThisMonth": "Место за месяц",
    "plb.rankAllTime": "Место за всё время",
    "plb.points": "Очки",
    "plb.pointsMonth": "Очки за месяц",
    "plb.pointsAllTime": "Очки за всё время",
    "plb.pct": "Процент",
    "plb.pctMonth": "Процент за месяц",
    "plb.pctAllTime": "Общий процент",
    "plb.provisionalShort": "Предварительный результат",
    "plb.pts": "очк.",
    "plb.streak": "Серия",
    "plb.currentStreak": "Текущая серия",
    "plb.bestStreak": "Лучшая серия",
    "plb.best": "рекорд",
    "plb.notRanked": "Ты ещё не в рейтинге — заверши тест и попади в таблицу!",
    "plb.notRankedShort": "Пока не в рейтинге",
    "plb.improvementTitle": "Рейтинг и прогресс",
    "plb.improvementSub": "Место этого ребёнка в рейтинге и прогресс серии.",
    "plb.emptyTitle": "Пока нет активности в рейтинге.",
    "plb.emptySub": "Когда ребёнок начнёт набирать очки, здесь появятся его место и серия.",
    "arena.quizPrev": "Назад",
    "arena.quizConfirm": "Подтвердить",
    "arena.quizQuestion": "Вопрос",
    "arena.quizOf": "/",
    "auth.tab.student": "Ученик",
    "auth.tab.parent": "Родитель",
    "auth.brandTagline": "Арена подготовки к олимпиадам — один раунд в день.",

    // — Cross-cutting (theme + password visibility + nav) —
    "theme.toggle": "Тема",
    "theme.light": "Светлая",
    "theme.dark": "Тёмная",
    "auth.showPassword": "Показать пароль",
    "auth.hidePassword": "Скрыть пароль",

    // — Round3 D — auth placeholders + existence errors —
    "parent.auth.emailPh": "you@example.com",
    "parent.auth.passwordPh": "••••••••",
    "parent.auth.firstNamePh": "Ваше имя",
    "parent.auth.lastNamePh": "Ваша фамилия",
    "parent.err.emailExists":
      "Эта эл. почта уже зарегистрирована. Войдите или сбросьте пароль.",
    "parent.err.noAccount": "Аккаунт с этой эл. почтой не найден. Сначала зарегистрируйтесь.",
    "parent.err.incompleteAccount":
      "Аккаунт настроен не полностью. Попробуйте ещё раз через минуту; если проблема повторяется, напишите в поддержку.",
    "parent.err.staffAccount":
      "Этот адрес принадлежит административному аккаунту. Для родительской панели создайте отдельный аккаунт.",
    "parent.err.wrongPassword": "Неверный пароль. Попробуйте снова.",

    // — Round3 D — Add-child wizard (used by D2) —
    "addchild.step.info": "Данные",
    "addchild.step.subjects": "Предметы",
    "addchild.step.plan": "План",
    "addchild.step.payment": "Оплата",
    "addchild.step.done": "Готово",
    "addchild.field.city": "Город",
    "addchild.field.school": "Школа",
    "addchild.field.grade": "Класс",
    "addchild.field.selectCity": "Выберите город",
    "addchild.field.selectSchool": "Выберите школу",
    "addchild.field.selectGrade": "Выберите класс",
    "addchild.field.cityFirst": "Сначала выберите город",
    "addchild.field.privateSchools": "Частные школы",
    "addchild.field.publicSchools": "Государственные школы",
    "addchild.err.cityRequired": "Выберите город.",
    "addchild.err.schoolRequired": "Выберите школу.",
    "addchild.err.gradeRequired": "Выберите класс.",
    "addchild.field.district": "Район",
    "addchild.field.selectDistrict": "Выберите район",
    "addchild.field.noDistricts": "Для этого города районы не заданы",
    "addchild.err.districtRequired": "Выберите район.",
    "subj.math": "Математика",
    "subj.az_language": "Азербайджанский язык",
    "subj.english": "Английский язык",
    "subj.informatics": "Информатика",
    "subj.science": "Естественные науки",
    "subj.logic": "Логика",
    "addchild.next": "Далее",
    "addchild.back": "Назад",
    "addchild.createChild": "Создать ребёнка",
    "addchild.summary": "Итог",

    // — Payment confirmation (Add-Child step 4 + the plan-change sheet) —
    "pay.title": "Оплата",
    "pay.note":
      "Подтвердите сумму ниже — подписка начнётся сразу, и для ребёнка будет создан ID для входа.",
    "pay.payNow": "Оплатить",
    // Migration 125 — the plan-change sheet leads to the bank, so its primary
    // button says so. `pay.payNow` stays for the add-child wizard only.
    "pay.continue": "Перейти к оплате",
    "pay.processing": "Обработка…",
    "pay.success": "Оплата прошла успешно",
    "pay.idRevealed": "8-значный ID для входа вашего ребёнка создан.",
    "pay.subtotal": "Промежуточный итог",
    "pay.discount": "Скидка",
    "pay.total": "Итого",

    // — Pricing (placeholder figures) —
    "pricing.intro":
      "Простая цена за каждый предмет — для каждого ребёнка. Добавляйте сколько угодно предметов: итог рассчитывается автоматически.",
    "pricing.subjectsNote":
      "Цена — за предмет и за ребёнка. Математику, науку, логику и английский можно выбирать по отдельности.",
    "pricing.perChild": "за ребёнка",
    "pricing.plan.weekly.name": "Еженедельно",
    "pricing.plan.weekly.price": "≈ {price} AZN",
    "pricing.plan.weekly.unit": "в неделю / предмет",
    "pricing.plan.weekly.note": "Удобно, чтобы попробовать на короткий срок.",
    "pricing.plan.weekly.save": "",
    "pricing.plan.monthly.name": "Ежемесячно",
    "pricing.plan.monthly.price": "≈ {price} AZN",
    "pricing.plan.monthly.unit": "в месяц / предмет",
    "pricing.plan.monthly.note": "Самый популярный вариант — для регулярного обучения.",
    "pricing.plan.monthly.save": "Выгоднее недельного плана",
    "pricing.plan.yearly.name": "Ежегодно",
    "pricing.plan.yearly.price": "≈ {price} AZN",
    "pricing.plan.yearly.unit": "в год / предмет",
    "pricing.plan.yearly.note": "Самая выгодная цена на весь год.",
    "pricing.plan.yearly.save": "Выгоднее месячного плана",
    "pricing.trialLine": "Каждый новый предмет начинается с 7-дневного бесплатного периода — оплата не списывается до его окончания.",
    "pricing.siblingTitle": "Автоматическая скидка за нескольких детей",
    "pricing.siblingBody":
      "Когда вы добавляете больше одного ребёнка, скидка применяется автоматически: −10% за 2-го ребёнка и −15% за 3-го и последующих. Промокод не нужен.",
    "pricing.disclaimer":
      "Примечание: указанные цены ориентировочные и не являются окончательными. Итоговые цены будут подтверждены платформой.",

    // — About (official multi-section) —
    "about.mission.title": "Наша миссия",
    "about.mission.body":
      "OlympIQ создан, чтобы помочь ученикам 1–11 классов по всему Азербайджану заложить прочную академическую базу и уверенно готовиться к олимпиадам. Наша цель — сделать качественную, регулярную и измеримую подготовку доступной каждой семье.",
    "about.offer.title": "Что предлагает платформа",
    "about.offer.body":
      "Детские аккаунты под управлением родителя, подписки на отдельные предметы (математика, наука, логика и английский), разовые пакеты подготовки к олимпиадам с пожизненным доступом, ежедневная практика и отслеживание прогресса — всё в одном месте. Весь интерфейс работает на трёх языках: азербайджанском, английском и русском.",
    "about.audience.title": "Для кого это",
    "about.audience.body":
      "Платформа предназначена для учеников 1–11 классов в Азербайджане и их родителей. Родитель создаёт аккаунт и управляет им, а ребёнок просто входит по 8-значному ID и начинает учиться.",
    "about.trust.title": "Доверие и прозрачность",
    "about.trust.body":
      "Вопросы подбираются на сервере по классу, результаты показываются прозрачно, а оплату совершает только родитель безопасным, проверенным способом. Данные детей защищены и никогда не используются в маркетинговых целях.",

    // — FAQ (extended) —
    "faq.q6": "Как работает 7-дневный бесплатный период?",
    "faq.a6":
      "За каждый новый предмет, выбранный на платформе, ученик получает 7-дневный бесплатный пробный период. Во время пробного периода оплата не списывается. После его окончания начинается оплата за выбранный период.",
    "faq.q7": "Есть ли скидка для 2 и более детей из одной семьи?",
    "faq.a7":
      "Да. Скидка для братьев и сестёр применяется автоматически: 10% на 2-го ребёнка и 15% на 3-го и последующих детей. Никакой код вводить не нужно — система рассчитывает всё сама.",
    "faq.q8": "Как проходят тесты?",
    "faq.a8":
      "Вопросы для каждого теста подбираются на сервере случайным образом (олимпиадная попытка состоит из 25 вопросов). Ученик не выбирает сложность сам — это обеспечивает честную и объективную оценку.",
    "faq.q9": "Как защищены наши данные?",
    "faq.a9":
      "Личные данные хранятся безопасно и используются только для работы сервиса. Аккаунты детей привязаны к родителю, а дети не вводят эл. почту и платёжные данные. Данные платформы не передаются третьим лицам.",
    "faq.q10": "Какие языки поддерживаются? Как с вами связаться?",
    "faq.a10":
      "Платформа работает на азербайджанском (основной), английском и русском языках. По вопросам и за поддержкой свяжитесь с нами по эл. почте или WhatsApp — см. страницу «Контакты».",

    // — Contact (details) —
    "contact.address": "Адрес",
    "contact.addressValue": "Дом Правительства, Баку, Азербайджан",
    "contact.emailLabel": "Эл. почта поддержки",
    "contact.phoneLabel": "Телефон",
    "contact.whatsappLabel": "WhatsApp",
    "maintenance.title": "Идут технические работы",
    "maintenance.body":
      "Сайт временно недоступен из-за технического обслуживания. Пожалуйста, зайдите чуть позже.",
    "contact.mapsCaption": "Дом Правительства, Баку — наше расположение на карте.",
    "contact.shortNote":
      "Обычно отвечаем в рабочие дни. Пишите нам по вопросам, предложениям или за технической поддержкой.",
    // The two labelled purposes on the redesigned contact card. contact.emailLabel
    // and contact.shortNote above are KEPT: the mobile contact screen still
    // renders both, and this redesign is web-only.
    "contact.generalTitle": "Вопросы и предложения",
    "contact.generalDesc":
      "Вопросы о сервисе и ценах, сотрудничество, предложения и отзывы.",
    "contact.supportTitle": "Техническая поддержка",
    "contact.supportDesc":
      "Ошибки на платформе, проблемы со входом или с оплатой.",
    "contact.responseTime": "Ваш запрос будет рассмотрен в течение 24 часов.",

    // — Footer —
    "footer.tagline": "Портал подготовки к олимпиадам для 1–11 классов",
    "footer.product": "Сервис",
    "footer.company": "Компания",
    "footer.legal": "Правовая информация",

    // ---- Privacy policy (privacy.*) — формат описан в блоке az ----
    "nav.privacy": "Политика конфиденциальности",
    "privacy.title": "Политика конфиденциальности",
    "privacy.eyebrow": "Правовой документ",
    "privacy.lead":
      "Эта политика распространяется на сайт OlympIQ и на мобильное приложение OlympIQ для iOS и Android.\n\n" +
      "OlympIQ — образовательный продукт для школьников 1–11 классов. Поскольку мы работаем с данными детей, мы стараемся говорить коротко и честно.",
    "privacy.effective": "Дата вступления в силу",
    "privacy.updated": "Последнее обновление",
    "privacy.tbd": "уточняется",
    "privacy.toc": "Разделы",
    "privacy.draft.title": "Документ находится в подготовке",
    "privacy.draft.body":
      "Текст написан на основе того, как продукт работает на самом деле, но он ещё не проверен юристом, и дата вступления в силу не назначена. Часть сведений — контактные адреса, сроки хранения, регион расположения серверов и правовой статус оператора персональных данных — пока уточняется.",

    "privacy.s1.title": "Коротко и по существу",
    "privacy.s1.doTitle": "Что мы делаем",
    "privacy.s1.do":
      "Мы собираем только то, без чего аккаунт не работает: контактные данные родителя, имя ребёнка, школу, класс и результаты его занятий.\n" +
      "Профиль ребёнка создаёт и контролирует родитель. Ребёнок не может зарегистрироваться сам.\n" +
      "Родитель в любой момент может удалить весь семейный аккаунт прямо из приложения.",
    "privacy.s1.dontTitle": "Чего мы не делаем никогда",
    "privacy.s1.dont":
      "Никакой рекламы. В приложении нет ни рекламной сети, ни рекламного SDK.\n" +
      "Никакой слежки. Ни в мобильном приложении, ни на сайте нет сторонних инструментов аналитики, атрибуции или сбора отчётов о сбоях. Рекламный идентификатор (IDFA, Android Advertising ID) не считывается никогда.\n" +
      "Мы не продаём, не сдаём в аренду и не обмениваем ваши данные и не передаём их никому в маркетинговых целях.\n" +
      "Мы не запрашиваем геолокацию, камеру, контакты и микрофон.\n" +
      "Мы не строим рекламные профили на основе поведения ребёнка.\n" +
      "Мы не видим данные вашей карты. В мобильном приложении нет оформления покупки — покупки совершаются только на сайте.",

    "privacy.s2.title": "Кто мы и как с нами связаться",
    "privacy.s2.product": "Продукт",
    "privacy.s2.productValue":
      "OlympIQ — платформа подготовки к олимпиадам и экзаменам для 1–11 классов",
    "privacy.s2.operator": "Проект реализует",
    "privacy.s2.operatorValue": "Камиль Пириев (ИНН / VÖEN: 6300091352) и его партнёры",
    "privacy.s2.address": "Юридический адрес",
    "privacy.s2.addressValue": "Азербайджанская Республика, Лерикский район, село Пештатюк",
    "privacy.s2.email": "Эл. почта поддержки",
    "privacy.s2.phone": "Телефон",
    "privacy.s2.website": "Сайт",
    "privacy.s2.requests": "Адрес для запросов о персональных данных",
    "privacy.s2.note":
      "По любому вопросу, жалобе или запросу на удаление данных пишите на адрес выше.",

    "privacy.s3.title": "Модель семейного аккаунта",
    "privacy.s3.intro":
      "Модель аккаунта в OlympIQ устроена необычно, и сделано это именно ради безопасности детей.",
    "privacy.s3.points":
      "Зарегистрироваться может только родитель — по электронной почте и паролю.\n" +
      "Ребёнок не может зарегистрироваться сам. Ни на сайте, ни в приложении для ребёнка нет пути регистрации. Это осознанное решение, и оно контролируется на сервере.\n" +
      "Профиль ребёнка создаёт родитель и сам вводит все данные о нём: имя, фамилию, город, район, школу и класс.\n" +
      "У ребёнка нет адреса электронной почты. Внутри системы для входа ребёнка используется технический адрес, который не принимает почту; ребёнок его не видит и не использует.\n" +
      "Ребёнок входит по 8-значному номеру, который выдаёт наш сервер, и паролю, который задаёт родитель.\n" +
      "Ребёнок не может ничего купить. Это обеспечивается на сервере, а не просто скрыто в интерфейсе.\n" +
      "Ребёнок не может ничего удалить. Владельцем аккаунта всей семьи является родитель, и право удаления принадлежит ему.",
    "privacy.s3.result":
      "Итог: родитель решает, какие данные о ребёнке вообще существуют, и может удалить их полностью в любой момент.",

    "privacy.s4.title": "Какие данные мы собираем",
    "privacy.s4.parentTitle": "Аккаунт родителя",
    "privacy.s4.parentTable":
      "Данные | Обязательно? | Зачем\n" +
      "Имя (отображаемое) | Да | Чтобы опознать аккаунт и обращаться к вам в приложении\n" +
      "Адрес электронной почты | Да | Логин для входа; восстановление пароля; уведомления об аккаунте\n" +
      "Номер телефона (в международном формате) | Да | Связь по вопросам аккаунта и его восстановление. Мы не отправляем SMS — функции SMS в продукте нет вообще\n" +
      "Пароль | Да | Для входа. Мы не храним ваш пароль: он хранится только в нашем сервисе аутентификации в виде хеша, который невозможно прочитать обратно\n" +
      "Язык интерфейса (az / en / ru) | Нет | Чтобы показывать приложение на вашем языке\n" +
      "Фото профиля (аватар) | Нет | Только для внешнего вида. Этот файл попадает в общедоступное хранилище — см. «Фотографии-аватары»\n" +
      "Настройки уведомлений | Нет | Чтобы запомнить, по каким каналам вы хотите получать уведомления\n" +
      "Понравившиеся новости | Нет | Запись о вашем лайке под статьёй",
    "privacy.s4.parentNote":
      "Родитель может изменить в приложении имя, телефон, пароль и аватар. Адрес электронной почты в приложении изменить нельзя — для этого напишите нам.",
    "privacy.s4.childTitle": "Профиль ребёнка (ученика) — данные вводит родитель",
    "privacy.s4.childTable":
      "Данные | Обязательно? | Зачем\n" +
      "Имя и фамилия | Да | Чтобы обращаться к ребёнку в приложении; в таблице лидеров отображается как «Имя Ф.»\n" +
      "Город и район | Да | Для региональных таблиц лидеров\n" +
      "Название школы | Да | Для школьной таблицы лидеров\n" +
      "Класс | Да | Чтобы ребёнку выдавались вопросы для его класса\n" +
      "8-значный номер для входа | Выдаёт сервер | Логин ребёнка. Последние 4 цифры этого номера показываются в публичной таблице лидеров\n" +
      "Пароль | Да (задаёт родитель) | Для входа. Хранится только в сервисе аутентификации в виде хеша\n" +
      "Аватар | Нет | Готовое изображение или загруженное фото. Фото всегда хранится в закрытом хранилище — см. «Фотографии-аватары»\n" +
      "Выбор цвета и стикеров | Нет | Оформление, выбранное ребёнком\n" +
      "Учебные данные | Автоматически | Отвеченные вопросы, выбранные варианты, верные и неверные ответы, время на вопрос, баллы, проценты, серии, активные дни, место в рейтинге, достижения\n" +
      "Уже показанные олимпиадные вопросы | Автоматически | Чтобы один и тот же вопрос не повторялся\n" +
      "Настройки уведомлений и понравившиеся новости | Нет | То же, что и в аккаунте родителя",
    "privacy.s4.childNoDob":
      "Мы не собираем дату рождения и год рождения. Возраст ребёнка мы не спрашиваем — достаточно класса.",
    "privacy.s4.childEditable":
      "Сам ребёнок может изменить только следующее: своё имя и фамилию (это меняет и подпись в таблице лидеров), пароль, аватар и выбор цвета. Школа, город, район и класс доступны ребёнку только для чтения — изменить их может только родитель.",
    "privacy.s4.techTitle": "Технические данные и данные устройства",
    "privacy.s4.techTable":
      "Данные | Когда | Зачем\n" +
      "Токен push-уведомлений, название модели устройства, версия ОС и версия приложения | Только если push-уведомления включены и вы дали разрешение | Чтобы доставить уведомление на нужное устройство. Никакие рекламные и аппаратные идентификаторы не считываются. При выходе из аккаунта токен удаляется с сервера\n" +
      "Журнал попыток входа ребёнка: 8-значный номер, хеш IP-адреса (SHA-256), результат и время | При каждой попытке входа | Чтобы предотвратить подбор пароля. Сам IP-адрес не сохраняется\n" +
      "Журналы сервера — включая IP-адрес и строку браузера | При каждом запросе | Стандартные технические журналы наших хостинг-провайдеров, для безопасности и устранения неполадок\n" +
      "Записи о входах в сервисе аутентификации | При каждом входе | Наш сервис аутентификации ведёт собственный журнал безопасности",
    "privacy.s4.logRetention": "Срок хранения журналов сервера",
    "privacy.s4.deviceTitle":
      "Что хранится в защищённом хранилище устройства (мобильное приложение)",
    "privacy.s4.deviceIntro":
      "Мобильное приложение хранит в защищённом хранилище устройства (iOS Keychain / Android Keystore) только:",
    "privacy.s4.deviceList":
      "вашу сессию входа;\n" +
      "включена ли блокировка по отпечатку или лицу (буквально «1» или «0»);\n" +
      "показывался ли приветственный экран;\n" +
      "копию push-токена;\n" +
      "выбранный язык и тему (светлая или тёмная).",
    "privacy.s4.deviceNote":
      "Настройки из этого списка (блокировка, приветственный экран, язык и тема) устройство не покидают вообще. Сессия входа передаётся нашему сервису аутентификации при каждом запросе — в этом её назначение, — а push-токен, пока push включён, хранится на нашем сервере (см. таблицу технических данных выше). Больше ничего не передаётся.",
    "privacy.s4.cookiesTitle": "Файлы cookie — сайт",
    "privacy.s4.cookiesIntro":
      "На сайте используются только строго необходимые файлы cookie:",
    "privacy.s4.cookiesList":
      "Cookie сессии — чтобы вы оставались в аккаунте, пока находитесь на сайте.\n" +
      "Cookie «locale» — чтобы запомнить выбранный язык интерфейса (1 год).\n" +
      "Выбор светлой или тёмной темы хранится в локальном хранилище самого браузера.\n" +
      "Кратковременная отметка в сессионном хранилище браузера — чтобы просмотр одной и той же новости не засчитывался дважды. Она удаляется при закрытии вкладки.",
    "privacy.s4.cookiesNote":
      "Рекламных cookie, аналитических cookie и трекинговых пикселей нет.",

    "privacy.s5.title": "Данные детей",
    "privacy.s5.callout":
      "Этот раздел является политикой конфиденциальности OlympIQ в отношении детей. Поскольку наш продукт предназначен для несовершеннолетних, мы выносим его отдельно, чтобы родитель видел всё в одном месте.",
    "privacy.s5.storedTitle": "Что хранится о ребёнке",
    "privacy.s5.stored":
      "Всё, что указано в таблице «Профиль ребёнка» выше: имя, фамилия, город, район, школа, класс, 8-значный номер для входа, выбранный аватар и оформление, а также результаты занятий (ответы, баллы, проценты, серии, активные дни, место в рейтинге).",
    "privacy.s5.notCollected":
      "Что мы о ребёнке не собираем: дату рождения, адрес электронной почты, номер телефона, домашний адрес, геолокацию, данные о здоровье, финансовые данные, контакты, историю браузера, рекламные и аппаратные идентификаторы.",
    "privacy.s5.neverTitle": "Чего мы никогда не делаем с данными ребёнка",
    "privacy.s5.never":
      "Мы не показываем ребёнку рекламу и не строим рекламные профили.\n" +
      "Мы не отслеживаем поведение ребёнка в других приложениях и на других сайтах.\n" +
      "Мы не продаём, не сдаём в аренду и не передаём данные детей в маркетинговых целях.\n" +
      "Мы не публикуем ничего из написанного ребёнком, за одним исключением — это его собственные имя и фамилия. Ученик может изменить их сам, и именно это имя отображается в таблице лидеров как «Имя Ф.». Никакого другого свободного текста ребёнок другим пользователям показать не может.\n" +
      "В приложении нет чата, сообщений, комментариев и форума. Ребёнок не может общаться с другими пользователями.\n" +
      "Мы никогда не побуждаем ребёнка что-либо покупать. В сессии ученика не отображаются ни цены, ни способы оплаты, ни кнопки покупки.",
    "privacy.s5.lbTitle": "Что видно в таблицах лидеров и кому",
    "privacy.s5.lbIntro":
      "Это один из важнейших моментов, который родителю нужно понимать. Таблиц лидеров две, и они разные.",
    "privacy.s5.lb1Title":
      "1) Таблица лидеров внутри приложения — видна только пользователям с аккаунтом",
    "privacy.s5.lb1Intro":
      "Любой вошедший в систему родитель и любой вошедший ученик видит о каждом ребёнке в рейтинге следующее:",
    "privacy.s5.lb1Table":
      "Отображается | Пример\n" +
      "Имя и первая буква фамилии | Айсель М.\n" +
      "Город | Баку\n" +
      "Район | Насими\n" +
      "Название школы | Средняя школа № 142\n" +
      "Класс | 7\n" +
      "Показатели результата | процент, количество отвеченных вопросов, количество верных ответов, количество попыток",
    "privacy.s5.lb1Note":
      "Полная фамилия, аватар, 8-значный номер ребёнка и контактные данные родителя не отображаются.",
    "privacy.s5.lb2Title":
      "2) Публичная десятка на главной странице сайта — видна всем, даже без аккаунта",
    "privacy.s5.lb2Body":
      "Здесь имя ребёнка не показывается; вместо него отображается псевдоним вида «Şagird 4821». Эти четыре цифры — последние четыре цифры 8-значного номера ребёнка для входа. Кроме псевдонима, эта публичная таблица показывает также город, район, название школы и класс.",
    "privacy.s5.lbWarn":
      "Честное предупреждение для родителей: в небольшой районной школе сочетание школы, класса и района может оказаться достаточным, чтобы узнать ребёнка, даже без имени. Мы это не скрываем.",
    "privacy.s5.lbNoMedals":
      "В таблицах лидеров нет медалей, призов и денег — только числовые места.",
    "privacy.s5.avatarTitle": "Фотографии-аватары — важное различие",
    "privacy.s5.avatarTable":
      "Способ | Где хранится файл | Кто может увидеть\n" +
      "Родитель загружает фото для ребёнка (Добавить ребёнка / Изменить ребёнка) | Закрытое хранилище | Только члены семьи, по короткоживущей подписанной ссылке\n" +
      "Ученик сам загружает фото из своего профиля | Закрытое хранилище | Только члены семьи, по короткоживущей подписанной ссылке\n" +
      "Родитель загружает свой аватар | Открытое хранилище | Любой, у кого есть прямая ссылка на файл",
    "privacy.s5.avatarWarn":
      "Фотография ребёнка никогда не попадает в открытое хранилище: загрузил ли её родитель или ученик сделал это сам, файл записывается в закрытое хранилище и открывается только по короткоживущей подписанной ссылке, которая выдаётся членам семьи. Открытое хранилище касается лишь одного — собственного аватара родителя: его может открыть любой, у кого есть прямая ссылка на файл. Готовые аватары стоят по умолчанию, и загружать фото не требуется никогда — если вы не хотите, чтобы фотография вашего ребёнка была загружена, используйте готовый аватар.",
    "privacy.s5.avatarUnlink":
      "Удаление аватара работает по-разному в зависимости от пути. Фотография ребёнка — загруженная родителем или самим учеником — при замене или удалении полностью стирается из закрытого хранилища. Собственный аватар родителя только отвязывается: изображение перестаёт отображаться в профиле, но сам файл остаётся в открытом хранилище.",
    "privacy.s5.removeTitle": "Как родитель удаляет данные ребёнка",
    "privacy.s5.removeList":
      "Удалить весь семейный аккаунт: профиль родителя → «Опасная зона» → «Удалить аккаунт» → двухшаговое подтверждение. Это удаляет аккаунт родителя и все созданные им профили детей. Доступно и на сайте, и в мобильном приложении.\n" +
      "Удалить одного ребёнка: сейчас только на сайте, из панели родителя. В мобильном приложении отдельного удаления ребёнка нет.\n" +
      "Ученик не может удалить ничего.",
    "privacy.s5.removeNote":
      "Удаление происходит немедленно — периода ожидания, отмены и архива не предусмотрено. Что именно удаляется и что остаётся, подробно описано в разделе «Хранение и удаление данных».",

    "privacy.s6.title": "Как мы используем данные",
    "privacy.s6.useTitle": "Мы используем их, чтобы",
    "privacy.s6.use":
      "Создать аккаунт, обеспечить вход и защитить аккаунт.\n" +
      "Подобрать вопросы, соответствующие классу ребёнка и текущей школьной четверти.\n" +
      "Проверить ответы и рассчитать баллы, проценты, серии и статистику прогресса.\n" +
      "Показать родителю отчёт о прогрессе ребёнка.\n" +
      "Сформировать таблицы лидеров.\n" +
      "Отправлять уведомления (новый раунд, результат, серия, новости, сообщения об аккаунте).\n" +
      "Предотвращать злоупотребления, автоматизированные атаки и подбор паролей.\n" +
      "Оказывать поддержку и отвечать на ваши обращения.\n" +
      "Определять, к каким предметам и олимпиадным пакетам у семьи есть доступ.\n" +
      "Выполнять требования закона, когда это обязательно.",
    "privacy.s6.notTitle": "Мы не используем их, чтобы",
    "privacy.s6.not":
      "Показывать рекламу или строить рекламные профили.\n" +
      "Отслеживать вас или вашего ребёнка в других приложениях и на других сайтах.\n" +
      "Продавать данные или передавать их рекламным брокерам.\n" +
      "Принимать решения о кредитах, страховании, трудоустройстве и тому подобном.\n" +
      "Принимать автоматические решения в отношении ребёнка, имеющие юридические последствия.\n" +
      "Обучать сторонние рекламные системы или системы профилирования.",

    "privacy.s7.title": "Кому мы передаём данные",
    "privacy.s7.staffTitle": "Доступ внутри OlympIQ",
    "privacy.s7.staff":
      "Скажем об этом прямо: уполномоченные администраторы и контент-менеджеры OlympIQ могут просматривать данные аккаунтов и учебные данные во внутренней панели управления — чтобы обслуживать сервис, работать с контентом и отвечать на обращения в поддержку. Доступ ограничен ролью: в базе данных действует защита на уровне строк (RLS), и каждая внутренняя роль имеет только те права, которые нужны для её работы. Действия администраторов с аккаунтами и контентом записываются в журнал аудита.",
    "privacy.s7.intro":
      "Мы не продаём ваши данные. Перечисленные ниже поставщики услуг необходимы для работы сервиса, и каждый из них получает только то, что нужно для его функции:",
    "privacy.s7.table":
      "Поставщик услуг | Роль | Что получает | Статус\n" +
      "Supabase | База данных, аутентификация, хранение файлов | Все данные продукта, по зашифрованному соединению | Активен\n" +
      "Vercel | Хостинг сайта | Стандартные журналы запросов сервера (IP, строка браузера) | Активен\n" +
      "Expo / EAS | Обновления мобильного приложения и передача push-уведомлений | Проверка обновлений при запуске: версия приложения, платформа, анонимный идентификатор установки и ваш IP-адрес; push-токен, когда push включён | Проверка обновлений активна\n" +
      "Apple (APNs) | Доставка push на iOS | Только после включения push — стандартная передача уведомлений | До включения push не получает ничего\n" +
      "Google (FCM) | Доставка push на Android | Только после включения push — стандартная передача уведомлений | До включения push не получает ничего\n" +
      "Google Fonts | Шрифт на некоторых страницах сайта | IP-адрес и строку браузера | Активен (только сайт; в мобильном приложении отсутствует)\n" +
      "Google Maps | Карта на странице «Контакты» | IP-адрес и строку браузера в момент открытия этой страницы. Данные аккаунта не передаются | Активен\n" +
      "Платёжный провайдер | Будущая оплата на сайте | — | См. раздел «Платежи»",
    "privacy.s7.pushOff":
      "Сейчас push-уведомления не работают: функция отключена на сервере, поэтому токен устройства вообще не создаётся, и Expo, Apple и Google по этой функции не получают ничего.",
    "privacy.s7.pushOn":
      "Push-уведомления работают: для разрешённых вами устройств создаётся токен, а уведомления доставляются через Expo по сетям Apple и Google.",
    "privacy.s7.otherIntro": "Кроме этого, мы можем передать данные только:",
    "privacy.s7.other":
      "когда этого требует закон (решение суда, законный запрос уполномоченного органа);\n" +
      "чтобы предотвратить непосредственную угрозу жизни или здоровью;\n" +
      "чтобы защитить свои права и расследовать злоупотребления.",
    "privacy.s7.regionLabel": "Где расположены серверы",

    "privacy.s8.title": "Платежи",
    "privacy.s8.list":
      "Завершить покупку в мобильном приложении невозможно: в нём нет ни формы карты, ни ввода данных карты, ни шага оплаты.\n" +
      "Оплата возможна только на сайте, в браузере, в азербайджанских манатах.\n" +
      "Оплата будет проходить полным перенаправлением на собственную страницу банка. Номер карты, код CVV и другие данные карты никогда не попадут на серверы OlympIQ и у нас храниться не будут.\n" +
      "В нашей базе будут фиксироваться только сумма, валюта, статус и номер операции у провайдера.",
    "privacy.s8.statusOff":
      "Текущее состояние: платежи на платформе отключены, и ни один платёжный провайдер пока не подключён. Пока платежи отключены, цены не показываются ни в одном разделе мобильного приложения.",
    "privacy.s8.statusOn":
      "Текущее состояние: платежи работают и проходят только на сайте, через собственную платёжную страницу банка. Мобильное приложение может показывать цены подписки для информации родителю или посетителю без аккаунта; в сессии ученика цены не показываются никогда, и завершить покупку внутри приложения нельзя.",

    "privacy.s9.title": "Хранение и удаление данных",
    "privacy.s9.activeTitle": "Пока аккаунт активен",
    "privacy.s9.activeBody":
      "Данные аккаунта и результаты занятий хранятся, пока существует аккаунт, — потому что они и есть сам продукт: графики прогресса, серии и рейтинг построены именно на них.",
    "privacy.s9.notifRetention":
      "Прочитанные уведомления удаляются автоматически — в настоящее время через 180 дней, — а папка уведомлений каждого пользователя сейчас ограничена 500 записями. Оба значения являются настройками платформы и могут быть изменены.",
    "privacy.s9.otherRetention":
      "Срок хранения учебных данных, журналов аудита и журналов попыток входа",
    "privacy.s9.howTitle": "Как удалить аккаунт",
    "privacy.s9.howBody":
      "В мобильном приложении или на сайте: войдите как родитель, нажмите на аватар вверху, откройте «Профиль», прокрутите до раздела «Опасная зона» и выберите «Удалить аккаунт». Потребуется двухшаговое подтверждение.",
    "privacy.s9.howNote":
      "Операция выполняется немедленно и не может быть отменена. Если из-за технического сбоя удаление не завершится, напишите на указанный выше адрес — мы завершим его вручную.",
    "privacy.s9.erasedTitle": "Что удаляется",
    "privacy.s9.erasedIntro": "При удалении аккаунта родителя удаляется всё перечисленное:",
    "privacy.s9.erased":
      "профиль родителя и его учётная запись для входа;\n" +
      "все профили детей, созданные родителем, и их учётные записи;\n" +
      "8-значные номера и записи об их выдаче;\n" +
      "все попытки, ответы, баллы, проценты, серии, активные дни и достижения;\n" +
      "записи в таблицах лидеров и данные о том, какие олимпиадные вопросы уже показывались;\n" +
      "подписки, права доступа, записи о скидках и промокодах;\n" +
      "уведомления, настройки уведомлений и push-токены;\n" +
      "записи о понравившихся новостях.",
    "privacy.s9.survivesTitle": "Что остаётся после удаления",
    "privacy.s9.survivesIntro":
      "Следующее сохраняется намеренно или остаётся по техническим причинам:",
    "privacy.s9.survivesTable":
      "Что остаётся | Зачем | Остаются ли персональные данные?\n" +
      "Записи о платежах и покупках | Бухгалтерские и налоговые обязательства | Обезличиваются: связь с человеком удаляется, остаются только сумма, валюта, статус и дата\n" +
      "Записи аудита о действиях с аккаунтом (регистрация, создание профиля ребёнка, сброс паролей, события подписок и покупок, а также само удаление) | Журнал безопасности | Связь с человеком удаляется. В этих записях не хранятся ни имя, ни IP-адрес, ни строка браузера\n" +
      "Замороженные архивы рейтингов (итоги сезона и месяца) | Историческая запись прошлых результатов | В архиве сезона может остаться подпись «Имя Ф.» и внутренний идентификатор\n" +
      "Загруженные файлы аватаров и записи о них | Техническая причина | Да — удаление аккаунта стирает записи в базе данных, но не сами файлы; это касается и открытого, и закрытого хранилища\n" +
      "Журнал попыток входа ребёнка (8-значный номер, хеш IP, время) | Безопасность | Да, остаётся\n" +
      "Исходные уведомления об оплате, полученные от банка (только после подключения платёжного провайдера — сейчас он не подключён) | Финансовая сверка | Хранятся в том виде, в каком их присылает банк, с привязкой к номеру операции провайдера. В них может быть то, что включает сам банк, — например имя плательщика или маскированный номер карты",
    "privacy.s9.backupNote":
      "Резервные копии хранятся для восстановления после сбоев, и удалённые данные какое-то время могут в них оставаться.",
    "privacy.s9.backupLabel": "Срок хранения резервных копий",
    "privacy.s9.copyTitle": "Как получить копию своих данных",
    "privacy.s9.copyBody":
      "Кнопки «скачать мои данные» в приложении сейчас нет. Если вам нужна копия данных вашей семьи, напишите на указанный выше адрес — мы ответим на ваш запрос.",

    "privacy.s10.title": "Безопасность",
    "privacy.s10.intro": "Ниже перечислено то, что действительно реализовано:",
    "privacy.s10.list":
      "Весь трафик шифруется (HTTPS/TLS). На сайте включён HSTS; в приложении для iOS незашифрованные соединения запрещены полностью.\n" +
      "Мы не храним пароли. Пароли и родителей, и детей хранятся только в нашем сервисе аутентификации в виде хеша. В нашей базе данных нет колонки для пароля.\n" +
      "В базе данных включена защита на уровне строк (RLS): ученик видит только свою запись, а родитель — только записи своих детей.\n" +
      "В мобильном приложении нет ни одного привилегированного ключа. Привилегированные операции выполняются только на сервере.\n" +
      "Токены сессии хранятся в защищённом хранилище самого устройства (iOS Keychain / Android Keystore), а не в обычном файле или открытом хранилище.\n" +
      "Блокировка входа ребёнка: после 8 неудачных попыток за 15 минут номер временно блокируется. IP-адрес записывается в виде хеша, а не в исходном виде.\n" +
      "Страницы входа, регистрации и восстановления пароля родителя ограничены по частоте запросов.\n" +
      "Загружаемые изображения проверяются по фактическому содержимому файла, а не по его имени. Допустимые форматы: PNG, JPEG и WebP; GIF дополнительно принимается для собственного аватара родителя, но никогда — для фотографии ребёнка, кто бы её ни загружал. Максимальный размер — 2 МБ. Формат SVG запрещён полностью.\n" +
      "Блокировка по отпечатку или лицу: ваше устройство сообщает нам только «подтверждено» или «не подтверждено». Биометрические данные никогда не покидают устройство и нам не передаются — мы храним только то, включена блокировка или нет.\n" +
      "Действия администраторов записываются в журнал аудита.",
    "privacy.s10.caveat":
      "При этом будем честны: ни одна система в интернете не защищена на 100%. Мы принимаем разумные технические и организационные меры, но не можем гарантировать абсолютную безопасность. Никому не сообщайте свой пароль.",

    "privacy.s11.title": "Ваши права и как ими воспользоваться",
    "privacy.s11.table":
      "Что вы хотите сделать | Как\n" +
      "Изменить имя, телефон, пароль или аватар родителя | В приложении: страница профиля\n" +
      "Изменить адрес электронной почты родителя | В приложении невозможно — напишите нам\n" +
      "Изменить имя, город, район, школу или класс ребёнка | В приложении: родитель, затем «Изменить данные ребёнка»\n" +
      "Сбросить пароль ребёнка | В приложении: родитель, затем «Изменить данные ребёнка»\n" +
      "Изменить или удалить аватар ребёнка | В приложении: профиль родителя или ученика\n" +
      "Отключить уведомления | Настройки уведомлений в приложении, а также системные настройки устройства\n" +
      "Удалить одного ребёнка | На сайте: панель родителя\n" +
      "Удалить весь семейный аккаунт | В приложении и на сайте: профиль, затем «Опасная зона»\n" +
      "Получить копию своих данных | Напишите нам\n" +
      "Пожаловаться или задать вопрос | Напишите нам",
    "privacy.s11.note":
      "В зависимости от страны проживания у вас могут быть дополнительные права.",

    "privacy.s12.title": "Разрешения устройства",
    "privacy.s12.table":
      "Разрешение | Когда запрашивается | Для чего\n" +
      "Медиатека (фото) | Только когда вы нажимаете «изменить аватар» | Чтобы выбрать фото профиля. Готовые аватары стоят по умолчанию — загружать фото не обязательно\n" +
      "Уведомления | Только после входа в аккаунт и только если функция включена | Для новых раундов, результатов, серий и сообщений об аккаунте. Никогда для рекламы. Если вы откажете, повторно запрос не появится\n" +
      "Отпечаток пальца / Face ID | Только если вы сами включите блокировку приложения | Чтобы открывать приложение без ввода пароля. Для включения и выключения блокировки требуется успешная проверка",
    "privacy.s12.never":
      "Мы никогда не запрашиваем у вас: камеру, геолокацию, контакты, микрофон, календарь, данные о здоровье, Bluetooth и разрешение на отслеживание (App Tracking Transparency). Приложение никогда не открывает камеру, и сделать фото в нём невозможно. Честное примечание для Android: используемый нами компонент выбора фото объявляет разрешения на камеру и хранилище в собственном манифесте, поэтому вы можете увидеть их в списке на экране «О приложении» — приложение ими не пользуется и запрос камеры вам не показывает.",

    "privacy.s13.title": "Изменения в этой политике",
    "privacy.s13.body":
      "Мы можем обновлять эту политику. При обновлении мы изменим дату «Последнее обновление» вверху. Если изменение существенное, мы сообщим об этом в приложении или по электронной почте. Продолжая пользоваться сервисом после вступления изменений в силу, вы принимаете обновлённую политику.",
    "privacy.s13.contact": "Вопросы",

    "privacy.consentPre": "Создавая аккаунт, вы подтверждаете, что ознакомились с",
    "privacy.consentLink": "Политикой конфиденциальности",
    "privacy.consentPost": ".",
    "privacy.profileHint":
      "Здесь можно прочитать, какие данные мы собираем, кто и что видит и что именно происходит при удалении аккаунта.",

    // — Round3 E — Profile, info carousel, news panel, profile nav —
    "nav.profile": "Профиль",
    "profile.title": "Профиль",
    "profile.account": "Аккаунт",
    "profile.logout": "Выйти",
    "profile.deleteAccount": "Удалить аккаунт",
    "profile.changePassword": "Сменить пароль",
    "profile.currentPassword": "Текущий пароль",
    "profile.newPassword": "Новый пароль",
    "profile.save": "Сохранить",
    "profile.saving": "Сохранение…",
    "profile.editName": "Изменить",
    "profile.fullName": "Имя и фамилия",
    "profile.firstNameLabel": "Имя",
    "profile.lastNameLabel": "Фамилия",
    "profile.err.nameRequired": "Имя не может быть пустым.",
    "profile.saved": "Сохранено ✓",
    "profile.cancel": "Отмена",
    "profile.passwordChanged": "Пароль обновлён ✓",
    "profile.avatar": "Фото профиля",
    "profile.uploadAvatar": "Загрузить фото",
    "profile.changeAvatar": "Сменить фото",
    "profile.removeAvatar": "Удалить фото",
    "profile.avatarHint": "JPG или PNG, до 2 МБ.",
    "profile.noAvatar": "Нет фото",
    "profile.err.passwordShort": "Новый пароль должен содержать не менее 8 символов.",
    "profile.err.passwordEqualsId": "Пароль не может совпадать с ID.",
    "profile.err.fileType": "Загрузите изображение только в формате JPG или PNG.",
    "profile.err.fileTooLarge": "Файл не должен превышать 2 МБ.",
    "profile.err.uploadFailed": "Не удалось загрузить фото. Попробуйте ещё раз.",
    "profile.err.updateFailed": "Не удалось сохранить. Попробуйте ещё раз.",

    // — Round3 E — Information carousel (parent onboarding) —
    "carousel.title": "С чего начать",
    "carousel.i1.title": "Добавьте ребёнка",
    "carousel.i1.body":
      "На панели выберите «Добавить ребёнка» и укажите имя, город, школу и класс ребёнка. Для каждого ребёнка создаётся отдельный аккаунт.",
    "carousel.i2.title": "Выберите предметы и начните пробный период",
    "carousel.i2.body":
      "Выберите нужные предметы из математики, науки, логики и английского. Каждый новый предмет начинается с 7-дневного бесплатного периода — оплата не списывается до его окончания.",
    "carousel.i3.title": "Ребёнок входит по 8-значному ID",
    "carousel.i3.body":
      "После выбора плана система выдаёт уникальный 8-значный ID для входа. Ребёнок входит по этому ID и заданному вами паролю — эл. почта не нужна.",
    "carousel.i4.title": "Следите за прогрессом",
    "carousel.i4.body":
      "Отслеживайте результаты, точность и силу по предметам каждого ребёнка прямо на панели. Предметы можно добавлять и удалять в любой момент.",
    "carousel.i5.title": "Подготовка к олимпиадам и поддержка",
    "carousel.i5.body":
      "Купите олимпиадный пакет один раз — и у ребёнка останется пожизненный доступ. Есть вопрос? Напишите нам со страницы «Контакты».",

    // — Round3 E — News panel (latest news widget) —
    "news.latest": "Последние новости",
    "news.viewAll": "Все новости",
    "news.none": "Новостей пока нет.",
    "news.published": "Опубликовано",
    "news.readMore": "Подробнее",
    "news.unavailable": "Новости сейчас недоступны.",

    // — Round4 — Landing stats (labels only; numbers are illustrative) —
    "stats.title": "OlympIQ в цифрах",
    "stats.tests": "База тестов",
    "stats.olympiads": "Олимпиадные пакеты",
    "stats.students": "Активные школьники",
    "stats.successRate": "Показатель успеха",

    // — Round4 — About Us (hero + vision + 4 values) —
    "about.hero.title": "Ясный путь к олимпиаде",
    "about.hero.body":
      "OlympIQ — образовательная платформа на основе искусственного интеллекта, готовящая учеников 1–11 классов к олимпиадам. Платформа анализирует результаты каждого ученика и формирует персональные отчёты и рекомендации по развитию с учётом уровня знаний. Благодаря ежедневным тренировкам, тестам в олимпиадном формате и подробной аналитике и ученик, и родитель ясно видят прогресс.",
    "about.vision.title": "Наше видение",
    "about.vision.body":
      "Наше видение — сделать подготовку к олимпиадам доступной каждой азербайджанской семье. Предлагая персонализированное обучение на основе ИИ, подробные отчёты и современные методы по цене чашки кофе, мы хотим внести вклад в будущее тысяч школьников.",
    "about.values.title": "Что нас отличает",
    "about.value1.title": "Обучение на трёх языках",
    "about.value1.body":
      "Весь интерфейс работает на азербайджанском, английском и русском — каждый ученик может учиться на удобном для себя языке.",
    "about.value2.title": "Безопасность под контролем родителя",
    "about.value2.body":
      "Аккаунты создаёт и ведёт родитель. Дети не вводят ни электронную почту, ни платёжные данные. Всё под контролем родителя.",
    "about.value3.title": "Подготовка к олимпиадам",
    "about.value3.body":
      "Специальные пакеты с безлимитным доступом и подобранные на сервере попытки из 25 вопросов создают настоящий олимпиадный опыт.",
    "about.value4.title": "Измеримый прогресс",
    "about.value4.body":
      "Результаты, точность и потенциал по каждому предмету показаны прозрачно — на каждом шагу видно, где вы находитесь.",

    // — Round4 — News browse (sort + pager + views) —
    "news.sort.latest": "Сначала новые",
    "news.sort.oldest": "Сначала старые",
    "news.sort.mostViewed": "Самые просматриваемые",
    "news.sort.mostLiked": "Самые популярные",
    "news.like": "Нравится",
    "news.liked": "Понравилось",
    "news.likes": "лайков",
    "news.page.prev": "Назад",
    "news.page.next": "Вперёд",
    "news.page.indicator": "Страница {current} из {total}",
    "news.views": "просмотров",
    "news.empty2": "В этом разделе пока нет новостей.",

    // — Round4 — Language dropdown —
    "lang.select": "Выберите язык",

    // — Round4 PARENT — nav / drawer / analytics / subscription / help —
    "nav.analytics": "Аналитика",
    "nav.subscription": "Подписка",
    "nav.help": "Помощь",
    "drawer.title": "Аккаунт",
    "drawer.account": "Аккаунт",
    "drawer.language": "Язык",
    "drawer.theme": "Оформление",
    "drawer.close": "Закрыть",
    "drawer.profileBtn": "Мой профиль",
    "drawer.logout": "Выйти",
    "analytics.title": "Аналитика",
    "analytics.subtitle": "Обзор успеваемости ваших детей.",
    "analytics.totalChildren": "Дети",
    "analytics.activeSubs": "Активные подписки",
    "analytics.attempts": "Попытки",
    "analytics.avgScore": "Средний балл",
    "analytics.none": "Данных пока нет.",
    "subscription.title": "Подписка",
    "subscription.subtitle": "Управляйте предметами и подписками ваших детей.",
    "help.faqTitle": "Часто задаваемые вопросы",
    "help.contactTitle": "Контакты",

    // — Round4 Phase4 — subscription cards + cancel modal + arena controls —
    "subscription.child": "Ребёнок",
    "subscription.status.trialing": "Пробный период",
    "subscription.status.active": "Активна",
    "subscription.status.past_due": "Просрочен платёж",
    "subscription.status.canceled": "Отменена",
    "subscription.status.expired": "Истекла",
    "subscription.status.none": "Нет подписки",
    "subscription.subjects": "Предметы",
    "subscription.interval": "Оплата",
    "subscription.manageSubjects": "Управлять предметами",
    "subscription.startPlan": "Оформить подписку",
    "subscription.cancelBtn": "Отменить подписку",
    "cancel.title": "Отменить подписку?",
    "cancel.intro": "Прежде чем уйти, уделите минуту. Расскажите, почему вы отменяете подписку.",
    "cancel.reasonLabel": "Причина отмены",
    "cancel.reason.price": "Цена мне не подходит",
    "cancel.reason.notUsing": "Мы пользуемся недостаточно часто",
    "cancel.reason.features": "Не хватает нужных возможностей",
    "cancel.reason.temporary": "Просто делаю перерыв",
    "cancel.reason.other": "Другая причина",
    "cancel.benefitsTitle": "Если вы отмените, вы потеряете:",
    "cancel.benefit1": "Доступ к практике и ежедневным заданиям по этому предмету",
    "cancel.benefit2": "Отслеживание прогресса и результатов вашего ребёнка",
    "cancel.benefit3": "Текущий пробный период и полученную скидку",
    "cancel.confirm": "Да, отменить",
    "cancel.keep": "Оставить подписку",
    "cancel.done": "Подписка отменена.",
    "cancel.err": "Не удалось отменить подписку. Попробуйте ещё раз.",
    // ---- TEST ENGINE (T1/T2) — timed topic tests (child arena) ----
    "arena.nav.test": "Тест",
    "test.home.eyebrow": "Центр тестов",
    "test.home.title": "Пробные тесты",
    "test.home.sub": "Выбери предмет, отметь темы и начни 25-минутный тест.",
    "test.home.subjects": "Предметы",
    "test.home.continueTitle": "У тебя есть незавершённый тест",
    "test.home.continueSub": "Время всё ещё идёт — продолжи с того места, где остановился.",
    "test.home.continueCta": "Продолжить",
    "test.home.recent": "Последние тесты",
    "test.home.noAttempts": "Ты ещё не проходил тесты — начни первый прямо сейчас!",
    "test.home.noticeClosed": "Этот тест уже закрыт — он был отменён или время вышло.",
    "test.status.in_progress": "Идёт",
    "test.status.canceled": "Отменён",
    "test.status.expired": "Время вышло",
    "test.err.noAccess": "У тебя нет доступа к этому предмету — спроси у родителей про подписку.",
    "test.err.noQuestions": "По этому выбору пока нет вопросов — скоро появятся.",
    "test.err.generic": "Что-то пошло не так. Попробуй ещё раз чуть позже.",
    "test.setup.eyebrow": "Настройка теста",
    "test.setup.topicsTitle": "Темы",
    "test.setup.pickHint": "Выбери тему и подтему для теста.",
    "test.setup.topic": "Тема",
    "test.setup.subtopic": "Подтема",
    "test.setup.topicPh": "Выбери тему…",
    "test.setup.subtopicPh": "Выбери подтему…",
    "test.setup.noSubtopics": "У этой темы нет подтем — можно начать только с темой.",
    "test.setup.selectWarn": "Пожалуйста, выбери тему и подтему перед началом теста.",
    "test.setup.noTopics": "По этому предмету пока нет списка тем — чтобы начать тест, сначала нужно добавить темы.",
    "test.setup.rulesTitle": "Правила",
    "test.setup.qCount": "25 вопросов",
    "test.setup.duration": "25 минут",
    "test.setup.rule1": "Таймер запускается сразу после старта, и его нельзя поставить на паузу.",
    "test.setup.rule2": "Если уйти со страницы, время всё равно идёт — можно вернуться и продолжить.",
    "test.setup.rule3": "Твои ответы сохраняются автоматически.",
    "test.setup.rule4": "Если отменить тест, ничего не засчитывается.",
    "test.setup.scoringTitle": "Оценивание",
    "test.setup.scoring": "Каждый правильный ответ — 1 балл. За ошибки баллы не снимаются.",
    "test.setup.consent": "Я прочитал(а) и понял(а) правила",
    "test.setup.start": "Начать тест",
    "test.setup.starting": "Запуск…",
    "test.run.title": "Тест",
    "test.run.olympiad": "Олимпиада",
    "test.run.leaveTitle": "Точно хочешь выйти из теста?",
    "test.run.leaveMsg": "Твой текущий прогресс может пострадать.",
    "test.run.leaveStay": "Продолжить тест",
    "test.run.leaveConfirm": "Выйти из теста",
    "test.run.noLimit": "Без лимита времени",
    "test.run.daily": "Раунд дня",
    "test.run.ratedBadge": "Влияет на рейтинг",
    "test.run.practiceBadge": "Тренировка",
    "test.home.sub2": "Каждый день — один рейтинговый раунд по каждому предмету: 25 вопросов, без лимита времени. А ещё можно свободно тренироваться по темам.",
    "test.rounds.today": "Раунды сегодняшнего дня",
    "test.rounds.yesterday": "Раунды вчерашнего дня",
    "test.rounds.recent": "Недавние раунды",
    "test.rounds.start": "Начать",
    "test.rounds.attempted": "Сегодня ты уже участвовал(а)",
    "test.rounds.timedBadge": "25 вопросов · без лимита времени",
    "test.rounds.rated": "Влияет на рейтинг",
    "test.rounds.replay": "Пройти ещё раз",
    "test.rounds.practiceNote": "Эти тесты только для повторения — результаты не влияют на рейтинговую таблицу.",
    "test.rounds.noYesterday": "Вчера раунд не проводился.",
    "test.rounds.noRoundYet": "Этот раунд ещё не готов — загляни чуть позже.",
    "test.rounds.doneAlert": "Вы уже завершили сегодняшний раунд.",
    "test.rounds.alreadyNote": "Сегодняшний раунд по этому предмету ты уже прошёл(а) — возвращайся завтра!",
    "test.rounds.noGrade": "В твоём профиле не указан класс — попроси родителя добавить его.",
    "test.rounds.practiceCta": "Тренироваться",
    "test.rounds.practiceMeta": "без лимита времени, без баллов",
    "test.rounds.ratedChip": "Рейтинговый",
    "test.rounds.usedToday": "Вы уже использовали сегодняшнюю попытку. Новый экзамен откроется завтра.",
    "test.rounds.rulesTitle": "Правила экзамена",
    "test.rounds.rulesRated": "Это ежедневный рейтинговый экзамен — результат влияет на баллы, процент и серию.",
    "test.rounds.rulesOnce": "По каждому предмету можно пройти только один экзамен в день.",
    "test.rounds.rulesNoLimit": "Лимита времени нет — не спеши и внимательно отвечай на каждый вопрос.",
    "test.rounds.rulesSaved": "Твои ответы сохраняются автоматически.",
    "test.img.alt": "Рисунок к вопросу",
    "test.img.hint": "Нажми, чтобы увеличить",
    "test.img.close": "Закрыть",
    "test.setup.noLimit": "Без лимита времени",
    "test.setup.noPoints": "Баллы в рейтинг не идут",
    "test.setup.rulePractice1": "Это тренировочный тест — результат не влияет на рейтинг.",
    "test.setup.rulePractice2": "Времени сколько угодно — думай спокойно, можешь сделать паузу и вернуться.",
    "test.setup.practiceScoring": "Каждый правильный ответ — 1 балл. Результат видно сразу, но баллы в рейтинг не начисляются.",
    "lb.colDistrict": "Район",
    "lb.scope.district": "Район",
    "lb.colNo": "Место",
    "plb.board.empty": "По этому фильтру пока нет результатов.",
    "plb.pos.title": "Позиции ваших детей",
    "plb.pos.notInFilter": "Не участвует в рейтинге по этому фильтру",
    "plb.pos.noChildren": "Вы ещё не добавили ребёнка. Добавьте ребёнка и следите за его позицией в рейтинге здесь.",
    "pub.lb.title": "Общий рейтинг",
    "pub.lb.sub": "Ученики с лучшими результатами на платформе",
    "pub.lb.empty": "Данные рейтинга пока недоступны.",
    "lb.myRank.notInFilter": "По этому фильтру тебя нет в рейтинге.",
    "test.run.timeLeft": "Осталось времени",
    "test.run.resumed": "Ты продолжаешь с того места, где остановился.",
    "test.run.palette": "Вопросы",
    "test.run.answered": "Отвечено",
    "test.run.flagged": "Сохранённые",
    "test.run.unanswered": "Без ответа",
    "test.run.current": "Текущий вопрос",
    "test.run.subject": "Предмет",
    "test.run.topic": "Тема",
    "test.run.flag": "Сохранить",
    "test.run.unflag": "Убрать",
    "test.run.next": "Далее",
    "test.run.submit": "Завершить тест",
    "test.run.submitting": "Отправка…",
    "test.run.cancel": "Отменить",
    "test.run.canceling": "Отмена…",
    "test.run.saving": "Сохранение…",
    "test.run.saved": "Сохранено",
    "test.run.saveError": "Не удалось сохранить ответы — проверь подключение к интернету.",
    "test.run.submitTitle": "Завершить тест?",
    "test.run.submitMsg": "Вопросов без ответа: {n}. После завершения ответы изменить нельзя.",
    "test.run.submitConfirm": "Да, завершить",
    "test.run.back": "Вернуться",
    "test.run.cancelTitle": "Отменить тест?",
    "test.run.cancelMsg": "Если отменить, ничего не засчитается — ни баллы, ни результат.",
    "test.run.cancelConfirm": "Да, отменить",
    "test.run.keepGoing": "Продолжить",
    "test.run.timeUp": "Время вышло — тест отправляется…",
    "test.result.eyebrow": "Результат",
    "test.result.title": "Твой результат",
    "test.result.olympiadTitle": "Твой результат олимпиады",
    "test.result.backToOlympiads": "К олимпиадам",
    "test.result.topics": "Результаты по темам",
    "test.result.noTopics": "Разбивки по темам нет.",
    "test.result.timeSpent": "Затраченное время",
    "test.result.minutes": "мин",
    "test.result.review": "Разбор ответов",
    "test.result.newTest": "Новый тест",
    "test.review.title": "Разбор ответов",
    "test.review.correct": "Верно",
    "test.review.wrong": "Неверно",
    "test.review.skipped": "Пропущен",
    "test.review.your": "Твой выбор",
    "test.review.correctAnswer": "Правильный ответ",
    "test.review.explanation": "Объяснение",
    "test.review.explAzOnly": "Только на азербайджанском",
    "test.review.explAzNote":
      "Это объяснение ещё не переведено, поэтому показан оригинальный текст на азербайджанском.",
    "test.review.backToResult": "К результату",
    "test.review.filterAll": "Все",
    "test.review.filterCorrect": "Верные",
    "test.review.filterWrong": "Неверные",
    "test.review.filterSkipped": "Пропущенные",
    // Report a problem (migration 115) — shown on the runner and the review
    // screen; the same dictionary feeds the mobile sheet.
    "test.report.action": "Сообщить о проблеме",
    "test.report.title": "Сообщить о проблеме в вопросе",
    "test.report.intro":
      "Что не так с этим вопросом? Достаточно короткой заметки — например, неверный правильный ответ, опечатка или не загружается картинка.",
    "test.report.label": "Опиши проблему",
    "test.report.placeholder": "Например: правильный ответ должен быть B.",
    "test.report.remaining": "Осталось символов: {n}",
    "test.report.cancel": "Отмена",
    "test.report.submit": "Отправить",
    "test.report.sending": "Отправляем…",
    "test.report.emptyErr": "Сначала опиши проблему.",
    "test.report.successTitle": "Сообщение отправлено",
    "test.report.successBody": "Спасибо! Мы проверим этот вопрос.",
    "test.report.done": "Закрыть",
    "test.report.err.generic":
      "Не удалось отправить сообщение. Попробуй ещё раз через минуту.",
    "test.report.err.duplicate":
      "Ты уже сообщал об этом вопросе — он на рассмотрении.",
    "test.report.err.tooMany":
      "Слишком много сообщений. Попробуй немного позже.",
    // Child profile — read-only school details
    "prof2.schoolInfo": "Данные о школе",
    "prof2.schoolInfoHint": "Эти данные может изменить только родитель.",
    "prof2.grade": "Класс",
    "prof2.city": "Город",
    "prof2.school": "Школа",
    // Parent edits a child's info
    "parent.dash.editInfo": "Изменить данные",
    "childedit.title": "Изменить данные ребёнка",
    "childedit.intro": "Измени имя, класс, город и школу ребёнка. ID для входа не меняется.",
    "childedit.save": "Сохранить",
    "childedit.saving": "Сохранение…",
    "childedit.saved": "Данные ребёнка успешно обновлены.",
    "childedit.back": "Назад",
    "childedit.internalId": "Внутренний ID",
    "childedit.idNote": "ID для входа и внутренние идентификаторы изменить нельзя.",
    "childedit.err.generic": "Не удалось сохранить изменения. Попробуй ещё раз.",
    "childedit.err.notYourChild": "Этот ребёнок не относится к вашему аккаунту.",
    // ---- Payment result (payres.*) — see the az block for why it is bare.
    "payres.title": "Результат платежа",
    "payres.ok": "Платёж подтверждён.",
    "payres.pending": "Результат платежа пока не подтверждён. Проверьте ещё раз чуть позже.",
    "payres.failed": "Платёж не прошёл.",
    "payres.close": "Это окно можно закрыть.",
    "payres.redirect": "Вы перенаправляетесь на страницу оплаты.",
    "payres.continue": "Продолжить",
    // ---- Parent checkout (checkout.*) — the WEB purchase flow -------------
    // WEB ONLY. These strings name a price, a payment step and a bank page, all
    // of which are correct in a browser and forbidden in a store binary
    // (docs/STORE_PAYMENTS_COMPLIANCE.md section 5). The mobile catalog is
    // GENERATED from this file, so these keys will exist there — no mobile
    // screen may reference one. The amount itself is never in the catalog: it
    // is rendered from the server's own number, so no locale can drift from it.
    "checkout.title": "Завершите оплату",
    "checkout.intro":
      "Оплату вы завершите на защищённой странице банка. Данные карты вводятся только там и на наши серверы не попадают.",
    "checkout.amount": "Сумма к оплате",
    "checkout.payNow": "Перейти к оплате",
    "checkout.starting": "Подготовка…",
    "checkout.redirectNote":
      "Сейчас вы перейдёте на страницу оплаты банка. После завершения оплаты вы вернётесь сюда.",
    "checkout.continue": "Перейти на страницу банка",
    "checkout.err.notFound": "Не удалось найти этот платёж. Обновите страницу и попробуйте ещё раз.",
    "checkout.err.alreadyPaid": "Этот платёж уже выполнен.",
    "checkout.err.unavailable":
      "Оплата сейчас недоступна. Попробуйте немного позже.",
    "checkout.resume": "Завершить оплату",
    "checkout.err.priceChanged":
      "Цена изменилась. Проверьте свой выбор — мы покажем новую сумму.",
    "checkout.err.expired":
      "Срок этого платежа истёк. Выберите предметы заново, чтобы продолжить.",
    "checkout.err.retryFromEditor":
      "Платёж не прошёл. Сохраните изменение заново — ваш план мог измениться, поэтому мы пересчитаем сумму.",
    "checkout.err.planChanged":
      "План был изменён в другом месте. Обновите страницу и попробуйте снова.",
    "checkout.err.tooMany": "Слишком много попыток. Проверьте ещё раз через несколько минут.",
    // The result screen says what actually happened. Since migration 125 a
    // confirmed payment IS what creates the plan, so "ok" may say so — and it
    // is only ever shown when the redemption actually applied. A payment we
    // took but could not turn into a plan lands on "pending", which is what it
    // is from the payer's side: taken, not finished, and in front of a human.
    "checkout.res.ok.title": "Платёж подтверждён",
    "checkout.res.ok.body":
      "Ваш платёж подтверждён, купленный доступ активирован. Его можно увидеть в родительской панели.",
    "checkout.res.pending.title": "Платёж ещё не подтверждён",
    "checkout.res.pending.body":
      "Банк пока не дал окончательного ответа. Обычно это занимает несколько минут.",
    "checkout.res.pending.hint":
      "Пожалуйста, не платите повторно — результат появится в вашем аккаунте, как только будет готов. Если через некоторое время ничего не изменится, свяжитесь с нами.",
    "checkout.res.failed.title": "Платёж не прошёл",
    "checkout.res.failed.body":
      "Деньги не списаны. Проверьте карту и попробуйте ещё раз.",
    "checkout.res.back": "Вернуться в родительскую панель",
  },
};
