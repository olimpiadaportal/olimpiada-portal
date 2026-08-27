# OlympIQ — Privacy Policy / Məxfilik Siyasəti / Политика конфиденциальности

> **Document status:** drafted 2026-07-30 by the engineering team, from the actual code and database schema.
> **Not yet published. Not yet reviewed by a lawyer.** See the [Annex](#annex--internal-notes-do-not-publish) at the end of this file.
>
> **What this file is for:** it is the single source for the privacy policy in all three product languages.
> Publish it as a public web page (Azerbaijani / English / Russian), link it from the App Store Connect
> "Privacy Policy URL" field, from the Google Play Data safety section, from the web app footer, and from
> inside both mobile apps.
>
> **Before publishing:** every place marked **`[OWNER MUST CONFIRM: …]`** must be replaced with a real value
> or the surrounding sentence removed. Then delete the Annex — it is an internal working note, not policy text.

**Languages in this document**

| Language | Section |
|---|---|
| Azərbaycan dili (default) | [Bölmə A — Məxfilik Siyasəti](#bölmə-a--olympiq-məxfilik-siyasəti) |
| English | [Part B — Privacy Policy](#part-b--olympiq-privacy-policy) |
| Русский | [Часть C — Политика конфиденциальности](#часть-c--политика-конфиденциальности-olympiq) |

Each of the three versions below is **complete and standalone**. A parent, or a store reviewer, reads one
of them — never a mixture.

---
---

# Bölmə A — OlympIQ Məxfilik Siyasəti

**Qüvvəyə minmə tarixi:** 04.08.2026
**Son yenilənmə:** 04.08.2026

Bu siyasət OlympIQ veb saytına və OlympIQ mobil tətbiqinə (iOS və Android) aiddir.

---

## A1. Bir baxışda — sadə dillə

OlympIQ 1–11-ci sinif şagirdləri üçün təhsil məhsuludur. Uşaqların məlumatları ilə işlədiyimiz üçün
qısa və dürüst olmağa çalışırıq.

**Nə edirik:**

- Yalnız hesabın işləməsi üçün lazım olan məlumatı toplayırıq: valideynin əlaqə məlumatları, uşağın adı,
  məktəbi, sinfi və məşq nəticələri.
- Uşağın hesabını **valideyn yaradır və idarə edir**. Uşaq özü qeydiyyatdan keçə bilmir.
- Valideyn istənilən vaxt tətbiqin içindən bütün ailə hesabını silə bilər.

**Nə etmirik:**

- ❌ **Reklam yoxdur.** Tətbiqdə heç bir reklam şəbəkəsi, reklam SDK-sı yoxdur.
- ❌ **İzləmə yoxdur.** Nə mobil tətbiqdə, nə veb saytda analitika, atribusiya və ya çökmə hesabatı
  toplayan üçüncü tərəf alətləri quraşdırılmayıb. Reklam identifikatoru (IDFA, Android Advertising ID)
  heç vaxt oxunmur.
- ❌ **Məlumatları satmırıq, icarəyə vermirik, mübadilə etmirik** və marketinq məqsədi ilə heç kimə
  ötürmürük.
- ❌ **Məkanınızı, kameranızı, kontaktlarınızı və mikrofonunuzu istəmirik.**
- ❌ **Uşaq davranışına görə reklam profili qurmuruq.**
- ❌ **Kart məlumatlarınızı görmürük.** Mobil tətbiqdə alış prosesi yoxdur — alış yalnız veb saytda
  həyata keçirilir.

---

## A2. Biz kimik və bizimlə necə əlaqə saxlamaq olar

| | |
|---|---|
| Məhsul | **OlympIQ** — 1–11-ci siniflər üçün olimpiada və imtahan hazırlığı platforması |
| Layihəni həyata keçirən | **Kamil Piriyev** (VÖEN: **6300091352**) və tərəfdaşları |
| Hüquqi ünvan | Azərbaycan Respublikası, Lerik rayonu, Peştətük kəndi |
| Dəstək e-poçtu | `[OWNER MUST CONFIRM: dəstək e-poçt ünvanı]` |
| Telefon | `[OWNER MUST CONFIRM: dəstək telefonu]` |
| Veb sayt | `[OWNER MUST CONFIRM: dərc olunmuş sayt ünvanı]` |
| Məxfilik sorğuları üçün ünvan | `[OWNER MUST CONFIRM: məxfilik/məlumat sorğuları üçün e-poçt]` |

Məlumatlarınızla bağlı hər hansı sual, şikayət və ya silinmə tələbi üçün yuxarıdakı e-poçt ünvanına yazın.

> `[OWNER MUST CONFIRM: Məlumatların rəsmi "operatoru"nun kim olduğu — fiziki şəxs, fərdi sahibkar,
> yoxsa hüquqi şəxs — hüquqi məsələdir və bu siyasət dərc olunmazdan əvvəl dəqiqləşdirilməlidir.]`

---

## A3. Ailə hesabı modeli — məxfilik üçün ən vacib bölmə

OlympIQ-də hesab modeli adi tətbiqlərdən fərqlidir və bu, məhz uşaq təhlükəsizliyi üçün belə qurulub:

- **Yalnız valideyn qeydiyyatdan keçir** — e-poçt və parol ilə.
- **Uşaq heç vaxt özü qeydiyyatdan keçə bilmir.** Nə vebdə, nə mobil tətbiqdə uşaq üçün qeydiyyat yolu
  yoxdur. Bu, dizayn qərarıdır və serverdə tətbiq olunur.
- **Uşağın profilini valideyn yaradır** və uşaq haqqındakı bütün məlumatı (ad, soyad, şəhər, rayon,
  məktəb, sinif) valideyn özü daxil edir.
- **Uşağın e-poçt ünvanı yoxdur.** Sistem daxilində uşağın giriş qeydi üçün heç vaxt işlədilməyən,
  poçt qəbul etməyən texniki bir ünvan istifadə olunur; uşaq onu görmür və ondan istifadə etmir.
- **Uşaq 8 rəqəmli nömrə ilə daxil olur.** Bu nömrəni server verir, parolu isə valideyn təyin edir.
- **Uşaq heç nə ala bilmir.** Bu, serverdə tətbiq olunur, sadəcə interfeysdə gizlədilmir.
- **Uşaq heç nə silə bilmir.** Hesabın sahibi valideyndir; silmə səlahiyyəti də ondadır.

Nəticə: uşaq haqqındakı məlumatın hansı həcmdə mövcud olacağına **valideyn qərar verir** və istənilən
vaxt onu tamamilə silə bilər.

---

## A4. Hansı məlumatları toplayırıq

### A4.1 Valideyn hesabı

| Məlumat | Məcburidir? | Niyə toplayırıq |
|---|---|---|
| Ad (görünən ad) | Bəli | Hesabı tanımaq və tətbiqdə sizə müraciət etmək üçün |
| E-poçt ünvanı | Bəli | Giriş açarı; parolun bərpası; hesabla bağlı bildirişlər |
| Telefon nömrəsi (beynəlxalq formatda) | Bəli | Hesabla bağlı əlaqə və hesabın bərpası üçün. **SMS göndərmirik** — SMS funksiyası məhsulda ümumiyyətlə mövcud deyil |
| Parol | Bəli | Giriş üçün. **Parolu biz saxlamırıq** — o, yalnız autentifikasiya xidmətimizdə şifrələnmiş (hash) formada saxlanılır və heç kim onu oxuya bilmir |
| İnterfeys dili (az / en / ru) | Xeyr | Tətbiqi sizin dilinizdə göstərmək üçün |
| Profil şəkli (avatar) | Xeyr | Yalnız görünüş üçün. Bax: A5.4 — bu fayl açıq saxlanc bölməsinə yüklənir |
| Bildiriş tənzimləmələri | Xeyr | Hansı kanaldan bildiriş almaq istədiyinizi yadda saxlamaq üçün |
| Bəyəndiyiniz xəbərlər | Xeyr | Xəbər məqaləsinə qoyduğunuz "bəyənmə" qeyd olunur |

Valideyn tətbiq daxilində adını, telefonunu, parolunu və avatarını dəyişə bilər. **E-poçt ünvanını
tətbiq daxilində dəyişmək mümkün deyil** — bunun üçün bizimlə əlaqə saxlayın.

### A4.2 Uşaq (şagird) profili — məlumatı valideyn daxil edir

| Məlumat | Məcburidir? | Niyə toplayırıq |
|---|---|---|
| Ad və soyad | Bəli | Tətbiqdə uşağa müraciət etmək üçün; reytinq cədvəlində **"Ad S."** formatında göstərilir (bax A5.3) |
| Şəhər və rayon | Bəli | Regional reytinq cədvəlləri üçün |
| Məktəbin adı | Bəli | Məktəb üzrə reytinq cədvəli üçün |
| Sinif | Bəli | Uşağa öz sinfinə uyğun sualların verilməsi üçün |
| 8 rəqəmli giriş nömrəsi | Server verir | Uşağın giriş açarı. **Bu nömrənin son 4 rəqəmi ictimai reytinq cədvəlində göstərilir** (bax A5.3) |
| Parol | Bəli (valideyn təyin edir) | Giriş üçün. Parol yalnız autentifikasiya xidmətimizdə şifrələnmiş formada saxlanılır |
| Avatar | Xeyr | Hazır şəkillərdən biri, yaxud yüklənmiş foto. Bax A5.4 — yükləmə yolu vacibdir |
| Rəng/stiker seçimi | Xeyr | Uşağın seçdiyi görünüş |
| Məşq məlumatları | Avtomatik | Cavablandırılmış suallar, seçilmiş variantlar, düzgün/səhv, sualda keçirilən vaxt, bal, faiz, seriya (streak), aktiv günlər, reytinq mövqeyi, nailiyyətlər |
| Artıq görülmüş olimpiada sualları | Avtomatik | Uşağa eyni sualın təkrar düşməməsi üçün |
| Bildiriş tənzimləmələri, bəyənilən xəbərlər | Xeyr | Valideyn hesabındakı ilə eyni məqsəd |

**Doğum tarixini və ya doğum ilini toplamırıq.** Uşağın yaşını soruşmuruq — sinif məlumatı kifayətdir.

Uşaq özü yalnız aşağıdakıları dəyişə bilər: **öz adı və soyadı** (bu, reytinq cədvəlindəki adını da
dəyişir), **parolu**, **avatarı** və **rəng seçimi**. Məktəb, şəhər, rayon və sinif uşaq üçün yalnız
oxunaqlıdır — onları yalnız valideyn dəyişə bilər.

### A4.3 Texniki və cihaz məlumatları

| Məlumat | Nə vaxt | Niyə |
|---|---|---|
| Push bildiriş nişanı (token) + cihazın modeli, əməliyyat sisteminin versiyası, tətbiqin versiyası | Yalnız push bildirişləri aktivdirsə və siz icazə vermisinizsə | Bildirişi düzgün cihaza çatdırmaq üçün. **Heç bir reklam və ya avadanlıq identifikatoru oxunmur.** Çıxış edərkən token serverdən silinir. `[OWNER MUST CONFIRM: dərc anında push bildirişləri işləyirmi? Hazırda bu funksiya server tərəfdə söndürülüb.]` |
| Uşağın giriş cəhdlərinin qeydi: 8 rəqəmli nömrə, IP ünvanının **şifrələnmiş izi (SHA-256 hash)**, uğurlu/uğursuz, vaxt | Hər giriş cəhdində | Parolun zorla tapılmasının qarşısını almaq üçün. **Xam IP ünvanı saxlanılmır** |
| Server jurnalları (log) — o cümlədən IP ünvanı və brauzerin/cihazın identifikasiya sətri | Hər sorğuda | Hostinq təchizatçılarımızın standart texniki jurnalları; təhlükəsizlik və nasazlıqların aradan qaldırılması üçün. Saxlanma müddəti: `[OWNER MUST CONFIRM]` |
| Giriş qeydləri (autentifikasiya xidmətində) | Hər girişdə | Autentifikasiya xidmətimiz öz təhlükəsizlik jurnalını aparır. `[OWNER MUST CONFIRM: bu jurnalda nələr və nə qədər saxlanılır]` |

### A4.4 Cihazın qorunan yaddaşında saxlanan məlumatlar (mobil tətbiq)

Mobil tətbiq cihazın öz qorunan yaddaşında (iOS Keychain / Android Keystore) yalnız bunları saxlayır:

- giriş sessiyanız,
- barmaq izi/üz kilidinin açıq və ya bağlı olması (sadəcə "1" və ya "0"),
- tanışlıq ekranının göstərilib-göstərilmədiyi,
- push nişanının nüsxəsi,
- seçdiyiniz dil və mövzu (açıq/tünd).

Bu siyahıdakı **seçimlər** (kilid, tanışlıq ekranı, dil və mövzu) cihazdan kənara ümumiyyətlə çıxmır.
Giriş sessiyası hər sorğuda autentifikasiya xidmətimizə göndərilir — onun funksiyası elə budur; push
nişanı isə push aktiv olduqda serverimizdə saxlanılır (bax A4.3). Bunlardan başqa heç nə göndərilmir.

### A4.5 Kuki (cookie) — veb sayt

Veb saytda yalnız **işləmək üçün zəruri** kukilər istifadə olunur:

- **Giriş sessiyası kukiləri** — siz saytda qaldığınız müddətdə daxil olmuş qalmağınız üçün.
- **`locale` kukisi** — seçdiyiniz interfeys dilini yadda saxlamaq üçün (1 il).
- Açıq/tünd mövzu seçimi brauzerin öz yaddaşında (localStorage) saxlanılır.
- Eyni xəbərin baxış sayının təkrar hesablanmaması üçün brauzerin **sessiya yaddaşında** qısamüddətli
  nişan qoyulur; brauzerin tabı bağlananda silinir.

**Reklam kukisi, analitika kukisi və izləmə pikseli yoxdur.**

---

## A5. Uşaqların məlumatları — ayrıca və vacib bölmə

> Bu bölmə OlympIQ-in uşaq məxfiliyi siyasətidir. Uşaqlar üçün nəzərdə tutulmuş məhsul olduğumuza görə
> bu bölməni ayrıca yazırıq ki, valideyn bir yerdə hər şeyi görsün.

### A5.1 Uşaq haqqında nə saxlanılır

Yuxarıdakı **A4.2** cədvəlindəki hər şey: ad, soyad, şəhər, rayon, məktəb, sinif, 8 rəqəmli giriş
nömrəsi, seçilmiş avatar və görünüş, məşq nəticələri (cavablar, ballar, faizlər, seriyalar, aktiv
günlər, reytinq mövqeyi).

**Uşaq haqqında toplamadığımız məlumatlar:** doğum tarixi, e-poçt, telefon nömrəsi, ev ünvanı, məkan,
sağlamlıq məlumatı, maliyyə məlumatı, kontaktlar, brauzer tarixçəsi, cihaz identifikatoru.

### A5.2 Uşaq məlumatı ilə nə **etmirik**

- Uşağa reklam göstərmirik və reklam üçün profil qurmuruq.
- Uşağın davranışını tətbiqlər və saytlar arasında izləmirik.
- Uşaq məlumatını satmırıq, icarəyə vermirik və marketinq üçün heç kimə vermirik.
- Uşağın yazdığı heç bir mətni dərc etmirik — **yeganə istisna onun öz adı və soyadıdır**: şagird
  bunları özü dəyişə bilir və reytinq cədvəlində "Ad S." formatında məhz bu ad görünür. Bundan başqa
  uşağın digər istifadəçilərə göstərə biləcəyi sərbəst mətn yoxdur.
- Tətbiqdə **çat, mesajlaşma, şərh, forum yoxdur**. Uşaq başqa istifadəçi ilə ünsiyyət qura bilmir.
- Uşağı heç nə almağa təşviq etmirik. Uşaq sessiyasında qiymət, ödəniş və alış düyməsi göstərilmir.

### A5.3 Reytinq cədvəllərində nə görünür — dürüst izahat

Bu, valideynin bilməli olduğu ən vacib məqamlardan biridir. **İki fərqli reytinq cədvəli var:**

**1) Tətbiq daxilindəki reytinq cədvəli — yalnız hesabı olan istifadəçilər görür**

Sistemə daxil olmuş **istənilən valideyn və istənilən şagird** reytinqdə olan hər uşaq haqqında bunları
görür:

| Göstərilir | Nümunə |
|---|---|
| Ad və soyadın ilk hərfi | `Aysel M.` |
| Şəhər | `Bakı` |
| Rayon | `Nəsimi` |
| Məktəbin adı | `142 nömrəli tam orta məktəb` |
| Sinif | `7` |
| Nəticə göstəriciləri | faiz, cavablandırılmış sual sayı, düzgün cavab sayı, cəhd sayı |

Uşağın **tam soyadı, avatarı, 8 rəqəmli nömrəsi və valideyninin əlaqə məlumatları göstərilmir.**

**2) Saytın ana səhifəsindəki ictimai ilk 10 — hesabı olmayan hər kəs görür**

Burada uşağın adı **göstərilmir**. Onun əvəzinə `Şagird 4821` formatında təxəllüs göstərilir.
Bu 4 rəqəm uşağın **8 rəqəmli giriş nömrəsinin son dörd rəqəmidir**. Bununla yanaşı, bu ictimai
cədvəldə **şəhər, rayon, məktəbin adı və sinif də göstərilir**.

> **Valideyn üçün dürüst xəbərdarlıq:** kiçik bir rayon məktəbində "məktəb + sinif + rayon"
> kombinasiyası uşağı tanımaq üçün kifayət edə bilər, ad göstərilməsə belə. Bunu gizlətmirik.
>
> `[OWNER MUST CONFIRM: İctimai cədvəldə məktəb/rayon/sinif sütunlarının qalıb-qalmaması qərar
> tələb edir. Əgər dərcdən əvvəl bu sütunlar silinsə, bu abzas da yenilənməlidir.]`

Reytinq cədvəllərində **medal, mükafat və pul yoxdur** — yalnız rəqəmli yerlər.

### A5.4 Avatar şəkilləri — vacib fərq

| Hansı yol | Fayl harada saxlanılır | Kim görə bilər |
|---|---|---|
| **Valideyn uşaq üçün foto yükləyir** (Uşaq əlavə et / Uşağı redaktə et) | **Qapalı** saxlanc bölməsi | Yalnız ailə üzvləri, qısamüddətli imzalanmış keçid vasitəsilə |
| **Şagird öz profilindən özü foto yükləyir** | **Açıq** saxlanc bölməsi | Faylın birbaşa linkini bilən **hər kəs** |
| **Valideyn öz avatarını yükləyir** | **Açıq** saxlanc bölməsi | Faylın birbaşa linkini bilən hər kəs |

> **Bunu açıq şəkildə bildiririk:** şagird öz profilindən yüklədiyi foto açıq saxlanc bölməsinə düşür.
> Linki bilməyən onu tapa bilməz, amma link yayılarsa, fayl istənilən şəxs üçün açıq olar.
> **Hazır (preset) avatarlar defolt seçimdir və heç bir foto yükləmək tələb olunmur.** Uşağınızın
> fotosunun yüklənməsini istəmirsinizsə, hazır avatarlardan istifadə edin.
>
> `[OWNER MUST CONFIRM: Bu asimmetriya dərcdən əvvəl düzəldilməlidir (şagird yolu da qapalı bölməyə
> keçirilməli, yaxud şagirdin foto yükləmə imkanı ləğv edilməlidir). Düzəldilsə, bu cədvəl yenilənməlidir.]`

Avatarın silinməsi **yola görə fərqli işləyir**. Valideynin uşaq üçün yüklədiyi foto dəyişdirildikdə və
ya silindikdə **qapalı saxlancdan tamamilə silinir**. Valideynin öz avatarı və şagirdin özünün yüklədiyi
foto isə **yalnız profildən ayrılır**: şəkil artıq profildə görünmür, lakin fayl açıq saxlancda qalır.
(Bu, hesabın tam silinməsindən fərqlidir — bax A9.4.)

### A5.5 Valideyn uşağın məlumatını necə silir

- **Tam ailə hesabını silmək:** valideyn profili → "Təhlükəli zona" → "Hesabı sil" → iki mərhələli
  təsdiq. Bu, valideyn hesabını **və yaratdığı bütün uşaq profillərini** silir. Həm veb saytda, həm də
  mobil tətbiqdə mövcuddur.
- **Yalnız bir uşağı silmək:** hazırda **yalnız veb saytda** — valideyn panelindən. Mobil tətbiqdə ayrıca
  uşaq silmək imkanı yoxdur.
- **Şagird heç nə silə bilmir.**

Silinmə **dərhal baş verir** — gözləmə müddəti, geri qaytarma və ya "arxivə salma" yoxdur.
Nəyin silindiyi və nəyin qaldığı **A9** bölməsində ətraflı yazılıb.

---

## A6. Məlumatları nə üçün istifadə edirik

**İstifadə edirik:**

1. Hesabı yaratmaq, girişi təmin etmək və hesabın təhlükəsizliyini qorumaq.
2. Uşağın sinfinə və məktəb rübünə uyğun sualları seçmək.
3. Cavabları qiymətləndirmək, bal, faiz, seriya və irəliləyiş statistikasını hesablamaq.
4. Valideynə uşağın irəliləyişi haqqında hesabat göstərmək.
5. Reytinq cədvəllərini formalaşdırmaq (A5.3-də təsvir olunduğu kimi).
6. Bildiriş göndərmək (yeni raund, nəticə, seriya, xəbər, hesabla bağlı məlumat).
7. Sui-istifadənin, avtomatlaşdırılmış hücumların və parol seçmə cəhdlərinin qarşısını almaq.
8. Sizə dəstək göstərmək və sorğularınıza cavab vermək.
9. Ailənin hansı fənlərə və olimpiada paketlərinə çıxışının olduğunu müəyyən etmək.
10. Qanunla tələb olunan hallarda hüquqi öhdəliklərimizi yerinə yetirmək.

**İstifadə **etmirik**:**

- ❌ Reklam göstərmək və ya reklam profili qurmaq üçün.
- ❌ Sizi və ya uşağınızı başqa tətbiq və saytlarda izləmək üçün.
- ❌ Məlumatı satmaq, icarəyə vermək və ya reklam brokerlərinə vermək üçün.
- ❌ Kredit, sığorta, işə qəbul və bu kimi qərarlar üçün.
- ❌ Uşağa qarşı avtomatik və hüquqi nəticə doğuran qərarlar qəbul etmək üçün.
- ❌ Üçüncü tərəflərin reklam və ya profilləşdirmə sistemlərini "öyrətmək" üçün.

---

## A7. Məlumatı kimlərlə bölüşürük

**OlympIQ daxilində kimin çıxışı var.** Dürüst olmaq üçün bunu da yazırıq: OlympIQ-in səlahiyyətli
administratorları və kontent menecerləri daxili idarəetmə panelində hesab və təlim məlumatlarına baxa
bilər — xidmətin işləməsi, kontentin idarə olunması və dəstək sorğularına cavab vermək üçün. Çıxış rola
görə məhdudlaşdırılıb: verilənlər bazasında sətir səviyyəsində təhlükəsizlik (RLS) tətbiq olunur və hər
daxili rol yalnız öz işi üçün lazım olan icazələrə malikdir. Administratorların hesablar və kontent
üzərində əməliyyatları audit jurnalına yazılır.

Məlumatlarınızı **satmırıq**. Aşağıdakı xidmət təminatçıları xidmətin işləməsi üçün lazımdır və hər biri
yalnız öz funksiyası üçün lazım olanı alır:

| Xidmət təminatçısı | Rolu | Nə alır | Status |
|---|---|---|---|
| **Supabase** | Verilənlər bazası, autentifikasiya, fayl saxlancı | Bütün məhsul məlumatları (şifrələnmiş kanal üzərindən) | Aktiv |
| **Vercel** | Veb saytın hostinqi | Standart server sorğu jurnalları (IP, brauzer sətri) | Aktiv |
| **Expo / EAS** | Mobil tətbiqin yeniləmələri və push bildirişlərinin ötürülməsi | Tətbiq açılanda yeniləmə yoxlaması: tətbiqin versiyası, platforma, quraşdırmaya aid anonim identifikator və IP ünvanınız; push aktiv olduqda — push nişanı | Yeniləmə yoxlaması aktiv. **Push hazırda işləmir** `[OWNER MUST CONFIRM]` |
| **Apple (APNs)** | iOS-da push çatdırılması | Yalnız push aktiv olduqda — standart push ötürülməsi | Push aktivləşənə qədər heç nə almır |
| **Google (FCM)** | Android-də push çatdırılması | Yalnız push aktiv olduqda — standart push ötürülməsi | Push aktivləşənə qədər heç nə almır |
| **Google Fonts** | Veb saytın bəzi səhifələrində şrift | Brauzerinizin IP ünvanı və identifikasiya sətri | Aktiv (yalnız veb; mobil tətbiqdə yoxdur) |
| **Google Maps** | "Əlaqə" səhifəsindəki xəritə | Həmin səhifəni açdığınız anda IP ünvanı və identifikasiya sətri. **Hesab məlumatı ötürülmür** | Aktiv |
| **Ödəniş təminatçısı** | Gələcəkdə vebdə ödəniş | — | **Hazırda heç bir ödəniş təminatçısı qoşulmayıb** (bax A8) |

Bundan əlavə, məlumatı yalnız aşağıdakı hallarda paylaşa bilərik:

- qanunun tələb etdiyi hallarda (məhkəmə qərarı, səlahiyyətli dövlət orqanının qanuni sorğusu);
- həyat və sağlamlıq üçün təcili təhlükənin qarşısını almaq üçün;
- öz hüquqlarımızı müdafiə etmək və sui-istifadəni araşdırmaq üçün.

**Serverlərin yerləşdiyi ölkə:** `[OWNER MUST CONFIRM: Supabase və Vercel layihələrinin regionu. Əgər
məlumat Azərbaycandan kənarda saxlanılırsa, bu, burada açıq yazılmalıdır.]`

> `[OWNER MUST CONFIRM: Yuxarıdakı şirkətlərin hüquqi statusunun necə təsvir olunması ("bizim adımızdan
> işləyən operator" yoxsa "məlumatın ötürüldüyü üçüncü tərəf") hüquqi məsələdir.]`

---

## A8. Ödənişlər

- **Mobil tətbiqdə alışı tamamlamaq mümkün deyil**: kart formu, kart məlumatlarının daxil edilməsi və
  ödəniş addımı tətbiqdə mövcud deyil.
- Ödənişlər yalnız **veb saytda, brauzerdə, Azərbaycan manatı ilə** həyata keçirilir.
- Ödəniş bankın öz səhifəsinə tam yönləndirmə ilə aparılacaq. **Kart nömrəsi, CVV və digər kart
  məlumatları heç vaxt OlympIQ serverlərinə düşməyəcək və bizdə saxlanılmayacaq.**
- Verilənlər bazasında ödənişlə bağlı yalnız məbləğ, valyuta, status və təminatçının əməliyyat nömrəsi
  qeyd olunacaq.

**Qiymətlərin göstərilməsi ödəniş rejimindən asılıdır.** Ödənişlər söndürülü olduğu müddətdə mobil
tətbiqin heç bir yerində qiymət göstərilmir. Ödənişlər aktivləşdirilərsə, tətbiq valideynə və ya hesabı
olmayan ziyarətçiyə abunə qiymətlərini **yalnız məlumat üçün** göstərə bilər; **şagird sessiyasında
qiymət heç vaxt göstərilmir** və alış heç bir halda tətbiqin özündə tamamlana bilmir.

**Hazırkı vəziyyət:** platformada ödənişlər **söndürülüb** və heç bir ödəniş təminatçısı hələ inteqrasiya
olunmayıb. `[OWNER MUST CONFIRM: dərc anında bu vəziyyət dəyişibsə, bu bölmə yenilənməlidir və
təminatçının adı əlavə edilməlidir.]`

---

## A9. Məlumatların saxlanması və silinməsi

### A9.1 Hesab aktiv olduğu müddətdə

Hesab məlumatları və məşq nəticələri hesab açıq qaldığı müddətdə saxlanılır — çünki bunlar məhsulun
özüdür (irəliləyiş qrafikləri, seriyalar, reytinq).

- **Oxunmuş bildirişlər** avtomatik olaraq silinir — **hazırda 180 gündən** sonra; hər istifadəçinin
  bildiriş qutusu isə hazırda 500 elementlə məhdudlaşdırılır. Hər iki rəqəm platforma tənzimləməsidir
  (`system_settings`) və administrator tərəfindən dəyişdirilə bilər.
- Digər məlumat növləri üçün hazırda avtomatik silinmə müddəti təyin edilməyib.
  `[OWNER MUST CONFIRM: məşq nəticələri, audit jurnalı və giriş cəhdləri üçün konkret saxlanma müddəti
  təyin edilməli və burada yazılmalıdır.]`

### A9.2 Hesabı necə silmək olar

**Mobil tətbiqdə və ya veb saytda:** valideyn kimi daxil olun → yuxarıdakı avatar → **"Profil"** →
ən aşağıda **"Təhlükəli zona"** → **"Hesabı sil"** → iki mərhələli təsdiq.

Bu əməliyyat **dərhal** icra olunur və **geri qaytarıla bilmir**. Texniki nasazlıq səbəbindən proses
yarımçıq qalarsa, yuxarıdakı e-poçt ünvanına yazın — silinməni əl ilə tamamlayacağıq.

### A9.3 Silinmə zamanı nə silinir

Valideyn hesabı silindikdə aşağıdakıların hamısı silinir:

- valideyn profili və giriş qeydi;
- **yaratdığı bütün uşaq profilləri** və onların giriş qeydləri;
- 8 rəqəmli nömrələr və onların qeydiyyatı;
- bütün cəhdlər, cavablar, ballar, faizlər, seriyalar, aktiv günlər, nailiyyətlər;
- reytinq yazıları və artıq görülmüş olimpiada suallarının qeydi;
- abunəliklər, çıxış hüquqları, endirim və promokod qeydləri;
- bildirişlər, bildiriş tənzimləmələri və push nişanları;
- bəyəndiyiniz xəbərlərin qeydi.

### A9.4 Silinmədən sonra nə qalır — dürüst siyahı

Aşağıdakılar qəsdən saxlanılır və ya texniki səbəbdən qalır:

| Nə qalır | Niyə | Şəxsi məlumat qalırmı? |
|---|---|---|
| Ödəniş və alış qeydləri | Mühasibat və vergi öhdəlikləri | **Adsızlaşdırılır** — şəxsə keçid silinir; yalnız məbləğ, valyuta, status və tarix qalır |
| Hesabla bağlı əməliyyatların audit yazıları (qeydiyyat, uşaq profilinin yaradılması, parol sıfırlamaları, abunəlik və alış hadisələri, həmçinin silinmənin özü) | Təhlükəsizlik jurnalı | Şəxsə keçid silinir (`actor_profile_id` → NULL). Bu yazılarda ad, IP ünvanı və brauzerin identifikasiya sətri saxlanılmır |
| **Dondurulmuş reytinq arxivləri** (mövsüm və ay yekunları) | Keçmiş nəticələrin tarixçəsi | ⚠️ Mövsüm arxivində **"Ad S." formatında ad** və daxili identifikator qala bilər. `[OWNER MUST CONFIRM: bu arxivlərin silinmə zamanı təmizlənməsi qərarı verilməlidir]` |
| **Yüklənmiş avatar faylları** və onların qeydləri | — | ⚠️ Hesabın silinməsi verilənlər bazasındakı qeydləri silir, faylların özünü isə silmir — həm açıq, həm də qapalı saxlanc bölməsində. (Ayrıca "avatarı sil" düyməsi uşağın fotosunu həqiqətən silir — bax A5.4.) `[OWNER MUST CONFIRM: silinmə zamanı faylların da silinməsi əlavə edilməlidir]` |
| Uşağın giriş cəhdlərinin jurnalı (8 rəqəmli nömrə, IP-nin şifrələnmiş izi, vaxt) | Təhlükəsizlik | ⚠️ Qalır. `[OWNER MUST CONFIRM: saxlanma müddəti təyin edilməlidir]` |
| Bankdan gələn ödəniş bildirişlərinin ilkin qeydləri (yalnız ödəniş təminatçısı qoşulduqdan sonra — hazırda qoşulmayıb) | Maliyyə uzlaşdırması | ⚠️ Bankın göndərdiyi şəkildə, təminatçının əməliyyat nömrəsi ilə saxlanılır. Bankın öz bildirişinə daxil etdiyi məlumatlar — məsələn ödəyicinin adı və ya kartın maskalanmış nömrəsi — orada ola bilər. `[OWNER MUST CONFIRM: ilk callback saxlanılmazdan əvvəl sahə ağ siyahısı (allowlist) yazılmalıdır]` |
| Ehtiyat nüsxələr (backup) | Fəlakətdən bərpa | `[OWNER MUST CONFIRM: ehtiyat nüsxələrin saxlanma müddəti]` |

### A9.5 Məlumatlarınızın nüsxəsini almaq

Hazırda tətbiqdə "məlumatları yüklə" düyməsi yoxdur. Ailənizin məlumatlarının nüsxəsini istəyirsinizsə,
yuxarıdakı e-poçt ünvanına yazın — sorğunuza cavab verəcəyik.

---

## A10. Təhlükəsizlik

Aşağıdakılar həqiqətən tətbiq olunur:

- **Bütün trafik şifrələnir** (HTTPS/TLS). Veb saytda HSTS aktivdir; iOS tətbiqində şifrələnməmiş
  bağlantılar tamamilə qadağandır.
- **Parolları biz saxlamırıq.** Həm valideyn, həm uşaq parolları yalnız autentifikasiya xidmətimizdə
  şifrələnmiş (hash) formada saxlanılır. Bizim verilənlər bazamızda parol sütunu yoxdur.
- **Verilənlər bazasında sətir səviyyəsində təhlükəsizlik (RLS)** tətbiq olunub: şagird yalnız öz
  qeydini, valideyn yalnız öz uşaqlarının qeydlərini görə bilir.
- **Mobil tətbiqdə heç bir imtiyazlı açar yoxdur.** İmtiyazlı əməliyyatlar yalnız serverdə icra olunur.
- **Sessiya açarları cihazın öz qorunan yaddaşında** saxlanılır (iOS Keychain / Android Keystore) —
  adi fayl və ya açıq yaddaşda deyil.
- **Uşağın girişi bloklanır:** 15 dəqiqə ərzində 8 uğursuz cəhddən sonra həmin nömrə müvəqqəti kilidlənir.
  Bu zaman IP ünvanı **xam şəkildə deyil, şifrələnmiş iz kimi** yazılır.
- **Valideyn giriş, qeydiyyat və parol bərpası səhifələri** sorğu tezliyinə görə məhdudlaşdırılır.
- **Yüklənən şəkillər faylın adına deyil, faylın həqiqi məzmununa görə yoxlanılır.** İcazə verilən
  formatlar: PNG, JPEG və WebP; **GIF** yalnız valideynin öz avatarı və şagirdin özü üçün yüklədiyi şəkil
  üçün qəbul edilir, valideynin uşaq üçün yüklədiyi foto üçün isə qəbul edilmir. Maksimum ölçü 2 MB.
  **SVG tamamilə qadağandır** (təhlükəsizlik riski).
- **Barmaq izi / üz ilə kilid:** cihazınız bizə yalnız "təsdiqləndi / təsdiqlənmədi" cavabını qaytarır.
  **Biometrik məlumat heç vaxt cihazdan çıxmır və bizə ötürülmür.** Biz yalnız kilidin açıq və ya bağlı
  olduğunu yadda saxlayırıq.
- **Administrator əməliyyatları jurnala yazılır.**

Bununla belə, dürüst olmaq lazımdır: **internetdə heç bir sistem 100% təhlükəsiz deyil.** Biz ağlabatan
texniki və təşkilati tədbirləri görürük, lakin mütləq təhlükəsizliyə zəmanət verə bilmərik.
Parolunuzu heç kimlə paylaşmayın.

---

## A11. Sizin hüquqlarınız və onlardan necə istifadə etmək olar

| Nə etmək istəyirsiniz | Necə |
|---|---|
| Valideyn adını, telefonunu, parolunu və ya avatarını dəyişmək | Tətbiqdə: profil səhifəsi |
| Valideyn e-poçtunu dəyişmək | Tətbiqdə mümkün deyil — bizə yazın |
| Uşağın ad, soyad, şəhər, rayon, məktəb, sinif məlumatını dəyişmək | Tətbiqdə: valideyn → uşağı redaktə et |
| Uşağın parolunu sıfırlamaq | Tətbiqdə: valideyn → uşağı redaktə et |
| Uşağın avatarını dəyişmək və ya silmək | Tətbiqdə: valideyn və ya şagird profili |
| Bildirişləri söndürmək | Tətbiqdəki bildiriş tənzimləmələri; həmçinin cihazın sistem parametrləri |
| Bir uşağı silmək | Veb saytda: valideyn paneli |
| Bütün ailə hesabını silmək | Tətbiqdə və veb saytda: profil → Təhlükəli zona |
| Məlumatların nüsxəsini almaq | Bizə yazın |
| Şikayət etmək və ya sual vermək | Bizə yazın |

Yaşadığınız ölkənin qanunvericiliyindən asılı olaraq əlavə hüquqlarınız ola bilər.
`[OWNER MUST CONFIRM: hansı qanunvericiliyə istinad ediləcəyi və nəzarət orqanına şikayət yolunun
göstərilib-göstərilməyəcəyi hüquqşünasla dəqiqləşdirilməlidir.]`

---

## A12. Cihaz icazələri

| İcazə | Nə vaxt istənilir | Nə üçün |
|---|---|---|
| **Foto kitabxanası** | Yalnız siz "avatarı dəyiş" düyməsinə basdıqda | Profil şəkli seçmək üçün. Hazır avatarlar defoltdur — foto yükləmək məcburi deyil |
| **Bildirişlər** | Yalnız sistemə daxil olduqdan sonra və yalnız funksiya aktiv olduqda | Yeni raund, nəticə, seriya və hesabla bağlı bildirişlər üçün. **Reklam üçün heç vaxt.** İmtina etsəniz, bir daha soruşulmur |
| **Barmaq izi / Face ID** | Yalnız siz tətbiq kilidini özünüz aktivləşdirdikdə | Tətbiqi parol yazmadan açmaq üçün. Kilidi həm açmaq, həm bağlamaq üçün təsdiq tələb olunur |

**Sizdən heç vaxt istəmirik:** kamera, məkan, kontaktlar, mikrofon, təqvim, sağlamlıq, Bluetooth, izləmə
icazəsi (App Tracking Transparency). Tətbiq kameranı heç vaxt açmır və şəkil çəkmək imkanı ümumiyyətlə
yoxdur.

> **Android üçün dürüst qeyd:** istifadə etdiyimiz foto seçimi komponenti (`expo-image-picker`) öz
> manifestində kamera və yaddaş icazələrini elan edir, buna görə onları telefonun "Tətbiq haqqında"
> siyahısında görə bilərsiniz. Tətbiq bu icazələrdən istifadə etmir və sizə kamera sorğusu göstərmir.
> `[OWNER MUST CONFIRM: bu icazələri build zamanı manifestdən çıxarmaq daha dürüst həlldir]`

---

## A13. Bu siyasətdə dəyişikliklər

Siyasəti yeniləyə bilərik. Yenilədikdə yuxarıdakı **"Son yenilənmə"** tarixini dəyişəcəyik.
Əhəmiyyətli dəyişiklik olarsa, tətbiq daxilində və ya e-poçt vasitəsilə xəbərdarlıq edəcəyik.
Dəyişiklik qüvvəyə mindikdən sonra xidmətdən istifadəni davam etdirməyiniz yenilənmiş siyasəti qəbul
etdiyiniz anlamına gəlir.

**Suallarınız üçün:** `[OWNER MUST CONFIRM: dəstək e-poçtu]`

---
---

# Part B — OlympIQ Privacy Policy

**Effective date:** 04.08.2026
**Last updated:** 04.08.2026

This policy covers the OlympIQ website and the OlympIQ mobile app for iOS and Android.

---

## B1. The short version

OlympIQ is an education product for school students in grades 1–11 in Azerbaijan. Because we handle
children's data, we try to be short and honest.

**What we do:**

- We collect only what an account needs to work: the parent's contact details, the child's name, school,
  grade, and their practice results.
- **A parent creates and controls the child's profile.** A child can never register on their own.
- A parent can delete the entire family account from inside the app at any time.

**What we never do:**

- ❌ **No advertising.** There is no ad network and no ad SDK anywhere in the app.
- ❌ **No tracking.** Neither the mobile app nor the website contains any third-party analytics,
  attribution or crash-reporting tool. We never read an advertising identifier (no IDFA, no Android
  Advertising ID).
- ❌ **We do not sell, rent or trade your data**, and we never hand it to anyone for marketing.
- ❌ **We never ask for your location, camera, contacts or microphone.**
- ❌ **We do not build advertising profiles from a child's behaviour.**
- ❌ **We never see your card details.** There is no checkout in the mobile app — purchases happen only
  on the website.

---

## B2. Who we are and how to reach us

| | |
|---|---|
| Product | **OlympIQ** — an olympiad and exam preparation platform for grades 1–11 |
| Operated by | **Kamil Piriyev** (Tax Identification Number / VÖEN: **6300091352**) and his partners |
| Legal address | Peshtatuk village, Lerik District, Republic of Azerbaijan |
| Support email | `[OWNER MUST CONFIRM: support email address]` |
| Phone | `[OWNER MUST CONFIRM: support phone number]` |
| Website | `[OWNER MUST CONFIRM: the published website address]` |
| Privacy / data requests | `[OWNER MUST CONFIRM: privacy contact email]` |

For any question, complaint or deletion request about your data, write to the address above.

> `[OWNER MUST CONFIRM: who the formal data controller is — an individual, a sole trader, or a registered
> legal entity — is a legal question and must be settled before this policy is published.]`

---

## B3. The family account model — the most important section for privacy

OlympIQ's account model is unusual, and it is built that way specifically for child safety:

- **Only a parent can register**, using an email address and a password.
- **A child can never register.** There is no sign-up path for a child on the website or in the mobile
  app. This is a design decision and it is enforced on the server.
- **A parent creates the child's profile** and enters every piece of information about the child
  themselves — first name, last name, city, district, school and grade.
- **A child has no email address.** Internally, the child's login record uses a technical, non-deliverable
  address that never receives mail; the child never sees or uses it.
- **A child signs in with an 8-digit number** issued by our server, plus a password the parent chose.
- **A child can never buy anything.** This is enforced on the server, not merely hidden in the interface.
- **A child can never delete anything.** The parent is the account holder for the whole family, and holds
  the deletion power.

The result: **the parent decides how much data about the child exists**, and can remove all of it at any
time.

---

## B4. What we collect

### B4.1 Parent account

| Data | Required? | Why we collect it |
|---|---|---|
| Name (display name) | Yes | To identify the account and address you in the app |
| Email address | Yes | Your login credential; password reset; account notices |
| Phone number (international format) | Yes | Account contact and recovery. **We do not send SMS** — SMS is not implemented in the product at all |
| Password | Yes | To sign in. **We do not store your password** — it is held only by our authentication service in hashed form, which nobody can read back |
| Interface language (az / en / ru) | No | To show the app in your language |
| Profile picture (avatar) | No | Cosmetic only. See B5.4 — this file goes to a publicly-readable storage area |
| Notification preferences | No | To remember which channels you want to hear from |
| News articles you liked | No | A record of the "like" you placed on an article |

A parent can change their name, phone, password and avatar in the app. **The email address cannot be
changed in the app** — contact us instead.

### B4.2 Child (student) profile — entered by the parent

| Data | Required? | Why we collect it |
|---|---|---|
| First name and last name | Yes | To address the child in the app; shown on leaderboards as **"Firstname L."** (see B5.3) |
| City and district (*rayon*) | Yes | For regional leaderboards |
| School name | Yes | For the school leaderboard |
| Grade | Yes | So the child is served questions that match their grade |
| 8-digit login ID | Issued by our server | The child's login credential. **The last 4 digits of this number are shown on the public leaderboard** (see B5.3) |
| Password | Yes (set by the parent) | To sign in. Held only by our authentication service, in hashed form |
| Avatar | No | Either a preset image or an uploaded photo. See B5.4 — the upload path matters |
| Colour / sticker choice | No | The child's chosen look |
| Learning data | Automatic | Questions answered, options selected, right/wrong, time spent per question, points, percentages, streaks, active days, leaderboard position, achievements |
| Which olympiad questions the child has already seen | Automatic | So the same question is not served twice |
| Notification preferences, liked news | No | Same purpose as on the parent account |

**We do not collect a date of birth or a year of birth.** We never ask a child's age — the grade is enough.

A child can change only the following about themselves: **their own first and last name** (which also
changes the name shown on the leaderboard), **their password**, **their avatar** and **their colour
choice**. School, city, district and grade are read-only to the child — only the parent can change them.

### B4.3 Technical and device data

| Data | When | Why |
|---|---|---|
| Push notification token + device model name, OS version, app version | Only if push notifications are switched on and you granted permission | To deliver a notification to the right device. **No advertising identifier and no hardware identifier is ever read.** The token is deleted from our server when you sign out. `[OWNER MUST CONFIRM: will push be live at publication? It is currently switched off server-side.]` |
| Child sign-in attempt log: the 8-digit number, a **SHA-256 hash of the IP address**, success/failure, time | On every sign-in attempt | To stop password-guessing attacks. **The raw IP address is never stored** |
| Server logs — including IP address and browser/device user agent | On every request | Standard technical logs kept by our hosting providers, for security and troubleshooting. Retention: `[OWNER MUST CONFIRM]` |
| Sign-in records held by the authentication service | On every sign-in | Our authentication service keeps its own security log. `[OWNER MUST CONFIRM: what it holds and for how long]` |

### B4.4 Kept in your device's protected storage (mobile app)

The mobile app stores only the following in the device's own protected storage (iOS Keychain /
Android Keystore):

- your sign-in session,
- whether the biometric app lock is on or off (literally just "1" or "0"),
- whether the welcome screens have been shown,
- a copy of the push token,
- your chosen language and light/dark theme.

The **preferences** in this list (the lock, the welcome screens, your language and theme) never leave the
device at all. Your sign-in session is sent to our authentication service on every request — that is what
it is for — and the push token is stored on our server while push is enabled (see B4.3). Nothing else is
transmitted.

### B4.5 Cookies — website

The website uses **strictly necessary** cookies only:

- **Session cookies** — to keep you signed in while you are on the site.
- **A `locale` cookie** — to remember your chosen interface language (1 year).
- The light/dark theme choice is stored in your browser's own local storage.
- A short-lived marker in your browser's **session storage**, so the same news article is not counted
  twice in its view count. It is cleared when the browser tab closes.

**There are no advertising cookies, no analytics cookies and no tracking pixels.**

---

## B5. Children's data — a separate and important section

> This section is OlympIQ's children's privacy policy. Because our product is directed at minors, we set
> it out separately so a parent can see everything in one place.

### B5.1 What is stored about a child

Everything in the **B4.2** table: first name, last name, city, district, school, grade, the 8-digit login
number, the chosen avatar and look, and practice results (answers, points, percentages, streaks, active
days, leaderboard placement).

**What we never collect about a child:** date of birth, email address, phone number, home address,
location, health data, financial data, contacts, browsing history, device identifiers.

### B5.2 What we never do with a child's data

- We do not show advertising to a child and we do not build advertising profiles.
- We do not track a child's behaviour across other apps or websites.
- We do not sell, rent or share children's data for marketing.
- We do not publish anything a child writes, **with one exception: their own first and last name**. A
  student can change these themselves, and it is that name which appears on leaderboards as
  "Firstname L.". There is no other free text a child can show to other users.
- There is **no chat, no messaging, no comments and no forum** in the app. A child cannot communicate with
  another user.
- We never encourage a child to buy anything. No price, no payment option and no purchase button is
  displayed in a student session.

### B5.3 What appears on leaderboards, and to whom — stated plainly

This is one of the most important things for a parent to understand. **There are two different
leaderboards:**

**1) The in-app leaderboard — visible to signed-in users only**

Any **signed-in parent and any signed-in student** sees the following about every ranked child:

| Shown | Example |
|---|---|
| First name and the initial of the surname | `Aysel M.` |
| City | `Baku` |
| District (*rayon*) | `Nasimi` |
| School name | `School No. 142` |
| Grade | `7` |
| Performance figures | percentage, questions answered, correct answers, number of attempts |

The child's **full surname, avatar, 8-digit number and the parent's contact details are not shown.**

**2) The public top-10 on the website's home page — visible to anyone, with no account**

Here the child's name is **not** shown. Instead a pseudonym such as `Şagird 4821` is displayed.
Those four digits are **the last four digits of the child's 8-digit login number.** Alongside the
pseudonym, this public table also shows the **city, district, school name and grade**.

> **An honest warning for parents:** in a small district school, the combination of school + grade +
> district may be enough to recognise a child even without a name. We are not hiding this.
>
> `[OWNER MUST CONFIRM: whether the school / district / grade columns stay on the public table is a
> decision that must be made. If they are removed before publication, update this paragraph.]`

Leaderboards carry **no medals, no prizes and no money** — only numeric ranks.

### B5.4 Avatar photos — an important difference

| Which path | Where the file is stored | Who can see it |
|---|---|---|
| **A parent uploads a photo for a child** (Add child / Edit child) | **Private** storage area | Only family members, through a short-lived signed link |
| **A student uploads a photo from their own profile** | **Public** storage area | **Anyone** who has the file's direct link |
| **A parent uploads their own avatar** | **Public** storage area | Anyone who has the file's direct link |

> **We state this openly:** a photo a student uploads from their own profile lands in a publicly-readable
> storage area. Someone who does not have the link cannot find it, but if the link is passed around, the
> file is readable by anyone.
> **Preset avatars are the default and no photo is ever required.** If you do not want your child's photo
> uploaded, use a preset avatar.
>
> `[OWNER MUST CONFIRM: this asymmetry should be fixed before publication — either move the student path
> to the private area, or remove the student's ability to upload a photo. If fixed, update this table.]`

Removing an avatar **behaves differently depending on the path**. A photo a parent uploaded for a child is
**erased from the private storage area** when it is replaced or removed. A parent's own avatar and a photo
a student uploaded themselves are **only unlinked**: the picture stops appearing on the profile, but the
file remains in the public storage area. (This is separate from full account deletion — see B9.4.)

### B5.5 How a parent removes a child's data

- **Delete the whole family account:** parent profile → "Danger Zone" → "Delete account" → a two-step
  confirmation. This deletes the parent account **and every child profile the parent created**. Available
  both on the website and in the mobile app.
- **Delete a single child:** currently **on the website only**, from the parent dashboard. The mobile app
  has no delete-a-child option.
- **A student can delete nothing.**

Deletion is **immediate** — there is no waiting period, no undo and no "archive" state. What is erased and
what survives is set out in detail in **B9**.

---

## B6. How we use the data

**We use it to:**

1. Create the account, sign you in and keep the account secure.
2. Select questions that match the child's grade and the current school term.
3. Score answers and calculate points, percentages, streaks and progress statistics.
4. Show the parent a report of the child's progress.
5. Build the leaderboards (exactly as described in B5.3).
6. Send notifications (a new round, a result, a streak, news, account notices).
7. Prevent abuse, automated attacks and password-guessing.
8. Provide support and answer your requests.
9. Determine which subjects and olympiad packages the family has access to.
10. Meet our legal obligations where the law requires it.

**We do not use it to:**

- ❌ Show advertising or build advertising profiles.
- ❌ Track you or your child across other apps and websites.
- ❌ Sell, rent or hand data to advertising brokers.
- ❌ Make credit, insurance, employment or similar decisions.
- ❌ Make automated decisions about a child with legal effect.
- ❌ Train third-party advertising or profiling systems.

---

## B7. Who we share data with

**Access inside OlympIQ.** To be straightforward about this: authorised OlympIQ administrators and content
managers can access account and learning data through an internal admin panel, in order to run the
service, manage content and answer support requests. Access is limited by role: the database enforces
row-level security and each internal role holds only the permissions its job requires. Administrator
actions on accounts and content are written to an audit log.

We do **not** sell your data. The following service providers are needed to run the service, and each one
receives only what its function requires:

| Service provider | Role | What it receives | Status |
|---|---|---|---|
| **Supabase** | Database, authentication, file storage | All product data, over an encrypted connection | Active |
| **Vercel** | Website hosting | Standard server request logs (IP, user agent) | Active |
| **Expo / EAS** | Mobile app updates and push notification relay | An update check at launch: the app version, the platform, an anonymous per-installation identifier and your IP address; the push token when push is enabled | Update check active. **Push is not operational today** `[OWNER MUST CONFIRM]` |
| **Apple (APNs)** | iOS push delivery | Only once push is on — standard push transport | Receives nothing until push is enabled |
| **Google (FCM)** | Android push delivery | Only once push is on — standard push transport | Receives nothing until push is enabled |
| **Google Fonts** | A font on some website pages | Your browser's IP address and user agent | Active (website only; not in the mobile app) |
| **Google Maps** | The map on the "Contact" screen | Your IP address and user agent at the moment that screen is opened. **No account data is passed** | Active |
| **Payment provider** | Future web payments | — | **No payment provider is integrated today** (see B8) |

Beyond this, we may share data only:

- where the law requires it (a court order, a lawful request from a competent authority);
- to prevent an urgent threat to life or health;
- to defend our rights and investigate abuse.

**Where the servers are located:** `[OWNER MUST CONFIRM: the region of the Supabase project and the Vercel
deployment. If data is stored outside Azerbaijan, that must be stated openly here.]`

> `[OWNER MUST CONFIRM: how these companies should be characterised legally ("processors acting on our
> instructions" vs "third parties we share data with") is a legal question.]`

---

## B8. Payments

- **A purchase can never be completed in the mobile app**: there is no card form, no card entry and no
  payment step in the app at all.
- Payments happen only **on the website, in a browser, in Azerbaijani manat**.
- Payment uses a full redirect to the bank's own hosted page. **Card numbers, CVV codes and other card
  details never reach OlympIQ servers and are never stored by us.**
- Our database records only the amount, the currency, the status and the provider's transaction
  reference.

**No price is shown in the mobile apps, in any mode.** Prices and purchasing exist only on the website.
This is a property of the app itself, not a setting: the mobile builds contain no price, no purchase
button and no checkout, so nothing a parent or a student does inside the app can produce one.

**Current status:** card payments are integrated with our acquiring bank (AzeriCard, through
Azerbaijan-resident billing), but **no card payment is being taken at the moment** — nobody is being
charged. Access granted during a free promotional period involves no card and no payment data at all.
When charging is open it happens only on the website, and is never completed inside the mobile apps.

---

## B9. Retention and deletion

### B9.1 While the account is open

Account details and practice results are kept for as long as the account exists — because they *are* the
product (progress charts, streaks, ranking).

- **Read notifications** are deleted automatically — **currently after 180 days** — and each user's inbox
  is currently capped at 500 items. Both figures are platform settings (`system_settings`) and can be
  changed by an administrator.
- No automatic deletion period is currently set for the other data types.
  `[OWNER MUST CONFIRM: a concrete retention period must be chosen and stated here for learning data,
  audit logs and sign-in attempt logs.]`

### B9.2 How to delete the account

**In the mobile app or on the website:** sign in as a parent → the avatar at the top → **"Profile"** →
scroll to **"Danger Zone"** → **"Delete account"** → a two-step confirmation.

This runs **immediately** and **cannot be undone**. In the rare case that a technical fault interrupts it,
write to the email address above and we will complete the deletion manually.

### B9.3 What is erased

When a parent account is deleted, all of the following go with it:

- the parent profile and login record;
- **every child profile the parent created** and their login records;
- the 8-digit numbers and their allocation records;
- all attempts, answers, points, percentages, streaks, active days and achievements;
- leaderboard entries and the record of olympiad questions already seen;
- subscriptions, access entitlements, discount and coupon records;
- notifications, notification preferences and push tokens;
- the record of news articles that were liked.

### B9.4 What survives — an honest list

The following are kept on purpose, or remain for technical reasons:

| What survives | Why | Does personal data remain? |
|---|---|---|
| Payment and purchase records | Accounting and tax obligations | **Anonymised** — the link to the person is removed; only amount, currency, status and date remain |
| Audit entries for account actions (registration, creating a child profile, password resets, subscription and purchase events, and the deletion itself) | Security log | The link to the person is removed (`actor_profile_id` → NULL). These entries store no name, no IP address and no browser user agent |
| **Frozen leaderboard archives** (season and monthly finals) | A historical record of past results | ⚠️ A season archive may retain the **"Firstname L."** label and an internal identifier. `[OWNER MUST CONFIRM: whether these archives should be scrubbed on deletion]` |
| **Uploaded avatar files** and their metadata | — | ⚠️ Deleting the account removes the database records but not the files themselves, in both the public and the private storage areas. (The separate "remove avatar" button *does* erase a child's photo — see B5.4.) `[OWNER MUST CONFIRM: file cleanup should be added to the deletion path]` |
| The child sign-in attempt log (8-digit number, hashed IP, timestamp) | Security | ⚠️ Retained. `[OWNER MUST CONFIRM: a retention period must be set]` |
| Raw payment notifications received from the bank (only once a payment provider is connected — none is today) | Financial reconciliation | ⚠️ Stored as the bank sends them, keyed by the provider's transaction reference. They may contain whatever the bank includes, such as a payer name or a masked card number. `[OWNER MUST CONFIRM: a field allowlist must be written before the first callback is persisted]` |
| Backups | Disaster recovery | `[OWNER MUST CONFIRM: backup retention period]` |

### B9.5 Getting a copy of your data

There is no "download my data" button in the app today. If you want a copy of your family's data, write to
the email address above and we will respond to your request.

---

## B10. Security

The following are genuinely in place:

- **All traffic is encrypted** (HTTPS/TLS). The website enforces HSTS; the iOS app forbids unencrypted
  connections entirely.
- **We do not store passwords.** Both parent and child passwords are held only by our authentication
  service, in hashed form. Our database has no password column.
- **Row-level security is enabled across the database**: a student can read only their own record, and a
  parent only the records of their own children.
- **The mobile app holds no privileged key.** Privileged operations run only on the server.
- **Session tokens live in the device's own protected storage** (iOS Keychain / Android Keystore) — never
  in an ordinary file or plain storage.
- **Child sign-in lockout:** after 8 failed attempts within 15 minutes, that number is temporarily locked.
  The IP address is recorded as a **hash, never in raw form**.
- **Parent sign-in, registration and password-reset pages are rate limited.**
- **Uploaded images are validated from the file's actual bytes, not from its name.** Permitted formats:
  PNG, JPEG and WebP; **GIF** is additionally accepted for a parent's own avatar and a student's
  self-uploaded picture, but not for a photo a parent uploads for a child. Maximum size 2 MB.
  **SVG is banned entirely** (a security risk).
- **Biometric app lock:** your device returns only a "verified / not verified" answer to us.
  **Biometric data never leaves your device and is never transmitted to us.** We store only whether the
  lock is on or off.
- **Administrator actions are written to an audit log.**

That said, we should be honest: **no system on the internet is 100% secure.** We take reasonable technical
and organisational measures, but we cannot guarantee absolute security. Never share your password with
anyone.

---

## B11. Your rights and how to exercise them

| What you want to do | How |
|---|---|
| Change the parent name, phone, password or avatar | In the app: profile page |
| Change the parent email address | Not possible in the app — write to us |
| Change a child's name, city, district, school or grade | In the app: parent → edit child |
| Reset a child's password | In the app: parent → edit child |
| Change or remove a child's avatar | In the app: parent or student profile |
| Turn notifications off | Notification preferences in the app, and your device's system settings |
| Delete one child | On the website: parent dashboard |
| Delete the whole family account | In the app and on the website: profile → Danger Zone |
| Get a copy of your data | Write to us |
| Complain or ask a question | Write to us |

Depending on where you live, you may have additional legal rights.
`[OWNER MUST CONFIRM: which legal framework is cited, and whether a route for complaining to a supervisory
authority should be named — to be settled with a lawyer.]`

---

## B12. Device permissions

| Permission | When it is asked for | What it is for |
|---|---|---|
| **Photo library** | Only when you tap "change avatar" | To choose a profile picture. Preset avatars are the default — uploading a photo is never required |
| **Notifications** | Only after signing in, and only when the feature is enabled | For new rounds, results, streaks and account notices. **Never for advertising.** If you decline, you are never asked again |
| **Fingerprint / Face ID** | Only when you turn on the optional app lock yourself | To open the app without typing a password. Turning the lock both on *and* off requires a successful check |

**We never ask you for:** camera, location, contacts, microphone, calendar, health, Bluetooth, or tracking
permission (App Tracking Transparency). The app never opens the camera and has no way to take a photo at
all.

> **An honest note for Android:** the photo-picker component we use (`expo-image-picker`) declares camera
> and storage permissions in its own manifest, so you may see them listed in the phone's App info screen.
> The app never uses them and never shows you a camera prompt.
> `[OWNER MUST CONFIRM: stripping these permissions at build time is the more honest fix]`

---

## B13. Changes to this policy

We may update this policy. When we do, we will change the **"Last updated"** date above. If the change is
significant, we will tell you in the app or by email. Continuing to use the service after a change takes
effect means you accept the updated policy.

**Questions:** `[OWNER MUST CONFIRM: support email]`

---
---

# Часть C — Политика конфиденциальности OlympIQ

**Дата вступления в силу:** 04.08.2026
**Последнее обновление:** 04.08.2026

Эта политика распространяется на сайт OlympIQ и на мобильное приложение OlympIQ для iOS и Android.

---

## C1. Коротко и по существу

OlympIQ — образовательный продукт для школьников 1–11 классов. Поскольку мы работаем с данными детей,
мы стараемся говорить коротко и честно.

**Что мы делаем:**

- Мы собираем только то, без чего аккаунт не работает: контактные данные родителя, имя ребёнка, школу,
  класс и результаты его занятий.
- **Профиль ребёнка создаёт и контролирует родитель.** Ребёнок не может зарегистрироваться сам.
- Родитель в любой момент может удалить весь семейный аккаунт прямо из приложения.

**Чего мы не делаем никогда:**

- ❌ **Никакой рекламы.** В приложении нет ни рекламной сети, ни рекламного SDK.
- ❌ **Никакой слежки.** Ни в мобильном приложении, ни на сайте нет сторонних инструментов аналитики,
  атрибуции или сбора отчётов о сбоях. Рекламный идентификатор (IDFA, Android Advertising ID) не
  считывается никогда.
- ❌ **Мы не продаём, не сдаём в аренду и не обмениваем ваши данные** и не передаём их никому в
  маркетинговых целях.
- ❌ **Мы не запрашиваем геолокацию, камеру, контакты и микрофон.**
- ❌ **Мы не строим рекламные профили на основе поведения ребёнка.**
- ❌ **Мы не видим данные вашей карты.** В мобильном приложении нет оформления покупки — покупки
  совершаются только на сайте.

---

## C2. Кто мы и как с нами связаться

| | |
|---|---|
| Продукт | **OlympIQ** — платформа подготовки к олимпиадам и экзаменам для 1–11 классов |
| Проект реализует | **Камиль Пириев** (ИНН / VÖEN: **6300091352**) и его партнёры |
| Юридический адрес | Азербайджанская Республика, Лерикский район, село Пештатюк |
| Эл. почта поддержки | `[OWNER MUST CONFIRM: адрес поддержки]` |
| Телефон | `[OWNER MUST CONFIRM: телефон поддержки]` |
| Сайт | `[OWNER MUST CONFIRM: опубликованный адрес сайта]` |
| Запросы по данным | `[OWNER MUST CONFIRM: адрес для запросов о персональных данных]` |

По любому вопросу, жалобе или запросу на удаление данных пишите на адрес выше.

> `[OWNER MUST CONFIRM: кто именно является оператором персональных данных — физическое лицо,
> индивидуальный предприниматель или юридическое лицо — это юридический вопрос, и он должен быть решён
> до публикации.]`

---

## C3. Модель семейного аккаунта — самый важный раздел

Модель аккаунта в OlympIQ устроена необычно, и сделано это именно ради безопасности детей:

- **Зарегистрироваться может только родитель** — по электронной почте и паролю.
- **Ребёнок не может зарегистрироваться сам.** Ни на сайте, ни в приложении для ребёнка нет пути
  регистрации. Это осознанное решение, и оно контролируется на сервере.
- **Профиль ребёнка создаёт родитель** и сам вводит все данные о нём: имя, фамилию, город, район, школу
  и класс.
- **У ребёнка нет адреса электронной почты.** Внутри системы для входа ребёнка используется технический
  адрес, который не принимает почту; ребёнок его не видит и не использует.
- **Ребёнок входит по 8-значному номеру**, который выдаёт наш сервер, и паролю, который задаёт родитель.
- **Ребёнок не может ничего купить.** Это обеспечивается на сервере, а не просто скрыто в интерфейсе.
- **Ребёнок не может ничего удалить.** Владельцем аккаунта всей семьи является родитель, и право
  удаления принадлежит ему.

Итог: **родитель решает, какие данные о ребёнке вообще существуют**, и может удалить их полностью в любой
момент.

---

## C4. Какие данные мы собираем

### C4.1 Аккаунт родителя

| Данные | Обязательно? | Зачем |
|---|---|---|
| Имя (отображаемое) | Да | Чтобы опознать аккаунт и обращаться к вам в приложении |
| Адрес электронной почты | Да | Логин для входа; восстановление пароля; уведомления об аккаунте |
| Номер телефона (в международном формате) | Да | Связь по вопросам аккаунта и его восстановление. **Мы не отправляем SMS** — функции SMS в продукте нет вообще |
| Пароль | Да | Для входа. **Мы не храним ваш пароль** — он хранится только в нашем сервисе аутентификации в виде хеша, который невозможно прочитать обратно |
| Язык интерфейса (az / en / ru) | Нет | Чтобы показывать приложение на вашем языке |
| Фото профиля (аватар) | Нет | Только для внешнего вида. См. C5.4 — этот файл попадает в общедоступное хранилище |
| Настройки уведомлений | Нет | Чтобы запомнить, по каким каналам вы хотите получать уведомления |
| Понравившиеся новости | Нет | Запись о вашем «лайке» под статьёй |

Родитель может изменить в приложении имя, телефон, пароль и аватар. **Адрес электронной почты в
приложении изменить нельзя** — для этого напишите нам.

### C4.2 Профиль ребёнка (ученика) — данные вводит родитель

| Данные | Обязательно? | Зачем |
|---|---|---|
| Имя и фамилия | Да | Чтобы обращаться к ребёнку в приложении; в таблице лидеров отображается как **«Имя Ф.»** (см. C5.3) |
| Город и район | Да | Для региональных таблиц лидеров |
| Название школы | Да | Для школьной таблицы лидеров |
| Класс | Да | Чтобы ребёнку выдавались вопросы для его класса |
| 8-значный номер для входа | Выдаёт сервер | Логин ребёнка. **Последние 4 цифры этого номера показываются в публичной таблице лидеров** (см. C5.3) |
| Пароль | Да (задаёт родитель) | Для входа. Хранится только в сервисе аутентификации в виде хеша |
| Аватар | Нет | Готовое изображение или загруженное фото. См. C5.4 — способ загрузки имеет значение |
| Выбор цвета / стикеров | Нет | Оформление, выбранное ребёнком |
| Учебные данные | Автоматически | Отвеченные вопросы, выбранные варианты, верно/неверно, время на вопрос, баллы, проценты, серии (streak), активные дни, место в рейтинге, достижения |
| Уже показанные олимпиадные вопросы | Автоматически | Чтобы один и тот же вопрос не повторялся |
| Настройки уведомлений, понравившиеся новости | Нет | То же, что и в аккаунте родителя |

**Мы не собираем дату рождения и год рождения.** Возраст ребёнка мы не спрашиваем — достаточно класса.

Сам ребёнок может изменить только следующее: **своё имя и фамилию** (это меняет и подпись в таблице
лидеров), **пароль**, **аватар** и **выбор цвета**. Школа, город, район и класс доступны ребёнку только
для чтения — изменить их может только родитель.

### C4.3 Технические данные и данные устройства

| Данные | Когда | Зачем |
|---|---|---|
| Токен push-уведомлений + название модели устройства, версия ОС, версия приложения | Только если push-уведомления включены и вы дали разрешение | Чтобы доставить уведомление на нужное устройство. **Никакие рекламные и аппаратные идентификаторы не считываются.** При выходе из аккаунта токен удаляется с сервера. `[OWNER MUST CONFIRM: будут ли push-уведомления работать на момент публикации? Сейчас функция отключена на сервере.]` |
| Журнал попыток входа ребёнка: 8-значный номер, **хеш IP-адреса (SHA-256)**, успех/неудача, время | При каждой попытке входа | Чтобы предотвратить подбор пароля. **Сам IP-адрес не сохраняется** |
| Журналы сервера — включая IP-адрес и строку браузера/устройства | При каждом запросе | Стандартные технические журналы наших хостинг-провайдеров, для безопасности и устранения неполадок. Срок хранения: `[OWNER MUST CONFIRM]` |
| Записи о входах в сервисе аутентификации | При каждом входе | Наш сервис аутентификации ведёт собственный журнал безопасности. `[OWNER MUST CONFIRM: что именно и как долго там хранится]` |

### C4.4 Что хранится в защищённом хранилище устройства (мобильное приложение)

Мобильное приложение хранит в защищённом хранилище устройства (iOS Keychain / Android Keystore) только:

- вашу сессию входа,
- включена ли блокировка по отпечатку/лицу (буквально «1» или «0»),
- показывался ли приветственный экран,
- копию push-токена,
- выбранный язык и тему (светлая/тёмная).

**Настройки** из этого списка (блокировка, приветственный экран, язык и тема) устройство не покидают
вообще. Сессия входа передаётся нашему сервису аутентификации при каждом запросе — в этом её назначение,
— а push-токен, пока push включён, хранится на нашем сервере (см. C4.3). Больше ничего не передаётся.

### C4.5 Файлы cookie — сайт

На сайте используются только **строго необходимые** файлы cookie:

- **Cookie сессии** — чтобы вы оставались в аккаунте, пока находитесь на сайте.
- **Cookie `locale`** — чтобы запомнить выбранный язык интерфейса (1 год).
- Выбор светлой/тёмной темы хранится в локальном хранилище самого браузера.
- Кратковременная отметка в **сессионном хранилище** браузера — чтобы просмотр одной и той же новости не
  засчитывался дважды. Она удаляется при закрытии вкладки.

**Рекламных cookie, аналитических cookie и трекинговых пикселей нет.**

---

## C5. Данные детей — отдельный и важный раздел

> Этот раздел является политикой конфиденциальности OlympIQ в отношении детей. Поскольку наш продукт
> предназначен для несовершеннолетних, мы выносим его отдельно, чтобы родитель видел всё в одном месте.

### C5.1 Что хранится о ребёнке

Всё, что указано в таблице **C4.2**: имя, фамилия, город, район, школа, класс, 8-значный номер для входа,
выбранный аватар и оформление, а также результаты занятий (ответы, баллы, проценты, серии, активные дни,
место в рейтинге).

**Что мы о ребёнке не собираем:** дату рождения, адрес электронной почты, номер телефона, домашний адрес,
геолокацию, данные о здоровье, финансовые данные, контакты, историю браузера, идентификаторы устройства.

### C5.2 Чего мы никогда не делаем с данными ребёнка

- Мы не показываем ребёнку рекламу и не строим рекламные профили.
- Мы не отслеживаем поведение ребёнка в других приложениях и на других сайтах.
- Мы не продаём, не сдаём в аренду и не передаём данные детей в маркетинговых целях.
- Мы не публикуем ничего из написанного ребёнком, **за одним исключением — это его собственные имя и
  фамилия**. Ученик может изменить их сам, и именно это имя отображается в таблице лидеров как
  «Имя Ф.». Никакого другого свободного текста ребёнок другим пользователям показать не может.
- В приложении **нет чата, сообщений, комментариев и форума**. Ребёнок не может общаться с другими
  пользователями.
- Мы никогда не побуждаем ребёнка что-либо покупать. В сессии ученика не отображаются ни цены, ни способы
  оплаты, ни кнопки покупки.

### C5.3 Что видно в таблицах лидеров и кому — честное объяснение

Это один из важнейших моментов, который родителю нужно понимать. **Таблиц лидеров две, и они разные:**

**1) Таблица лидеров внутри приложения — видна только пользователям с аккаунтом**

Любой **вошедший в систему родитель и любой вошедший ученик** видит о каждом ребёнке в рейтинге
следующее:

| Отображается | Пример |
|---|---|
| Имя и первая буква фамилии | `Айсель М.` |
| Город | `Баку` |
| Район | `Насими` |
| Название школы | `Средняя школа № 142` |
| Класс | `7` |
| Показатели результата | процент, количество отвеченных вопросов, количество верных ответов, количество попыток |

**Полная фамилия, аватар, 8-значный номер ребёнка и контактные данные родителя не отображаются.**

**2) Публичная десятка на главной странице сайта — видна всем, даже без аккаунта**

Здесь имя ребёнка **не показывается**. Вместо него отображается псевдоним вида `Şagird 4821`.
Эти четыре цифры — **последние четыре цифры 8-значного номера ребёнка для входа.** Кроме псевдонима,
эта публичная таблица показывает также **город, район, название школы и класс**.

> **Честное предупреждение для родителей:** в небольшой районной школе сочетание «школа + класс + район»
> может оказаться достаточным, чтобы узнать ребёнка, даже без имени. Мы это не скрываем.
>
> `[OWNER MUST CONFIRM: останутся ли в публичной таблице столбцы «школа / район / класс» — это требует
> решения. Если их уберут до публикации, этот абзац нужно обновить.]`

В таблицах лидеров **нет медалей, призов и денег** — только числовые места.

### C5.4 Фотографии-аватары — важное различие

| Способ | Где хранится файл | Кто может увидеть |
|---|---|---|
| **Родитель загружает фото для ребёнка** (Добавить ребёнка / Изменить ребёнка) | **Закрытое** хранилище | Только члены семьи, по короткоживущей подписанной ссылке |
| **Ученик сам загружает фото из своего профиля** | **Открытое** хранилище | **Любой**, у кого есть прямая ссылка на файл |
| **Родитель загружает свой аватар** | **Открытое** хранилище | Любой, у кого есть прямая ссылка на файл |

> **Мы говорим об этом прямо:** фотография, которую ученик загружает из своего профиля, попадает в
> открытое хранилище. Тот, у кого нет ссылки, её не найдёт, но если ссылка разойдётся, файл будет
> доступен любому.
> **Готовые аватары стоят по умолчанию, и загружать фото не требуется никогда.** Если вы не хотите, чтобы
> фотография вашего ребёнка была загружена, используйте готовый аватар.
>
> `[OWNER MUST CONFIRM: эту асимметрию следует устранить до публикации — либо перевести загрузку ученика в
> закрытое хранилище, либо убрать у ученика возможность загружать фото. После исправления обновить
> таблицу.]`

Удаление аватара **работает по-разному в зависимости от пути**. Фотография, которую родитель загрузил для
ребёнка, при замене или удалении **полностью стирается из закрытого хранилища**. Собственный аватар
родителя и фото, загруженное самим учеником, **только отвязываются**: изображение перестаёт отображаться
в профиле, но сам файл остаётся в открытом хранилище. (Это не то же самое, что полное удаление аккаунта —
см. C9.4.)

### C5.5 Как родитель удаляет данные ребёнка

- **Удалить весь семейный аккаунт:** профиль родителя → «Опасная зона» → «Удалить аккаунт» →
  двухшаговое подтверждение. Это удаляет аккаунт родителя **и все созданные им профили детей**. Доступно
  и на сайте, и в мобильном приложении.
- **Удалить одного ребёнка:** сейчас **только на сайте**, из панели родителя. В мобильном приложении
  отдельного удаления ребёнка нет.
- **Ученик не может удалить ничего.**

Удаление происходит **немедленно** — периода ожидания, отмены и «архива» не предусмотрено. Что именно
удаляется и что остаётся, подробно описано в разделе **C9**.

---

## C6. Как мы используем данные

**Мы используем их, чтобы:**

1. Создать аккаунт, обеспечить вход и защитить аккаунт.
2. Подобрать вопросы, соответствующие классу ребёнка и текущей школьной четверти.
3. Проверить ответы и рассчитать баллы, проценты, серии и статистику прогресса.
4. Показать родителю отчёт о прогрессе ребёнка.
5. Сформировать таблицы лидеров (ровно так, как описано в C5.3).
6. Отправлять уведомления (новый раунд, результат, серия, новости, сообщения об аккаунте).
7. Предотвращать злоупотребления, автоматизированные атаки и подбор паролей.
8. Оказывать поддержку и отвечать на ваши обращения.
9. Определять, к каким предметам и олимпиадным пакетам у семьи есть доступ.
10. Выполнять требования закона, когда это обязательно.

**Мы не используем их, чтобы:**

- ❌ Показывать рекламу или строить рекламные профили.
- ❌ Отслеживать вас или вашего ребёнка в других приложениях и на других сайтах.
- ❌ Продавать данные или передавать их рекламным брокерам.
- ❌ Принимать решения о кредитах, страховании, трудоустройстве и т. п.
- ❌ Принимать автоматические решения в отношении ребёнка, имеющие юридические последствия.
- ❌ Обучать сторонние рекламные системы или системы профилирования.

---

## C7. Кому мы передаём данные

**Доступ внутри OlympIQ.** Скажем об этом прямо: уполномоченные администраторы и контент-менеджеры
OlympIQ могут просматривать данные аккаунтов и учебные данные во внутренней панели управления — чтобы
обслуживать сервис, работать с контентом и отвечать на обращения в поддержку. Доступ ограничен ролью: в
базе данных действует защита на уровне строк (RLS), и каждая внутренняя роль имеет только те права,
которые нужны для её работы. Действия администраторов с аккаунтами и контентом записываются в журнал
аудита.

Мы **не продаём** ваши данные. Перечисленные ниже поставщики услуг необходимы для работы сервиса, и
каждый из них получает только то, что нужно для его функции:

| Поставщик услуг | Роль | Что получает | Статус |
|---|---|---|---|
| **Supabase** | База данных, аутентификация, хранение файлов | Все данные продукта, по зашифрованному соединению | Активен |
| **Vercel** | Хостинг сайта | Стандартные журналы запросов сервера (IP, строка браузера) | Активен |
| **Expo / EAS** | Обновления мобильного приложения и передача push-уведомлений | Проверка обновлений при запуске: версия приложения, платформа, анонимный идентификатор установки и ваш IP-адрес; push-токен, когда push включён | Проверка обновлений активна. **Push сейчас не работает** `[OWNER MUST CONFIRM]` |
| **Apple (APNs)** | Доставка push на iOS | Только после включения push — стандартная передача уведомлений | До включения push не получает ничего |
| **Google (FCM)** | Доставка push на Android | Только после включения push — стандартная передача уведомлений | До включения push не получает ничего |
| **Google Fonts** | Шрифт на некоторых страницах сайта | IP-адрес и строку браузера | Активен (только сайт; в мобильном приложении отсутствует) |
| **Google Maps** | Карта на странице «Контакты» | IP-адрес и строку браузера в момент открытия этой страницы. **Данные аккаунта не передаются** | Активен |
| **Платёжный провайдер** | Будущая оплата на сайте | — | **Сейчас ни один платёжный провайдер не подключён** (см. C8) |

Кроме этого, мы можем передать данные только:

- когда этого требует закон (решение суда, законный запрос уполномоченного органа);
- чтобы предотвратить непосредственную угрозу жизни или здоровью;
- чтобы защитить свои права и расследовать злоупотребления.

**Где расположены серверы:** `[OWNER MUST CONFIRM: регион проекта Supabase и развёртывания Vercel. Если
данные хранятся за пределами Азербайджана, это должно быть прямо указано здесь.]`

> `[OWNER MUST CONFIRM: как юридически охарактеризовать эти компании («обработчики, действующие по нашему
> поручению» или «третьи лица, которым передаются данные») — это юридический вопрос.]`

---

## C8. Платежи

- **Завершить покупку в мобильном приложении невозможно**: в нём нет ни формы карты, ни ввода данных
  карты, ни шага оплаты.
- Оплата возможна только **на сайте, в браузере, в азербайджанских манатах**.
- Оплата будет проходить полным перенаправлением на собственную страницу банка. **Номер карты, код CVV и
  другие данные карты никогда не попадут на серверы OlympIQ и у нас храниться не будут.**
- В нашей базе будут фиксироваться только сумма, валюта, статус и номер операции у провайдера.

**Показ цен зависит от режима оплаты.** Пока платежи отключены, цены не показываются ни в одном разделе
мобильного приложения. Если платежи включат, приложение может показывать цены подписки **для информации**
родителю или посетителю без аккаунта; **в сессии ученика цены не показываются никогда**, и завершить
покупку внутри приложения нельзя ни в каком режиме.

**Текущее состояние:** платежи на платформе **отключены**, и ни один платёжный провайдер пока не
подключён. `[OWNER MUST CONFIRM: если к моменту публикации это изменилось, раздел нужно обновить и указать
провайдера.]`

---

## C9. Хранение и удаление данных

### C9.1 Пока аккаунт активен

Данные аккаунта и результаты занятий хранятся, пока существует аккаунт, — потому что они и есть сам
продукт (графики прогресса, серии, рейтинг).

- **Прочитанные уведомления** удаляются автоматически — **в настоящее время через 180 дней**, — а папка
  уведомлений каждого пользователя сейчас ограничена 500 записями. Оба значения являются настройками
  платформы (`system_settings`) и могут быть изменены администратором.
- Для остальных типов данных автоматический срок удаления сейчас не установлен.
  `[OWNER MUST CONFIRM: нужно выбрать и указать здесь конкретный срок хранения для учебных данных,
  журналов аудита и журналов попыток входа.]`

### C9.2 Как удалить аккаунт

**В мобильном приложении или на сайте:** войдите как родитель → аватар вверху → **«Профиль»** →
прокрутите до раздела **«Опасная зона»** → **«Удалить аккаунт»** → двухшаговое подтверждение.

Операция выполняется **немедленно** и **не может быть отменена**. Если из-за технического сбоя удаление
не завершится, напишите на указанный выше адрес — мы завершим его вручную.

### C9.3 Что удаляется

При удалении аккаунта родителя удаляется всё перечисленное:

- профиль родителя и его учётная запись для входа;
- **все профили детей, созданные родителем**, и их учётные записи;
- 8-значные номера и записи об их выдаче;
- все попытки, ответы, баллы, проценты, серии, активные дни и достижения;
- записи в таблицах лидеров и данные о том, какие олимпиадные вопросы уже показывались;
- подписки, права доступа, записи о скидках и промокодах;
- уведомления, настройки уведомлений и push-токены;
- записи о понравившихся новостях.

### C9.4 Что остаётся — честный перечень

Следующее сохраняется намеренно или остаётся по техническим причинам:

| Что остаётся | Зачем | Остаются ли персональные данные? |
|---|---|---|
| Записи о платежах и покупках | Бухгалтерские и налоговые обязательства | **Обезличиваются** — связь с человеком удаляется; остаются только сумма, валюта, статус и дата |
| Записи аудита о действиях с аккаунтом (регистрация, создание профиля ребёнка, сброс паролей, события подписок и покупок, а также само удаление) | Журнал безопасности | Связь с человеком удаляется (`actor_profile_id` → NULL). В этих записях не хранятся ни имя, ни IP-адрес, ни строка браузера |
| **Замороженные архивы рейтингов** (итоги сезона и месяца) | Историческая запись прошлых результатов | ⚠️ В архиве сезона может остаться подпись **«Имя Ф.»** и внутренний идентификатор. `[OWNER MUST CONFIRM: нужно решить, очищать ли эти архивы при удалении]` |
| **Загруженные файлы аватаров** и записи о них | — | ⚠️ Удаление аккаунта стирает записи в базе данных, но не сами файлы — и в открытом, и в закрытом хранилище. (Отдельная кнопка «удалить аватар» фотографию ребёнка действительно стирает — см. C5.4.) `[OWNER MUST CONFIRM: в процедуру удаления следует добавить удаление файлов]` |
| Журнал попыток входа ребёнка (8-значный номер, хеш IP, время) | Безопасность | ⚠️ Остаётся. `[OWNER MUST CONFIRM: нужно установить срок хранения]` |
| Исходные уведомления об оплате, полученные от банка (только после подключения платёжного провайдера — сейчас он не подключён) | Финансовая сверка | ⚠️ Хранятся в том виде, в каком их присылает банк, с привязкой к номеру операции провайдера. В них может быть то, что включает сам банк, — например имя плательщика или маскированный номер карты. `[OWNER MUST CONFIRM: до сохранения первого callback нужно написать allowlist полей]` |
| Резервные копии | Восстановление после сбоев | `[OWNER MUST CONFIRM: срок хранения резервных копий]` |

### C9.5 Как получить копию своих данных

Кнопки «скачать мои данные» в приложении сейчас нет. Если вам нужна копия данных вашей семьи, напишите на
указанный выше адрес — мы ответим на ваш запрос.

---

## C10. Безопасность

Ниже перечислено то, что действительно реализовано:

- **Весь трафик шифруется** (HTTPS/TLS). На сайте включён HSTS; в приложении для iOS незашифрованные
  соединения запрещены полностью.
- **Мы не храним пароли.** Пароли и родителей, и детей хранятся только в нашем сервисе аутентификации в
  виде хеша. В нашей базе данных нет колонки для пароля.
- **В базе данных включена защита на уровне строк (RLS)**: ученик видит только свою запись, а родитель —
  только записи своих детей.
- **В мобильном приложении нет ни одного привилегированного ключа.** Привилегированные операции
  выполняются только на сервере.
- **Токены сессии хранятся в защищённом хранилище самого устройства** (iOS Keychain / Android Keystore),
  а не в обычном файле или открытом хранилище.
- **Блокировка входа ребёнка:** после 8 неудачных попыток за 15 минут номер временно блокируется.
  IP-адрес записывается **в виде хеша, а не в исходном виде**.
- **Страницы входа, регистрации и восстановления пароля родителя ограничены по частоте запросов.**
- **Загружаемые изображения проверяются по фактическому содержимому файла, а не по его имени.**
  Допустимые форматы: PNG, JPEG и WebP; **GIF** дополнительно принимается для собственного аватара
  родителя и для фото, которое ученик загружает сам, но не для фотографии, которую родитель загружает
  для ребёнка. Максимальный размер — 2 МБ. **Формат SVG запрещён полностью** (угроза безопасности).
- **Блокировка по отпечатку/лицу:** ваше устройство сообщает нам только «подтверждено / не подтверждено».
  **Биометрические данные никогда не покидают устройство и нам не передаются.** Мы храним только то,
  включена блокировка или нет.
- **Действия администраторов записываются в журнал аудита.**

При этом будем честны: **ни одна система в интернете не защищена на 100%.** Мы принимаем разумные
технические и организационные меры, но не можем гарантировать абсолютную безопасность. Никому не сообщайте
свой пароль.

---

## C11. Ваши права и как ими воспользоваться

| Что вы хотите сделать | Как |
|---|---|
| Изменить имя, телефон, пароль или аватар родителя | В приложении: страница профиля |
| Изменить адрес электронной почты родителя | В приложении невозможно — напишите нам |
| Изменить имя, город, район, школу или класс ребёнка | В приложении: родитель → изменить ребёнка |
| Сбросить пароль ребёнка | В приложении: родитель → изменить ребёнка |
| Изменить или удалить аватар ребёнка | В приложении: профиль родителя или ученика |
| Отключить уведомления | Настройки уведомлений в приложении, а также системные настройки устройства |
| Удалить одного ребёнка | На сайте: панель родителя |
| Удалить весь семейный аккаунт | В приложении и на сайте: профиль → Опасная зона |
| Получить копию своих данных | Напишите нам |
| Пожаловаться или задать вопрос | Напишите нам |

В зависимости от страны проживания у вас могут быть дополнительные права.
`[OWNER MUST CONFIRM: на какое законодательство ссылаться и указывать ли порядок обращения в надзорный
орган — согласовать с юристом.]`

---

## C12. Разрешения устройства

| Разрешение | Когда запрашивается | Для чего |
|---|---|---|
| **Медиатека (фото)** | Только когда вы нажимаете «изменить аватар» | Чтобы выбрать фото профиля. Готовые аватары стоят по умолчанию — загружать фото не обязательно |
| **Уведомления** | Только после входа в аккаунт и только если функция включена | Для новых раундов, результатов, серий и сообщений об аккаунте. **Никогда для рекламы.** Если вы откажете, повторно запрос не появится |
| **Отпечаток пальца / Face ID** | Только если вы сами включите блокировку приложения | Чтобы открывать приложение без ввода пароля. Для включения *и* выключения блокировки требуется успешная проверка |

**Мы никогда не запрашиваем у вас:** камеру, геолокацию, контакты, микрофон, календарь, данные о
здоровье, Bluetooth и разрешение на отслеживание (App Tracking Transparency). Приложение никогда не
открывает камеру, и сделать фото в нём невозможно.

> **Честное примечание для Android:** используемый нами компонент выбора фото (`expo-image-picker`)
> объявляет разрешения на камеру и хранилище в собственном манифесте, поэтому вы можете увидеть их в
> списке на экране «О приложении». Приложение ими не пользуется и запрос камеры вам не показывает.
> `[OWNER MUST CONFIRM: честнее убрать эти разрешения из манифеста на этапе сборки]`

---

## C13. Изменения в этой политике

Мы можем обновлять эту политику. При обновлении мы изменим дату **«Последнее обновление»** вверху. Если
изменение существенное, мы сообщим об этом в приложении или по электронной почте. Продолжая пользоваться
сервисом после вступления изменений в силу, вы принимаете обновлённую политику.

**Вопросы:** `[OWNER MUST CONFIRM: адрес поддержки]`

---
---

# ANNEX — INTERNAL NOTES (DO NOT PUBLISH)

> **Delete everything below this line before publishing the policy to a public URL, to App Store Connect,
> or to Google Play Console.** It is a working note for the owner, not policy text.

## Z1. Legal review notice — read this first

**This document was written by engineers, from the source code and the database schema. It is a factual
description of what the software actually does. It is NOT legal advice, and it has NOT been reviewed by a
lawyer.**

Before this policy is published anywhere, a qualified lawyer — ideally an Azerbaijani lawyer with
data-protection experience — must review it. Specifically flag these areas for that review:

1. **Children's data.** The product is directed at minors aged roughly 6–17 and collects a persistent
   identifier (the 8-digit login ID), a name, a school, a district and behavioural learning data about
   them. The legal basis for that processing, whether verifiable parental consent is required and in what
   form, and whether the current parent-creates-the-child model satisfies it, are all legal questions this
   document does not answer.
2. **Azerbaijani data-protection law** (the Law on Personal Data and its implementing rules), including
   whether the operator must register a personal-data information system, what notice content is mandatory,
   and how cross-border transfer is treated if the servers are outside Azerbaijan.
3. **Exposure outside Azerbaijan.** If either app is ever distributed on a storefront outside Azerbaijan —
   and a worldwide App Store / Google Play release does exactly that — **GDPR** (if any EEA/UK child uses
   it) and **COPPA** (if any US child under 13 uses it) may apply. COPPA in particular requires verifiable
   parental consent, a specific notice structure and direct-notice mechanics that this policy does not
   currently implement. If the intent is Azerbaijan-only, the store availability should be restricted to
   Azerbaijan and that decision recorded.
4. **The public leaderboard.** Publishing a minor's school, district, grade and a pseudonym derived from
   their login credential, to logged-out visitors, is the single highest-risk practice described in this
   document. Counsel should look at it directly.
5. **Retention.** The code imposes almost no retention limits. Counsel will expect stated periods.

**This policy deliberately does not claim compliance with any statute.** It describes practices only.
Do not add a "we comply with X" sentence without counsel's sign-off.

## Z2. OWNER MUST CONFIRM checklist

Every item below appears as a placeholder somewhere in the three policy versions. Each must be answered
before publication.

### Identity and contact — blocks publication

| # | Item | Where it appears |
|---|---|---|
| 1 | **The legal controller of record.** The app publishes "Kamil Piriyev, VÖEN 6300091352" — an individual with a personal tax id. Whether the data controller is that individual, a registered *fərdi sahibkar*, or a company is a legal question. It also determines the Apple Developer enrolment type (see `docs/OLYMPIQ_ECOSYSTEM_FOR_APPLE.md` §6) | A2 / B2 / C2 |
| 2 | **Support email address.** Not hard-coded anywhere in the repo — it is set through the admin panel's site-content registry, and no default value exists in the codebase | A2 / B2 / C2, and the closing line of each version |
| 3 | **Support phone number.** Same — admin-configured, no repo default | A2 / B2 / C2 |
| 4 | **A dedicated privacy / data-request email address.** A store privacy policy cannot publish without a working contact route for deletion and data-subject requests | A2 / B2 / C2 |
| 5 | **The published website address.** `olympiq.ai` is not live; the web app is on a Vercel URL today. The privacy-policy URL given to Apple and Google must resolve, in all three languages | A2 / B2 / C2 |
| 6 | **Effective date / last-updated date.** Set on the day of publication | Header of A / B / C |

### Infrastructure facts that cannot be read from the code

| # | Item | Why it matters |
|---|---|---|
| 7 | **Hosting region** of the Supabase project and the Vercel deployment. Not discoverable from the repository — there is no `vercel.json` and no `supabase/config.toml`, and a Supabase project ref does not encode a region. `docs/CODEBASE_AUDIT_2026_07_05.md` already lists co-location as an open question | If data leaves Azerbaijan, the international-transfer paragraph depends entirely on this |
| 8 | **Server log / IP retention** at Vercel and Supabase | A7 / B7 and A4.3 / B4.3 / C4.3 state a retention period as a placeholder. A dashboard-only setting |
| 9 | **What Supabase Auth's own logs retain.** This inventory covered only `public.*` tables. Supabase Auth keeps `auth.users` (with `last_sign_in_at`) and its own audit log, which **does record IP addresses** for sign-in events. Confirm before anyone reads the "we store the IP only as a hash" line as covering everything | Our application audit log genuinely stores no IP or user agent — the columns exist but no code writes them. Supabase's own layer is separate |
| 10 | **Database backup retention** and whether point-in-time recovery is on. Deletion cascades live rows; backups are outside our code's control | B9.4 backup row |
| 11 | **Legal characterisation of Supabase / Vercel / Expo / Apple / Google** — "processors acting on our instructions" vs "third parties with whom data is shared". Changes what the store privacy label must say | A7 / B7 / C7 |

### Product decisions that should be made BEFORE publishing

These are not wording questions. Each is a real practice that the policy currently describes honestly; if
the practice changes, the policy paragraph must change with it.

| # | Decision | Current behaviour |
|---|---|---|
| 12 | **Child-uploaded avatars land in a PUBLIC storage bucket.** A parent-uploaded child photo goes to the private `child-avatars` bucket (signed URLs, family gate) — correct. But a signed-in *child* uploading their own avatar writes to the public `profile-avatars` bucket. Fix the student path, or remove the student's photo-upload ability, or publish the disclosure as written | Disclosed in A5.4 / B5.4 / C5.4 |
| 13 | **The anonymous public landing board publishes school + district + city + grade for minors**, alongside `Şagird XXXX` — where XXXX is the **last four digits of the child's 8-digit login credential**. Decide: keep it, drop the context columns, or stop deriving the tag from the credential. Note the CSS only *hides* those columns below 760px — they are still in the served HTML | Disclosed in A5.3 / B5.3 / C5.3 |
| 14 | **The signed-in leaderboard shows "Firstname L." + city + district + school + grade of every ranked child to every signed-in student and parent.** Migration `2026_07_11_048` records this as a deliberate owner ruling that replaced an anonymous format, so it is a decision, not a bug — but it must be re-confirmed as acceptable for a children's product | Disclosed in A5.3 / B5.3 / C5.3 |
| 15 | **Account deletion leaves avatar files in storage forever**, in both buckets — the cascade never touches Storage. Note the contrast the policy now spells out: the *"remove avatar"* button DOES erase a parent-uploaded child photo (`childAvatarCore.ts` calls `removeObject()` on every exit path), while the parent's own and the student's self-uploaded avatars are unlink-only. Either add object cleanup to the deletion path, or publish the disclosure as written | Disclosed in A5.4/B5.4/C5.4 and A9.4 / B9.4 / C9.4 |
| 16 | **Frozen leaderboard archives survive deletion.** Season standings retain `"Firstname L."` plus an internal profile id; monthly snapshots retain the profile id. Neither is reachable by the deletion cascade (they are JSON blobs with no foreign key). Decide: scrub on deletion, or disclose | Disclosed in A9.4 / B9.4 / C9.4 |
| 17 | **The child sign-in attempt log keeps the 8-digit ID + IP hash + timestamp forever**, including after the child is deleted — the table has no foreign key to students and no purge job. Choose a retention period and add a scheduled purge, or publish "indefinite" | Disclosed in A9.4 / B9.4 / C9.4 |
| 18 | **Retention period for learning data while the account is active.** Today: indefinite. Counsel will want a stated period; the code imposes none. The only automatic purge in the whole system is for read notifications (180 days, inbox capped at 500) | A9.1 / B9.1 / C9.1 |
| 19 | **Google Fonts is loaded from Google's servers** on the login page (pre-authentication) and throughout the signed-in student area, which sends the visitor's IP and user agent to Google. It is **missing** from the processor list in `docs/OLYMPIQ_ECOSYSTEM_FOR_APPLE.md` §8.3. Either disclose it (as this policy does) or self-host the font and delete the row. **Self-hosting is the cleaner answer for a children's app** | A7 / B7 / C7 |
| 20 | **`students.birth_year_optional` is a dead column.** No app collects, writes, reads or displays it — a repo-wide search finds only the column declaration. This policy therefore states "we do not collect a date of birth", which is true today. If the column is ever wired up, this policy becomes false. Cleanest fix: drop the column | A4.2 / B4.2 / C4.2 |

### Status questions — "is this true on the day we publish?"

| # | Item | Status today |
|---|---|---|
| 21 | **Is push live?** Push registration is gated by a server-side feature flag that is **off**, and `EXPO_ACCESS_TOKEN` is empty, so no token is minted and neither Expo nor APNs/FCM receives anything. If push is still off at publication, the Expo/APNs/FCM rows should say "planned", not "active" | Not operational |
| 22 | **Is any email actually sent?** No outbound mail provider is configured (`NOTIFICATIONS_SMTP_URL` is empty; the delivery function returns `not_configured`), and password-reset email is not operational. The only mail that could be sent today is whatever Supabase Auth's built-in mailer sends. Confirm before the policy describes email use | Not operational |
| 23 | **Has any payment ever been taken?** Payments are switched off at the database level (`assert_payments_enabled()` raises while the mode is `off`; `provider` defaults to `'none'`), there is no `web-app/src/lib/payments/` directory, and no provider is integrated. The policy describes the payment rail in the future tense — confirm nothing has already been charged | No provider integrated |
| 24 | **Which payment provider will it be, and should it be named in advance?** | Undecided |

### Related non-policy blocker (fix alongside)

| # | Item |
|---|---|
| 25 | **`NSPhotoLibraryUsageDescription` is still absent from `mobile-app/app.json`** while two live code paths open the iOS photo library (the student avatar picker and the Add-Child / Edit-Child photo tile). On iOS this is a crash *and* an automatic rejection. It is blocker #14 in `docs/OLYMPIQ_ECOSYSTEM_FOR_APPLE.md` §12.2. **The permission string the owner writes should match the wording used in section A12 / B12 / C12 of this policy** — a reviewer comparing the two will notice a mismatch |

## Z3. Where this policy is linked (deliverables A and B — DONE this round)

| Surface | Requirement |
|---|---|
| Web app footer | The "Legal" column currently links only FAQ and Login. Add Privacy Policy |
| Web app: parent registration | A link near the submit button, in all three languages |
| Web app: a real route | DONE — `(public)/privacy` (the public, store-facing URL), plus the in-app `(parent)/help/privacy` and `child/help/privacy` shells. The public route is deliberately EXEMPT from the maintenance-mode gate in `web-app/src/app/layout.tsx`, so the URL registered with Apple and Google keeps serving the policy during a maintenance window |
| Mobile app: account sheet | Apple Guideline 5.1.4(b) requires the children's policy to be reachable **in-app**, not only from App Store Connect |
| Mobile app: parent registration | Same as web |
| App Store Connect | "Privacy Policy URL" — a required field, currently a submission blocker |
| Google Play Console | Data safety section + the privacy-policy URL field |

## Z4. Facts this policy asserts, and where they were verified

Kept so a future reader can re-check a claim without re-reading the whole codebase.

| Claim in the policy | Verified against |
|---|---|
| No analytics / ads / attribution / crash SDK | All 1,344 resolved packages in `mobile-app/package-lock.json`, 438 in `web-app`, 499 in `admin-panel`, swept against every common vendor name — zero real matches |
| No advertising identifier is read | No `expo-tracking-transparency`, no IDFA/vendor-id/Android-ID call site anywhere |
| Passwords are never stored by us | `supabase/sql/002` — `child_credentials` has no hash column; `pgcrypto` is enabled only for `gen_random_uuid()` |
| The IP is stored as a SHA-256 hash, never raw | `supabase/sql/002` `child_login_attempts`; hashing at `web-app/src/app/api/mobile/v1/auth/child-login/route.ts` |
| Our audit log holds no IP or user agent | Columns exist in `supabase/sql/008` but `web-app/src/lib/audit.ts` never writes them |
| No date of birth is collected | `students.birth_year_optional` is the only match repo-wide; no app touches it |
| Push stores only model / OS / app version | `mobile-app/src/features/push/registration.ts` — `p_device: { model, os, appVersion }` |
| The push token is deleted before sign-out | `registration.ts` `deregisterPushToken`, called from `authStore.ts` before `signOut` |
| Biometrics never leave the device | `appLockStore.ts` persists the literal string `"1"` / `"0"`; `LocalAuthentication.authenticateAsync` returns a boolean |
| Session tokens live in the OS keystore | `mobile-app/src/lib/secureStorage.ts` — chunked `expo-secure-store`, never AsyncStorage/MMKV |
| The mobile app holds no service-role key | `grep -rn 'service_role' mobile-app/src` → zero hits |
| Child lockout is 8 failures in 15 minutes | `supabase/sql/011` `is_child_login_locked` |
| Row-level security across the schema | `supabase/sql/010` — 49 `enable row level security` statements |
| SVG banned, 2 MB cap, png/jpeg/webp/gif | `supabase/sql/009` bucket definitions + `web-app/src/lib/imageSniff.ts` |
| Deletion is a hard delete that cascades the family | `web-app/src/lib/auth/parentCore.ts` `deleteParentAccountCore` + `on delete cascade` chain from `auth.users` |
| One deletion implementation for web and mobile | `web-app/src/app/api/mobile/v1/account/delete/route.ts` calls the same core |
| Per-child deletion is web-only | No delete-child route exists under `web-app/src/app/api/mobile/v1/children/[id]/` |
| Financial rows are anonymised, not deleted | `supabase/sql/migrations/2026_07_06_036_access_lifecycle_and_record_retention.sql` — `on delete set null` |
| Read notifications pruned at 180 days, inbox capped at 500 | `prune_notifications` in `supabase/sql/011`, scheduled nightly in `016_scheduled_jobs.sql` |
| No other purge job exists | `supabase/sql/016_scheduled_jobs.sql` — the complete `cron.schedule` list |
| Public board = `'Şagird ' \|\| right(child_unique_id, 4)` + city/district/school/grade, granted to `anon` | `get_public_leaderboard` in `supabase/sql/011`; rendered in `web-app/src/app/(public)/page.tsx` |
| Signed-in board = `Firstname L.` + full row context, granted to `authenticated` | `get_leaderboard` in `supabase/sql/011` |
| Student avatar → public bucket; parent-uploaded child photo → private bucket | `supabase/sql/009` bucket definitions; `childProfileActions.ts` vs `childAvatar.ts` |
| "Remove avatar" unlinks on the PUBLIC path only | `avatarCore.ts` / `childProfileActions.ts` do no storage `.remove()`; `childAvatarCore.ts` calls `removeObject()` on replace, preset-switch and reset, so the private child photo really is erased |
| Account deletion never touches Storage (either bucket) | `parentCore.ts` `deleteParentAccountCore` — no storage call; `media_assets.owner_profile_id` is `on delete set null` |
| EVERY audit row survives deletion, not just the deletion entry | `audit_logs.actor_profile_id … on delete set null` (`supabase/sql/008`, line 105); call sites in `parentService.ts`, `childAccountService.ts`, `phoneCore.ts`, `subscriptionCore.ts`, `olympiadCore.ts` |
| Authorised staff can read family data | `010_rls_policies.sql` grants SELECT on `profiles`/`students` to `is_admin()` OR `has_permission('users.read')`; `admin-panel/src/lib/admin/accounts.ts` searches name/email/phone |
| Android manifest carries CAMERA + storage from `expo-image-picker` | `node_modules/expo-image-picker/android/src/main/AndroidManifest.xml`; only `launchImageLibraryAsync` is ever called in `mobile-app/src` |
| GIF is rejected on the parent→child photo path | `009_storage_buckets_policies.sql` `child-avatars` allows png/jpeg/webp only; `childAvatarCore.ts` rejects `image/gif` explicitly |
| Notification retention is an admin-editable setting | `prune_notifications()` reads `notifications.retention_days` / `max_per_user` from `system_settings`, seeded in `012_seed_initial_data.sql` |
| A child can rename themselves, and the name reaches every signed-in user | `childProfileActions.ts` `childUpdateOwnName` → `updateChildOwnNameCore`; `get_leaderboard` renders `first_name || ' ' || left(last_name,1) || '.'` to `authenticated` |
| The mobile pricing screen is hidden by a RUNTIME flag, not absent | `mobile-app/src/app/(public)/pricing.tsx` gates on `payment.mode === "off"` from `get_mobile_config`; students are additionally bounced by `(public)/_layout.tsx` |
| Cookies are session + `locale` only; theme in localStorage | `web-app/src/lib/supabase/server.ts`, `LanguageDropdown.tsx`, `layout.tsx` |
| No support-ticket collection | `support_requests` exists in the schema but is referenced by zero lines of app source; the Contact page has no form |
| Payments are off at the database level, no provider integrated | `assert_payments_enabled()` in migration `089`; no `web-app/src/lib/payments/` directory |
