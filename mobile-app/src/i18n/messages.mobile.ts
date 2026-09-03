// Mobile-ONLY strings (screens that have no web counterpart). Everything else
// comes from messages.generated.ts (synced from the web catalog). Keys here
// win over synced keys, so this file can also patch phrasing that reads wrong
// on a phone. az default / en / ru — every key in all three, natural phrasing.
import type { Locale } from "./messages.generated";

export const mobileMessages: Record<Locale, Record<string, string>> = {
  az: {
    "about2.b3.body": "Hər cəhddə süni intellekt 25 sualı avtomatik seçir — çətinliyi heç kim özü müəyyən etmir. Paketlər bir dəfə aktivləşdirilir və limitsiz giriş verir.",
    "parent.child.intro": "Uşağınızın məlumatlarını daxil edin. Fənlər seçildikdən sonra 8 rəqəmli giriş ID-si yaradılacaq.",
    "parent.dash.idPending": "ID gözləyir — fənn seçin",
    // ---- STORE COMPLIANCE OVERRIDES ------------------------------------
    // These keys exist in the WEB catalog with purchasing language, which is
    // correct there and forbidden here. docs/STORE_PAYMENTS_COMPLIANCE.md: a
    // store build carries no purchase imperative, no trial/billing walkthrough
    // and no subscribe-family CTA — in the PARENT tabs too, because the
    // consumption-only test is app-wide. Overriding beats deleting the slides:
    // the onboarding still explains the product, it just stops selling it.
    "carousel.i2.body": "Riyaziyyat, Elm, Məntiq və İngilis dilindən övladınıza lazım olanları seçin. Fənləri istənilən vaxt dəyişə bilərsiniz.",
    // The 2026-08-18 pass overrode this slide's BODY and missed its TITLE, which
    // still read "start the trial" -- a commerce promise in the onboarding
    // headline of a purchase-silent binary.
    "carousel.i2.title": "Övladınızın fənlərini seçin",
    "carousel.i3.body": "Fənlər aktivləşdikdən sonra sistem unikal 8 rəqəmli giriş ID-si verir. Övladınız bu ID və sizin təyin etdiyiniz parolla daxil olur — e-poçt lazım deyil.",
    "carousel.i5.body": "Olimpiada paketləri övladınıza seçilmiş mövzular üzrə ömürlük giriş verir. Sualınız olsa, Əlaqə səhifəsindən bizə yazın.",
    "parent.dash.choosePlan": "Fənləri seç",
    "faq.q3": "Fənlərə giriş necə açılır?",
    "faq.a3": "Hər fənn üzrə giriş valideyn hesabı vasitəsilə açılır. Şagird heç vaxt özü giriş aça bilmir.",
    "faq.q6": "Fənn girişi nə qədər davam edir?",
    "faq.a6": "Hər fənnin öz dövrü var və dövr bitdikdə giriş bağlanır. Bitmə tarixindən əvvəl valideynə bildiriş göndərilir.",
    // The cancel sheet was the last purchasing copy a parent could reach on
    // Android: a cancellation reason naming a PRICE the binary otherwise never
    // shows, and a what-you-lose line naming a DISCOUNT. Both were tracked as
    // known gaps in __tests__/store-copy.test.ts rather than fixed. The reasons
    // stay meaningful — a parent cancelling over cost still recognises "it isn't
    // right for us" — they just stop naming commerce. (2026-09-01)
    "cancel.reason.price": "Bizim üçün uyğun deyil",
    "cancel.benefit3": "Cari giriş müddətinizin qalan hissəsini",
    // Round 8 store-compliance pass: the 2026-08-18 rewrite covered q3/a3 and
    // q6/a6 and MISSED these two. faq.a7 shipped the sibling-discount schedule
    // ("10% / 15%") in the binary, and the FAQ row in the account sheet is not
    // role-gated, so a signed-in CHILD reached a discount table in two taps.
    // Rewritten in access language, with no percentages and no purchase verbs.
    "faq.q5": "Şagird özü giriş aça bilərmi?",
    "faq.a5": "Xeyr. Fənn girişi yalnız valideyn hesabı vasitəsilə açılır.",
    "faq.q7": "Bir ailədən bir neçə uşaq üçün necə işləyir?",
    "faq.a7": "Valideyn bir hesabdan bir neçə uşaq əlavə edə bilər. Hər uşağın öz 8 rəqəmli ID-si və öz fənn girişi olur.",
    "mob.welcome.tagline": "Olimpiadalara hazırlaşmağın ən əyləncəli yolu",
    "mob.welcome.studentLogin": "Şagird girişi",
    "mob.update.title": "Yeniləmə tələb olunur",
    "mob.update.body":
      "Tətbiqin bu versiyası artıq dəstəklənmir. Davam etmək üçün mağazadan yeniləyin.",
    "mob.update.cta": "İndi yenilə",
    "mob.update.openFailed":
      "Mağazanı açmaq mümkün olmadı. Zəhmət olmasa mağazanı özünüz açıb tətbiqi yeniləyin.",
    // ---- OPTIONAL (skippable) update -----------------------------------
    // Separate keys on purpose: mob.update.* is worded as MANDATORY ("artıq
    // dəstəklənmir"), and that sentence above a "Sonra" button would read as a
    // threat the app then lets you ignore. No price, no purchase verb, no URL —
    // an update prompt is not a commerce surface.
    "mob.updateAvailable.title": "Yeni versiya mövcuddur",
    "mob.updateAvailable.body":
      "Tətbiqin daha yeni versiyası hazırdır. Yeniləmə son düzəlişləri və təkmilləşdirmələri gətirir — istəsəniz sonra da yeniləyə bilərsiniz.",
    "mob.updateAvailable.cta": "Yenilə",
    "mob.updateAvailable.later": "Sonra",
    "mob.boot.error": "Yükləmək mümkün olmadı. İnternet bağlantını yoxla.",
    "mob.err.serverUnavailable": "Server hazırda cavab vermir. Bir azdan yenidən cəhd et.",
    "mob.err.network": "Serverə qoşulmaq alınmadı. İnternet bağlantını yoxla və yenidən cəhd et.",
    "mob.retry": "Yenidən cəhd et",
    "mob.refresh.failed": "Yeniləmək alınmadı. İnternet bağlantını yoxla.",
    "mob.refreshing": "Yenilənir…",
    "mob.refreshed": "Məlumatlar yeniləndi",
    "mob.about.less": "Gizlət",
    "mob.about.more": "Ətraflı oxu",
    "mob.childId": "8 rəqəmli şagird ID-si",
    "mob.childIdPh": "1234 5678",
    "mob.parentPassword": "Valideynin təyin etdiyi şifrə",
    "mob.forgotOnWeb": "Şifrə bərpası veb saytda açılır.",
    "mob.placeholder.title": "Tezliklə",
    "mob.placeholder.body": "Bu bölmə növbəti mərhələdə əlavə olunacaq.",
    "mob.gallery.title": "Dizayn qalereyası",
    "mob.session.expired": "Sessiyanın vaxtı bitdi — yenidən daxil ol.",
    "mob.prof.confirmPassword": "Şifrəni təsdiqləyin",
    "mob.prof.passwordMismatch": "Şifrələr uyğun gəlmir.",
    "mob.prof.deleteFinal": "Son addım: bu əməliyyat geri qaytarıla bilməz. Hesab həmişəlik silinsin?",
    "mob.prof.avatarPrivate":
      "Şəklini yalnız sən və valideynin görə bilər. Şəkli silsən, fayl tamamilə silinir.",
    "prof2.err.generic": "Əməliyyat alınmadı. Bir azdan yenidən cəhd edin.",
    "mob.pay.notInApp": "Abunəliklər bu tətbiqdə idarə olunmur. Burada yalnız cari vəziyyət göstərilir.",
    "mob.gate.allOpen": "Hazırda bütün fənlər övladlarınız üçün açıqdır.",
    "mob.addchild.idReady": "Övladınız bu ID ilə indi daxil ola bilər. Fənnlərə giriş isə hələ aktiv deyil.",
    "mob.select.cancel": "Ləğv et",
    "mob.select.search": "Axtar…",
    "mob.select.noResults": "Uyğun nəticə tapılmadı",
    "mob.sub.accessUntil": "Giriş bu tarixə qədər",
    // ---- APPLE IN-APP PURCHASE (iOS ONLY) ------------------------------
    // Rendered only where IAP_PLATFORM_SUPPORTED is true; an Android build
    // resolves none of these keys because nothing asks for them.
    //
    // NO AMOUNT APPEARS IN ANY OF THESE STRINGS AND NONE EVER MAY. The only
    // price the app shows is StoreKit's own `displayPrice`, straight onto the
    // button — already localised, already in the viewer's storefront currency,
    // already right about tax. A price written here would be wrong for most of
    // the world on the day it was typed.
    //
    // The vocabulary is deliberately plain (activate / access / restore) rather
    // than the obvious selling verbs. Two reasons, and neither is squeamishness:
    // the app's shared copy sweep bans that vocabulary catalogue-wide because it
    // also reaches the CHILD side of this one binary, and "access" is simply
    // what a non-renewing period actually is.
    "mob.iap.title": "App Store ilə aktivləşdirmə",
    "mob.iap.intro":
      "Övladınız üçün fənn seçin. Aktivləşdirmə App Store vasitəsilə tamamlanır və giriş dərhal açılır.",
    "mob.iap.noRenew":
      "Avtomatik yenilənmə yoxdur: müddət bitəndə giriş dayanır və yenisini özünüz başladırsınız.",
    "mob.iap.loading": "App Store yoxlanılır…",
    "mob.iap.working": "Gözləyin…",
    "mob.iap.done": "Hazırdır — giriş açıldı.",
    // THE MOST IMPORTANT SENTENCE IN THIS FILE: shown when money has moved and
    // the grant could not be confirmed. It must never read as a failure.
    "mob.iap.pending":
      "Ödəniş qeydə alındı. Giriş bir neçə dəqiqə ərzində avtomatik açılır. Açılmasa, aşağıdakı bərpa düyməsindən istifadə edin.",
    "mob.iap.deferred":
      "Sorğu təsdiq gözləyir. Ailə təşkilatçısı təsdiqləyən kimi giriş avtomatik açılacaq.",
    "mob.iap.err.generic": "Əməliyyat tamamlanmadı. Bir azdan yenidən cəhd edin.",
    "mob.iap.err.unavailable":
      "App Store ilə əlaqə qurulmadı. İnternet bağlantını yoxlayıb yenidən cəhd edin.",
    "mob.iap.err.notAllowed":
      "Bu cihazda App Store əməliyyatları məhdudlaşdırılıb. Ayarlarda Ekran vaxtı məhdudiyyətlərini yoxlayın.",
    "mob.iap.restore": "Girişi bərpa et",
    "mob.iap.restoreHint": "Əvvəl ödədiyiniz giriş görünmürsə, bura toxunun.",
    "mob.iap.restoreWorking": "Yoxlanılır…",
    "mob.iap.restoreDone": "Giriş bərpa olundu.",
    // Calm, not an error: this is the ordinary answer on a fresh device.
    "mob.iap.restoreNothing":
      "Bərpa ediləcək bir şey tapılmadı. Bu cihazda bu Apple ID ilə əvvəlki əməliyyat yoxdur.",
    "subjedit.noChargeNow": "İndi heç bir ödəniş yoxdur — fənn dərhal açılır.",
    "mob.subjedit.notInApp": "Bu dəyişiklik tətbiqdə tamamlanmır. Fənni silmək və ya ləğv etdiyin fənni geri qaytarmaq isə burada mümkündür.",
    // WAS: "Olimpiada paketləri bu tətbiqdə əldə edilmir..." — "are not obtained
    // in this app" states that they are obtained SOMEWHERE ELSE, which is the
    // exact 3.1.1 pattern the app was rejected for, on a second product line.
    // It also bought us nothing: no olympiad package has a price (production,
    // 2026-09-01: 8 packages, 2 active, ZERO priced above zero), and Apple
    // requires no in-app purchase for content that costs nothing. So the
    // sentence carried the whole compliance risk and none of the benefit.
    // Now it says only what happens, in access language. (2026-09-01)
    "mob.oly.notInApp": "Övladınız üçün açılan olimpiada paketləri avtomatik burada və onun \"Olimpiadalarım\" bölməsində görünür.",
    "mob.cancel.untilEnd": "Giriş ödənilmiş dövrün sonuna qədər davam edir.",
    "mob.oly.duration": "Müddət",
    "mob.unit.min": "dəq",
    "mob.pw.show": "Şifrəni göstər",
    "mob.pw.hide": "Şifrəni gizlət",
    "mob.arena.streakAtRisk": "Bu gün bir raund həll et, yoxsa seriyan sıfırlanacaq!",
    "mob.onb.s1.title": "Hər gün yeni raund",
    "mob.onb.s1.body":
      "Gündəlik 25 suallıq raundları həll et, xal topla və real reytinqdə yüksəl.",
    "mob.onb.s2.title": "Olimpiadalara hazırlıq",
    "mob.onb.s2.body":
      "Olimpiada paketi açılanda onun suallarına ömürlük çıxışın olur.",
    "mob.onb.s3.title": "Valideyn nəzarəti",
    "mob.onb.s3.body":
      "Fənlərə girişi valideyn idarə edir — uşaq hesabı təhlükəsiz qalır.",
    "mob.onb.skip": "Keç",
    "mob.onb.next": "İrəli",
    "mob.login.about": "OlympIQ haqqında",
    "mob.notif.today": "Bu gün",
    "mob.notif.yesterday": "Dünən",
    "mob.notif.unread": "Oxunmamış: {n}",
    "mob.push.ch.default": "Ümumi bildirişlər",
    "mob.push.ch.olympiad": "Olimpiadalar",
    "mob.push.ch.progress": "İrəliləyiş",
    "mob.push.ch.billing": "Ödənişlər",
    "mob.push.ch.announcement": "Elanlar",
    "mob.push.ch.news": "Xəbərlər",
    "mob.info.section": "Məlumat",
    "mob.contact.mapUnavailable": "Xəritəni yükləmək alınmadı. Ünvanı xəritə tətbiqində aç.",
    "mob.link.openFailed": "Bu bağlantını açmaq alınmadı. Cihazında uyğun tətbiq quraşdırılıb?",
    "mob.contact.directions": "Yol göstər",
    "mob.contact.mapLabel": "Ünvanımızın xəritəsi",
    "mob.lock.section": "Təhlükəsizlik",
    "mob.lock.title": "Biometrik kilid",
    "mob.lock.subtitle": "Tətbiqi açanda barmaq izi və ya üz ilə təsdiq istə.",
    "mob.lock.unavailable": "Bu cihazda biometrik təsdiqləmə qurulmayıb.",
    "mob.lock.prompt": "Kimliyini təsdiqlə",
    "mob.lock.lockedTitle": "Tətbiq kilidlidir",
    "mob.lock.lockedBody": "Davam etmək üçün kimliyini təsdiqlə.",
    "mob.lock.unlock": "Kilidi aç",
    "mob.plb.viewFull": "Tam reytinqə bax",
    "mob.contact.openMaps": "Xəritədə aç",
    "mob.app.version": "Versiya {v}",
    // Round 51: web replaced its static Weekly/Monthly/Yearly plan cards with
    // the interactive configurator and DELETED the pricing2.* keys, so the
    // ones the mobile Services screen still renders live HERE (the overlay).
    // 2026-08-18: the .price / .per / .cta triples are GONE with the amounts
    // and the checkout CTA, and the remaining copy was rewritten to describe
    // what a cycle COVERS instead of what it costs or how it compares in
    // value (docs/STORE_PAYMENTS_COMPLIANCE.md — no price, no purchase CTA,
    // no price claim anywhere in the binary).
    "pricing2.weekly.name": "Həftəlik",
    "pricing2.weekly.desc": "Fənn həftəlik dövrlə açılır və hər həftə yenilənir.",
    "pricing2.weekly.b1": "Qısa dövr — hər həftə yenilənir",
    "pricing2.weekly.b2": "Hər fənn ayrıca açılır",
    "pricing2.weekly.b3": "Platformanı sınamaq üçün əlverişlidir",
    "pricing2.monthly.name": "Aylıq",
    "pricing2.monthly.desc": "Fənn aylıq dövrlə açılır — müntəzəm məşq üçün ən çox seçilən variant.",
    "pricing2.monthly.b1": "Bir aylıq fasiləsiz giriş",
    "pricing2.monthly.b2": "Hər fənn ayrıca açılır",
    "pricing2.monthly.b3": "Gündəlik raundlar və məşq testləri daxildir",
    "pricing2.yearly.name": "İllik",
    "pricing2.yearly.desc": "Fənn bütün dərs ili boyunca açıq qalır.",
    "pricing2.yearly.b1": "Bir illik fasiləsiz giriş",
    "pricing2.yearly.b2": "Hər fənn ayrıca açılır",
    "pricing2.yearly.b3": "Bütün dərs ilini əhatə edir",
    "pricing2.title": "Abunəlik dövrləri",
    "pricing2.sub": "Abunəlik hər övlad və hər fənn üçün ayrıca seçilir. Aşağıda hər dövrün nəyi əhatə etdiyi göstərilir.",
    "pricing2.note": "Abunəliklər bu tətbiqdə idarə olunmur — bu səhifə yalnız dövrlərin necə işlədiyini izah edir.",
    "polyPub.sub": "Hazırda aktiv olan olimpiada paketləri.",
    "poly.subtitle": "Aktiv olimpiada paketlərinə baxın — övladınız üçün açılanlar burada işarələnir.",
    "poly.owned": "Açıqdır",
    "poly.modal.already": "Bu paket övladınız üçün artıq açıqdır.",
    "subjects.note": "Hər fənn ayrıca açılır və hər övlad üçün fərqli ola bilər.",
    "oly4.buyNote": "Bu olimpiadada iştirak etmək üçün valideyninlə danış — paket sənin üçün açılanda burada görünəcək.",
    "oly3.childNone": "Hələ açıq olimpiada paketin yoxdur — valideyninlə danış.",
    "oly5.errNoAccess": "Bu olimpiadaya girişin yoxdur — valideyninlə danış.",
  },
  en: {
    "about2.b3.body": "On every attempt the AI automatically selects 25 questions — nobody picks the difficulty themselves. Packages are activated once and give unlimited access.",
    "parent.child.intro": "Enter your child's details. The 8-digit login ID is created once subjects are chosen.",
    "parent.dash.idPending": "ID pending — choose subjects",
    // ---- STORE COMPLIANCE OVERRIDES ------------------------------------
    // These keys exist in the WEB catalog with purchasing language, which is
    // correct there and forbidden here. docs/STORE_PAYMENTS_COMPLIANCE.md: a
    // store build carries no purchase imperative, no trial/billing walkthrough
    // and no subscribe-family CTA — in the PARENT tabs too, because the
    // consumption-only test is app-wide. Overriding beats deleting the slides:
    // the onboarding still explains the product, it just stops selling it.
    "carousel.i2.body": "Pick the subjects your child needs from Math, Science, Logic, and English. You can change them at any time.",
    "carousel.i2.title": "Choose your child's subjects",
    "carousel.i3.body": "Once the subjects are active, the system issues a unique 8-digit login ID. Your child signs in with that ID and the password you set — no email needed.",
    "carousel.i5.body": "Olympiad packages give your child lifetime access to the topics they cover. Have a question? Reach us from the Contact page.",
    "parent.dash.choosePlan": "Choose subjects",
    "faq.q3": "How is access to a subject opened?",
    "faq.a3": "Access to each subject is opened through the parent account. A student can never open access themselves.",
    "faq.q6": "How long does access to a subject last?",
    "faq.a6": "Each subject has its own period, and access closes when that period ends. The parent is notified before the end date.",
    // See the az block: the cancel sheet named a price and a discount on Android.
    "cancel.reason.price": "It isn't right for us",
    "cancel.benefit3": "The remaining time on your current access",
    "faq.q5": "Can a student open access themselves?",
    "faq.a5": "No. Subject access is opened only through the parent account.",
    "faq.q7": "How does it work for several children in one family?",
    "faq.a7": "A parent can add several children from one account. Each child gets their own 8-digit ID and their own subject access.",
    "mob.welcome.tagline": "The most fun way to prepare for olympiads",
    "mob.welcome.studentLogin": "Student sign-in",
    "mob.update.title": "Update required",
    "mob.update.body":
      "This version of the app is no longer supported. Update from the store to continue.",
    "mob.update.cta": "Update now",
    "mob.update.openFailed":
      "The store could not be opened. Please open your app store and update the app from there.",
    "mob.updateAvailable.title": "A new version is available",
    "mob.updateAvailable.body":
      "A newer version of the app is ready. Updating brings the latest fixes and improvements — you can also do it later.",
    "mob.updateAvailable.cta": "Update",
    "mob.updateAvailable.later": "Later",
    "mob.boot.error": "Could not load. Check your internet connection.",
    "mob.err.serverUnavailable": "The server isn't responding right now. Please try again shortly.",
    "mob.err.network": "Couldn't reach the server. Check your connection and try again.",
    "mob.retry": "Try again",
    "mob.refresh.failed": "Couldn't refresh. Check your connection.",
    "mob.refreshing": "Refreshing…",
    "mob.refreshed": "Information updated",
    "mob.about.less": "Show less",
    "mob.about.more": "Read more",
    "mob.childId": "8-digit student ID",
    "mob.childIdPh": "1234 5678",
    "mob.parentPassword": "Password set by your parent",
    "mob.forgotOnWeb": "Password recovery opens on the website.",
    "mob.placeholder.title": "Coming soon",
    "mob.placeholder.body": "This section arrives in the next stage.",
    "mob.gallery.title": "Design gallery",
    "mob.session.expired": "Your session expired — please sign in again.",
    "mob.prof.confirmPassword": "Confirm password",
    "mob.prof.passwordMismatch": "Passwords do not match.",
    "mob.prof.deleteFinal": "Last step: this cannot be undone. Permanently delete the account?",
    "mob.prof.avatarPrivate":
      "Only you and your parent can see your photo. If you remove it, the file is deleted.",
    "prof2.err.generic": "Something went wrong. Please try again shortly.",
    "mob.pay.notInApp": "Subscriptions are not managed in this app. This screen only shows your current status.",
    "mob.gate.allOpen": "All subjects are open for your children right now.",
    "mob.addchild.idReady": "Your child can sign in with this ID right away. Access to subjects is not active yet.",
    "mob.select.cancel": "Cancel",
    "mob.select.search": "Search…",
    "mob.select.noResults": "No matching results",
    "mob.sub.accessUntil": "Access until",
    // ---- APPLE IN-APP PURCHASE (iOS ONLY) ------------------------------
    // Rendered only where IAP_PLATFORM_SUPPORTED is true; an Android build
    // resolves none of these keys because nothing asks for them.
    //
    // NO AMOUNT APPEARS IN ANY OF THESE STRINGS AND NONE EVER MAY. The only
    // price the app shows is StoreKit's own `displayPrice`, straight onto the
    // button — already localised, already in the viewer's storefront currency,
    // already right about tax. A price written here would be wrong for most of
    // the world on the day it was typed.
    //
    // The vocabulary is deliberately plain (activate / access / restore) rather
    // than the obvious selling verbs. Two reasons, and neither is squeamishness:
    // the app's shared copy sweep bans that vocabulary catalogue-wide because it
    // also reaches the CHILD side of this one binary, and "access" is simply
    // what a non-renewing period actually is.
    "mob.iap.title": "Activate with the App Store",
    "mob.iap.intro":
      "Choose a subject for your child. The App Store completes the activation and access opens straight away.",
    "mob.iap.noRenew":
      "Nothing renews automatically: access ends when the period is over, and you start a new one yourself.",
    "mob.iap.loading": "Checking the App Store…",
    "mob.iap.working": "Please wait…",
    "mob.iap.done": "Done — access is open.",
    // THE MOST IMPORTANT SENTENCE IN THIS FILE: shown when money has moved and
    // the grant could not be confirmed. It must never read as a failure.
    "mob.iap.pending":
      "Your payment is recorded. Access opens automatically within a few minutes. If it does not, use the restore button below.",
    "mob.iap.deferred":
      "This request is waiting for approval. Access opens automatically as soon as the family organiser approves it.",
    "mob.iap.err.generic": "That did not go through. Please try again in a moment.",
    "mob.iap.err.unavailable":
      "The App Store could not be reached. Check your connection and try again.",
    "mob.iap.err.notAllowed":
      "App Store transactions are restricted on this device. Check the Screen Time restrictions in Settings.",
    "mob.iap.restore": "Restore access",
    "mob.iap.restoreHint": "Tap here if access you already paid for is not showing.",
    "mob.iap.restoreWorking": "Checking…",
    "mob.iap.restoreDone": "Access has been restored.",
    // Calm, not an error: this is the ordinary answer on a fresh device.
    "mob.iap.restoreNothing":
      "There is nothing to restore. This device has no earlier App Store transaction for this Apple ID.",
    "subjedit.noChargeNow": "Nothing is charged now — the subject is unlocked right away.",
    "mob.subjedit.notInApp": "This change can't be completed in the app. Removing a subject, or restoring one you cancelled, still works here.",
    // See the az block: "are not obtained in this app" implied an external
    // channel for content that costs nothing anywhere.
    "mob.oly.notInApp": "Olympiad packages opened for your child appear here automatically, and in their \"My Olympiads\" section.",
    "mob.cancel.untilEnd": "Access continues until the end of the paid period.",
    "mob.oly.duration": "Duration",
    "mob.unit.min": "min",
    "mob.pw.show": "Show password",
    "mob.pw.hide": "Hide password",
    "mob.arena.streakAtRisk": "Play a round today or your streak resets!",
    "mob.onb.s1.title": "A new round every day",
    "mob.onb.s1.body":
      "Solve the daily 25-question rounds, earn points and climb a real leaderboard.",
    "mob.onb.s2.title": "Olympiad preparation",
    "mob.onb.s2.body":
      "Once an olympiad package is unlocked, its questions stay yours for life.",
    "mob.onb.s3.title": "Parents stay in control",
    "mob.onb.s3.body":
      "Parents manage which subjects are open — the child account stays safe.",
    "mob.onb.skip": "Skip",
    "mob.onb.next": "Next",
    "mob.login.about": "About OlympIQ",
    "mob.notif.today": "Today",
    "mob.notif.yesterday": "Yesterday",
    "mob.notif.unread": "Unread: {n}",
    "mob.push.ch.default": "General notifications",
    "mob.push.ch.olympiad": "Olympiads",
    "mob.push.ch.progress": "Progress",
    "mob.push.ch.billing": "Payments",
    "mob.push.ch.announcement": "Announcements",
    "mob.push.ch.news": "News",
    "mob.info.section": "Information",
    "mob.contact.mapUnavailable": "The map couldn't load. Open the address in your maps app.",
    "mob.link.openFailed": "Couldn't open this link. Is a suitable app installed on your device?",
    "mob.contact.directions": "Get directions",
    "mob.contact.mapLabel": "Map of our address",
    "mob.lock.section": "Security",
    "mob.lock.title": "Biometric lock",
    "mob.lock.subtitle": "Ask for fingerprint or face confirmation when the app opens.",
    "mob.lock.unavailable": "Biometric authentication is not set up on this device.",
    "mob.lock.prompt": "Confirm your identity",
    "mob.lock.lockedTitle": "App is locked",
    "mob.lock.lockedBody": "Confirm your identity to continue.",
    "mob.lock.unlock": "Unlock",
    "mob.plb.viewFull": "View full leaderboard",
    "mob.contact.openMaps": "Open in maps",
    "mob.app.version": "Version {v}",
    "pricing2.weekly.name": "Weekly",
    "pricing2.weekly.desc": "A subject is unlocked for a weekly cycle and renews every week.",
    "pricing2.weekly.b1": "A short cycle, renewed weekly",
    "pricing2.weekly.b2": "Each subject is unlocked separately",
    "pricing2.weekly.b3": "Handy for trying the platform out",
    "pricing2.monthly.name": "Monthly",
    "pricing2.monthly.desc": "A subject is unlocked for a monthly cycle — the usual choice for steady practice.",
    "pricing2.monthly.b1": "A full month of uninterrupted access",
    "pricing2.monthly.b2": "Each subject is unlocked separately",
    "pricing2.monthly.b3": "Daily rounds and practice tests included",
    "pricing2.yearly.name": "Yearly",
    "pricing2.yearly.desc": "A subject stays unlocked for the whole school year.",
    "pricing2.yearly.b1": "A full year of uninterrupted access",
    "pricing2.yearly.b2": "Each subject is unlocked separately",
    "pricing2.yearly.b3": "Covers the entire school year",
    "pricing2.title": "Subscription cycles",
    "pricing2.sub": "A subscription is chosen per child and per subject. Here is what each cycle covers.",
    "pricing2.note": "Subscriptions are not managed in this app — this page only explains how the cycles work.",
    "polyPub.sub": "The olympiad packages that are active right now.",
    "poly.subtitle": "Browse the active olympiad packages — the ones unlocked for your child are marked here.",
    "poly.owned": "Unlocked",
    "poly.modal.already": "This package is already unlocked for your child.",
    "subjects.note": "Each subject is unlocked separately and can differ from child to child.",
    "oly4.buyNote": "To take part in this olympiad, talk to your parent — it shows up here once the package is unlocked for you.",
    "oly3.childNone": "You don't have any olympiad packages yet — talk to your parent.",
    "oly5.errNoAccess": "You don't have access to this olympiad — talk to your parent.",
  },
  ru: {
    "about2.b3.body": "В каждой попытке искусственный интеллект автоматически подбирает 25 вопросов — сложность никто не выбирает сам. Пакеты активируются один раз и дают безлимитный доступ.",
    "parent.child.intro": "Введите данные ребёнка. 8-значный ID для входа создаётся после выбора предметов.",
    "parent.dash.idPending": "ID ожидается — выберите предметы",
    // ---- STORE COMPLIANCE OVERRIDES ------------------------------------
    // These keys exist in the WEB catalog with purchasing language, which is
    // correct there and forbidden here. docs/STORE_PAYMENTS_COMPLIANCE.md: a
    // store build carries no purchase imperative, no trial/billing walkthrough
    // and no subscribe-family CTA — in the PARENT tabs too, because the
    // consumption-only test is app-wide. Overriding beats deleting the slides:
    // the onboarding still explains the product, it just stops selling it.
    "carousel.i2.body": "Выберите предметы, нужные вашему ребёнку: математика, наука, логика, английский. Их можно изменить в любой момент.",
    "carousel.i2.title": "Выберите предметы для ребёнка",
    "carousel.i3.body": "После активации предметов система выдаёт уникальный 8-значный ID для входа. Ребёнок входит по этому ID и заданному вами паролю — эл. почта не нужна.",
    "carousel.i5.body": "Олимпиадные пакеты дают ребёнку пожизненный доступ к охваченным темам. Есть вопрос? Напишите нам со страницы «Контакты».",
    "parent.dash.choosePlan": "Выбрать предметы",
    "faq.q3": "Как открывается доступ к предмету?",
    "faq.a3": "Доступ к каждому предмету открывается через родительский аккаунт. Ученик никогда не открывает доступ сам.",
    "faq.q6": "Сколько длится доступ к предмету?",
    "faq.a6": "У каждого предмета свой период, и по его окончании доступ закрывается. Родитель получает уведомление до даты окончания.",
    // См. блок az: в форме отмены назывались цена и скидка на Android.
    "cancel.reason.price": "Нам это не подходит",
    "cancel.benefit3": "Оставшееся время текущего доступа",
    "faq.q5": "Может ли ученик сам открыть доступ?",
    "faq.a5": "Нет. Доступ к предметам открывается только через родительский аккаунт.",
    "faq.q7": "Как это работает для нескольких детей в одной семье?",
    "faq.a7": "Родитель может добавить нескольких детей из одного аккаунта. У каждого ребёнка свой 8-значный ID и свой доступ к предметам.",
    "mob.welcome.tagline": "Самый увлекательный способ готовиться к олимпиадам",
    "mob.welcome.studentLogin": "Вход для ученика",
    "mob.update.title": "Требуется обновление",
    "mob.update.body":
      "Эта версия приложения больше не поддерживается. Обновите её в магазине, чтобы продолжить.",
    "mob.update.cta": "Обновить",
    "mob.update.openFailed":
      "Не удалось открыть магазин. Откройте магазин приложений и обновите приложение вручную.",
    "mob.updateAvailable.title": "Доступна новая версия",
    "mob.updateAvailable.body":
      "Вышла более новая версия приложения. Обновление принесёт последние исправления и улучшения — это можно сделать и позже.",
    "mob.updateAvailable.cta": "Обновить",
    "mob.updateAvailable.later": "Позже",
    "mob.boot.error": "Не удалось загрузить. Проверьте подключение к интернету.",
    "mob.err.serverUnavailable": "Сервер сейчас не отвечает. Повторите попытку чуть позже.",
    "mob.err.network": "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.",
    "mob.retry": "Повторить",
    "mob.refresh.failed": "Не удалось обновить. Проверьте подключение.",
    "mob.refreshing": "Обновление…",
    "mob.refreshed": "Данные обновлены",
    "mob.about.less": "Свернуть",
    "mob.about.more": "Подробнее",
    "mob.childId": "8-значный ID ученика",
    "mob.childIdPh": "1234 5678",
    "mob.parentPassword": "Пароль, заданный родителем",
    "mob.forgotOnWeb": "Восстановление пароля откроется на сайте.",
    "mob.placeholder.title": "Скоро",
    "mob.placeholder.body": "Этот раздел появится на следующем этапе.",
    "mob.gallery.title": "Галерея дизайна",
    "mob.session.expired": "Сессия истекла — войдите снова.",
    "mob.prof.confirmPassword": "Подтвердите пароль",
    "mob.prof.passwordMismatch": "Пароли не совпадают.",
    "mob.prof.deleteFinal": "Последний шаг: это действие нельзя отменить. Удалить аккаунт навсегда?",
    "mob.prof.avatarPrivate":
      "Твоё фото видишь только ты и твой родитель. Если удалить фото, файл удаляется полностью.",
    "prof2.err.generic": "Не удалось выполнить действие. Повторите попытку позже.",
    "mob.pay.notInApp": "Подписки не управляются в этом приложении. Здесь показано только текущее состояние.",
    "mob.gate.allOpen": "Сейчас все предметы открыты для ваших детей.",
    "mob.addchild.idReady": "Ребёнок уже может войти по этому ID. Доступ к предметам пока не активен.",
    "mob.select.cancel": "Отмена",
    "mob.select.search": "Поиск…",
    "mob.select.noResults": "Ничего не найдено",
    "mob.sub.accessUntil": "Доступ до",
    // ---- APPLE IN-APP PURCHASE (iOS ONLY) ------------------------------
    // Rendered only where IAP_PLATFORM_SUPPORTED is true; an Android build
    // resolves none of these keys because nothing asks for them.
    //
    // NO AMOUNT APPEARS IN ANY OF THESE STRINGS AND NONE EVER MAY. The only
    // price the app shows is StoreKit's own `displayPrice`, straight onto the
    // button — already localised, already in the viewer's storefront currency,
    // already right about tax. A price written here would be wrong for most of
    // the world on the day it was typed.
    //
    // The vocabulary is deliberately plain (activate / access / restore) rather
    // than the obvious selling verbs. Two reasons, and neither is squeamishness:
    // the app's shared copy sweep bans that vocabulary catalogue-wide because it
    // also reaches the CHILD side of this one binary, and "access" is simply
    // what a non-renewing period actually is.
    "mob.iap.title": "Активация через App Store",
    "mob.iap.intro":
      "Выберите предмет для ребёнка. Активация завершается в App Store, и доступ открывается сразу.",
    "mob.iap.noRenew":
      "Автоматического продления нет: доступ заканчивается по окончании срока, а новый вы начинаете сами.",
    "mob.iap.loading": "Проверяем App Store…",
    "mob.iap.working": "Подождите…",
    "mob.iap.done": "Готово — доступ открыт.",
    // THE MOST IMPORTANT SENTENCE IN THIS FILE: shown when money has moved and
    // the grant could not be confirmed. It must never read as a failure.
    "mob.iap.pending":
      "Оплата записана. Доступ откроется автоматически в течение нескольких минут. Если этого не произошло, нажмите кнопку восстановления ниже.",
    "mob.iap.deferred":
      "Запрос ожидает подтверждения. Доступ откроется автоматически, как только организатор семьи его подтвердит.",
    "mob.iap.err.generic": "Не удалось завершить. Попробуйте ещё раз через минуту.",
    "mob.iap.err.unavailable":
      "Не удалось связаться с App Store. Проверьте подключение и попробуйте ещё раз.",
    "mob.iap.err.notAllowed":
      "Операции App Store ограничены на этом устройстве. Проверьте ограничения в разделе «Экранное время».",
    "mob.iap.restore": "Восстановить доступ",
    "mob.iap.restoreHint": "Нажмите, если ранее оплаченный доступ не отображается.",
    "mob.iap.restoreWorking": "Проверяем…",
    "mob.iap.restoreDone": "Доступ восстановлен.",
    // Calm, not an error: this is the ordinary answer on a fresh device.
    "mob.iap.restoreNothing":
      "Восстанавливать нечего. На этом устройстве нет прежних операций App Store для этого Apple ID.",
    "subjedit.noChargeNow": "Сейчас ничего не списывается — предмет открывается сразу.",
    "mob.subjedit.notInApp": "Это изменение нельзя завершить в приложении. Удалить предмет или вернуть отменённый можно здесь.",
    // См. блок az: «не оформляются в этом приложении» указывало на внешний
    // канал для контента, который нигде ничего не стоит.
    "mob.oly.notInApp": "Олимпиадные пакеты, открытые для вашего ребёнка, автоматически появляются здесь и в его разделе \"Мои олимпиады\".",
    "mob.cancel.untilEnd": "Доступ сохраняется до конца оплаченного периода.",
    "mob.oly.duration": "Длительность",
    "mob.unit.min": "мин",
    "mob.pw.show": "Показать пароль",
    "mob.pw.hide": "Скрыть пароль",
    "mob.arena.streakAtRisk": "Реши раунд сегодня, иначе серия сгорит!",
    "mob.onb.s1.title": "Каждый день — новый раунд",
    "mob.onb.s1.body":
      "Решай ежедневные раунды из 25 вопросов, зарабатывай очки и поднимайся в настоящем рейтинге.",
    "mob.onb.s2.title": "Подготовка к олимпиадам",
    "mob.onb.s2.body":
      "Когда олимпиадный пакет открыт, доступ к его вопросам остаётся навсегда.",
    "mob.onb.s3.title": "Родители всё контролируют",
    "mob.onb.s3.body":
      "Доступом к предметам управляют родители — детский аккаунт остаётся в безопасности.",
    "mob.onb.skip": "Пропустить",
    "mob.onb.next": "Далее",
    "mob.login.about": "Об OlympIQ",
    "mob.notif.today": "Сегодня",
    "mob.notif.yesterday": "Вчера",
    "mob.notif.unread": "Непрочитанных: {n}",
    "mob.push.ch.default": "Общие уведомления",
    "mob.push.ch.olympiad": "Олимпиады",
    "mob.push.ch.progress": "Прогресс",
    "mob.push.ch.billing": "Платежи",
    "mob.push.ch.announcement": "Объявления",
    "mob.push.ch.news": "Новости",
    "mob.info.section": "Информация",
    "mob.contact.mapUnavailable": "Карта не загрузилась. Откройте адрес в приложении карт.",
    "mob.link.openFailed": "Не удалось открыть ссылку. Установлено ли подходящее приложение?",
    "mob.contact.directions": "Построить маршрут",
    "mob.contact.mapLabel": "Карта с нашим адресом",
    "mob.lock.section": "Безопасность",
    "mob.lock.title": "Биометрическая блокировка",
    "mob.lock.subtitle": "Запрашивать отпечаток пальца или распознавание лица при открытии приложения.",
    "mob.lock.unavailable": "На этом устройстве не настроена биометрическая аутентификация.",
    "mob.lock.prompt": "Подтвердите личность",
    "mob.lock.lockedTitle": "Приложение заблокировано",
    "mob.lock.lockedBody": "Подтвердите личность, чтобы продолжить.",
    "mob.lock.unlock": "Разблокировать",
    "mob.plb.viewFull": "Открыть полный рейтинг",
    "mob.contact.openMaps": "Открыть на карте",
    "mob.app.version": "Версия {v}",
    "pricing2.weekly.name": "Недельный",
    "pricing2.weekly.desc": "Предмет открывается на недельный период и продлевается каждую неделю.",
    "pricing2.weekly.b1": "Короткий период с еженедельным продлением",
    "pricing2.weekly.b2": "Каждый предмет открывается отдельно",
    "pricing2.weekly.b3": "Удобно, чтобы познакомиться с платформой",
    "pricing2.monthly.name": "Месячный",
    "pricing2.monthly.desc": "Предмет открывается на месяц — привычный вариант для регулярных занятий.",
    "pricing2.monthly.b1": "Месяц непрерывного доступа",
    "pricing2.monthly.b2": "Каждый предмет открывается отдельно",
    "pricing2.monthly.b3": "Ежедневные раунды и тренировочные тесты включены",
    "pricing2.yearly.name": "Годовой",
    "pricing2.yearly.desc": "Предмет остаётся открытым весь учебный год.",
    "pricing2.yearly.b1": "Год непрерывного доступа",
    "pricing2.yearly.b2": "Каждый предмет открывается отдельно",
    "pricing2.yearly.b3": "Охватывает весь учебный год",
    "pricing2.title": "Периоды подписки",
    "pricing2.sub": "Подписка выбирается для каждого ребёнка и каждого предмета отдельно. Ниже — что включает каждый период.",
    "pricing2.note": "Подписки не управляются в этом приложении — здесь только объясняется, как устроены периоды.",
    "polyPub.sub": "Олимпиадные пакеты, активные сейчас.",
    "poly.subtitle": "Просматривайте активные олимпиадные пакеты — открытые для вашего ребёнка отмечены здесь.",
    "poly.owned": "Открыт",
    "poly.modal.already": "Этот пакет уже открыт для вашего ребёнка.",
    "subjects.note": "Каждый предмет открывается отдельно и может отличаться у разных детей.",
    "oly4.buyNote": "Чтобы участвовать в этой олимпиаде, поговори с родителем — она появится здесь, когда пакет откроют для тебя.",
    "oly3.childNone": "У тебя пока нет открытых олимпиадных пакетов — поговори с родителем.",
    "oly5.errNoAccess": "У тебя нет доступа к этой олимпиаде — поговори с родителем.",
  },
};
