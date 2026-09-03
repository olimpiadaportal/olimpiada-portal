# Creating the 21 App Store in-app purchases

This folder contains `create-iap-products.mjs`, a script that creates OlympIQ's
21 in-app purchase products in App Store Connect for you, instead of you typing
them in one at a time.

**Why bother.** Each product has a permanent identifier like
`ai.olympiq.app.sub.math.month`. If one character of it is wrong, App Store
Connect does not complain — it accepts it, and then that subject simply never
appears for sale in the app, with no error message anywhere to explain why.
Apple never lets a product identifier be renamed or reused, so the mistake is
permanent. Twenty-one chances to make that mistake is what this script removes.

You do not need to understand the code. Follow the steps in order.

---

## What the script does and does not do

| | |
|---|---|
| Creates the 21 products with the correct identifiers | Yes |
| Sets the product type (non-renewing subscription) | Yes |
| Sets the internal reference name and the review note | Yes |
| Sets the English and Russian display names | Yes, if you ask for it (step 7) |
| **Sets the prices** | **No — you do this in App Store Connect** |
| Submits the products for review | No — that happens with the app version |

**Why prices are not automated.** Apple stores a price as a "price schedule"
that has to be sent complete, in one request, using internal identifiers for
every country's price band. A mistake there would put a *wrong price* on a live
product, which is much worse than typing 21 prices into a web page. Creating a
product with the right identifier is the part that is permanent and easy to get
wrong; a price is neither. So the script does the permanent part and leaves the
reversible part to you.

There is no Azerbaijani option in this script's display names because **Apple's
App Store does not offer Azerbaijani as a language.** This does not affect the
app: OlympIQ shows its own Azerbaijani subject names, and asks Apple only for
the price text. Apple's display name is what a parent sees in the Apple payment
sheet and on the Apple receipt.

---

## Step 1 — Create an App Store Connect API key

This is a key that lets the script sign in to App Store Connect as you.

> **This is NOT the same key as the "In-App Purchase" key the OlympIQ server
> uses to verify purchases.** Both are files ending in `.p8` and they look
> identical. They are not interchangeable. If you use the In-App Purchase key
> here, the script will stop with a "401" error. Generate a new key as below.

1. Go to <https://appstoreconnect.apple.com>
2. Click **Users and Access**
3. Click the **Integrations** tab
4. Choose **App Store Connect API** in the left sidebar (not "In-App Purchase")
5. Click the **+** button to generate a key
6. Name it something like `IAP product setup`
7. Set **Access** to **App Manager** (or **Admin**). A "Developer" or "Finance"
   role key cannot create in-app purchases.
8. Click **Generate**

Now write down three things from that screen:

- **Issuer ID** — a long code shown above the list of keys. It is the same for
  every key on your team.
- **Key ID** — shown in the row for the key you just made.
- The **`.p8` file** — click **Download**. **Apple lets you download it once.**
  If you lose it, you cannot get it again; you would revoke that key and make a
  new one.

## Step 2 — Put the `.p8` file somewhere safe

Put it **outside** the OlympIQ project folder, so it can never be committed to
git by accident. For example:

- Windows: `C:\Users\aliqu\Documents\keys\AuthKey_ABC123XYZ.p8`
- macOS: `~/keys/AuthKey_ABC123XYZ.p8`

Do not email it, do not paste it into a chat, do not put it in the repository.
Anyone holding that file can change your App Store Connect account.

## Step 3 — Find the app's numeric Apple ID

1. In App Store Connect, open the **OlympIQ** app
2. Go to **App Information** (in the left sidebar, under General)
3. Find **Apple ID** — it is a number, roughly 10 digits, like `6748123456`

That number, not `ai.olympiq.app`, is what the script needs.

---

## Step 4 — Tell the script the four values

Open a terminal **in the `mobile-app` folder** of the project.

### Windows (PowerShell)

Replace the four values with your own, then paste all four lines:

```powershell
$env:APP_STORE_CONNECT_ISSUER_ID = "69a6de70-0000-0000-0000-000000000000"
$env:APP_STORE_CONNECT_KEY_ID    = "ABC123XYZ"
$env:APP_STORE_CONNECT_P8_PATH   = "C:\Users\aliqu\Documents\keys\AuthKey_ABC123XYZ.p8"
$env:APP_STORE_CONNECT_APP_ID    = "6748123456"
```

### macOS or Linux (Terminal)

```bash
export APP_STORE_CONNECT_ISSUER_ID="69a6de70-0000-0000-0000-000000000000"
export APP_STORE_CONNECT_KEY_ID="ABC123XYZ"
export APP_STORE_CONNECT_P8_PATH="$HOME/keys/AuthKey_ABC123XYZ.p8"
export APP_STORE_CONNECT_APP_ID="6748123456"
```

These last only as long as that terminal window stays open. If you close it, set
them again. That is on purpose — they are not saved to disk anywhere.

---

## Step 5 — Check the script before touching Apple

Two commands, both completely safe. Neither one changes anything at Apple.

**5a. Check the script itself.** This needs no key and no internet:

```
node ./scripts/create-iap-products.mjs --self-test
```

You should see a list of ticks ending in `12 passed, 0 failed`, followed by the
21 product identifiers it plans to create. Read that list. If a subject is
missing or misspelled, stop and report it before going further.

**5b. See exactly what would be sent:**

```
node ./scripts/create-iap-products.mjs
```

This is a **dry run**. It prints every request in full and creates nothing. It
finishes with `SUMMARY (dry run — nothing was created)`.

To see what Apple already has:

```
node ./scripts/create-iap-products.mjs --list
```

This only reads. It shows which of the 21 already exist and which are missing.

---

## Step 6 — Create ONE product first, and look at it

This is the important step. Do not skip it.

```
node ./scripts/create-iap-products.mjs --apply --only ai.olympiq.app.sub.math.week
```

Then open App Store Connect and check it with your own eyes:

1. Open the **OlympIQ** app
2. Go to **Monetization** → **In-App Purchases**
3. You should see one new item, `OlympIQ Mathematics 1 Week`
4. Open it and confirm:
   - **Product ID** reads exactly `ai.olympiq.app.sub.math.week`
   - **Type** is **Non-Renewing Subscription**

If all three are right, the script is correct and the remaining 20 will be too.

**If it is wrong, stop and report it** — do not run the full command. One wrong
product is a small problem; twenty-one is a much bigger one.

### Then create the rest

```
node ./scripts/create-iap-products.mjs --apply
```

This creates the remaining 20 and **skips** the one you already made. Running it
twice is harmless: it always checks what exists first and skips those.

At the end it prints a summary: how many were created, how many were skipped,
and how many failed. If anything failed, the exact error from Apple is printed
above the summary.

---

## Step 7 — Optional: add the English and Russian display names

```
node ./scripts/create-iap-products.mjs --apply --with-localizations
```

This adds the customer-facing name and description for each product — for
example, "Mathematics — 1 month" and "Mathematics practice for one child,
1 month." It skips any that already exist, so it is safe to run after step 6.

Apple limits a display name to 30 characters and a description to 45. That is
why the Russian names abbreviate the period ("Математика — 1 мес.") and why the
descriptions are shorter than the example in `docs/APP_STORE_IAP_SETUP.md` — the
suggested wording there is 58 characters and App Store Connect would reject it.
The script checks every string against both limits before it sends anything.

This is a separate command on purpose. If Apple rejects the display-name format
for some reason, the products themselves are already safely created and you can
type the names in the web page instead.

---

## Step 8 — What you still have to do by hand

A created product is not yet on sale. In App Store Connect, for each product:

1. **Set the price.** Monetization → In-App Purchases → open the product →
   choose the price. This is the part the script deliberately does not do.
2. **Add the display name and description**, if you did not run step 7.
3. **Add the review screenshot and review notes** Apple asks for.
4. **Submit them with the next app version.** In-app purchases are reviewed
   together with an app build; they do not go through review on their own.

And once a product is approved and you are ready to sell it, its row in the
OlympIQ database (`public.iap_products`) has to be switched to `active = true`.
Until that switch is flipped the app will not show the product, even if Apple
has approved it. Ask the developer to do this — it is deliberately a manual
step, so nothing can go on sale by accident.

---

## If something goes wrong

The script prints Apple's own error message in full, including the exact field
Apple objected to. Copy the whole output when you report a problem.

| What you see | What it usually means |
|---|---|
| `HTTP 401` | Wrong Key ID, wrong Issuer ID, or the wrong `.p8` file (for example, the In-App Purchase key instead of the App Store Connect API key). It can also mean your computer's clock is wrong by several minutes. The script prints the full list of causes when this happens. |
| `HTTP 403` | The key authenticated but is not allowed to do this. Its role must be **App Manager** or **Admin**. Generate a new key with the right role. |
| `HTTP 404` | `APP_STORE_CONNECT_APP_ID` is wrong. It is the numeric Apple ID from the App Information page, not `ai.olympiq.app`. |
| `WRONG APP` | The app id points at a different app. The script checked the bundle identifier and refused to continue. Nothing was created. |
| `HTTP 409` | Usually a product identifier that already exists, possibly on a different app. Apple never allows an identifier to be reused. |
| `HTTP 429` | Apple is rate-limiting. Wait ten minutes and run exactly the same command again — the script skips whatever it already created. |
| `offending field: /data/attributes/...` | One of the fields the script sends is not what Apple expects. Run the same command with `--minimal` added, which sends only the three fields Apple definitely requires. Then fill in the rest in the web page. |
| `These environment variables are not set` | Step 4 was not done in this terminal window, or the window was closed and reopened. |
| `Private key file not found` | `APP_STORE_CONNECT_P8_PATH` must be the path to the `.p8` file, not the contents of the file. |

**Nothing is ever lost by running the script again.** It reads what already
exists before it writes anything, and skips it.

---

## All the commands in one place

```
cd mobile-app

node ./scripts/create-iap-products.mjs --self-test
node ./scripts/create-iap-products.mjs
node ./scripts/create-iap-products.mjs --list
node ./scripts/create-iap-products.mjs --apply --only ai.olympiq.app.sub.math.week
node ./scripts/create-iap-products.mjs --apply
node ./scripts/create-iap-products.mjs --apply --with-localizations
node ./scripts/create-iap-products.mjs --help
```

## The 21 products

Identifiers follow `ai.olympiq.app.sub.<subject>.<week|month|year>`.

| Subject (Azerbaijani) | English | Weekly | Monthly | Yearly |
|---|---|---|---|---|
| Riyaziyyat | Mathematics | `...sub.math.week` | `...sub.math.month` | `...sub.math.year` |
| Məntiq | Logic | `...sub.logic.week` | `...sub.logic.month` | `...sub.logic.year` |
| İngilis dili | English | `...sub.english.week` | `...sub.english.month` | `...sub.english.year` |
| İnformatika | Informatics | `...sub.informatics.week` | `...sub.informatics.month` | `...sub.informatics.year` |
| Elm | Science | `...sub.science.week` | `...sub.science.month` | `...sub.science.year` |
| Fizika | Physics | `...sub.physics.week` | `...sub.physics.month` | `...sub.physics.year` |
| Azərbaycan dili | Azerbaijani | `...sub.azerbaijani.week` | `...sub.azerbaijani.month` | `...sub.azerbaijani.year` |

Two of these are easy to mix up and permanent if you do. **Məntiq means Logic**
and its identifier is `logic`; **Azərbaycan dili** is the language subject and
its identifier is `azerbaijani`. The script's `--self-test` checks that both are
mapped the way the database maps them.

All 21 are **non-renewing subscriptions**, not auto-renewing ones. This is
deliberate and cannot be changed later without creating new products: Apple
allows only one active auto-renewing subscription per group per Apple ID, and
OlympIQ subscriptions are per child — a parent with three children needs three
at the same time.
