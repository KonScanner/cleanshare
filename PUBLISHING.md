# Publishing CleanShare

This is the checklist for taking the local extension to public Chrome Web
Store and Firefox Add-ons (AMO) listings. The code is ready; the accounts,
payment and store submissions need the publisher's own accounts.

## 1. Pick a name first

**Do not publish as "CleanShare".** A similar extension called
[CleanShare — Link Cleaner](https://www.crxsoso.com/firefox/detail/cleanshare-link-cleaner)
already exists on both Chrome and Firefox. Reusing the name invites confusion
and review problems on both stores.

Suggested working name: **ShareTail** (the tracking tail of a share link).
Other options: ShareTag Cleaner, TagTail, CleanLink Share.

Before publishing, update the name consistently in:

- `manifest.json` and `manifest.firefox.json` (`name`, `short_name`)
- `popup/popup.html` (`<title>`, `<h1>`)
- `README.md`
- this file, if desired

`scripts/check-manifests.mjs` fails the build if the two manifests use
different names.

Do not put YouTube, X, Facebook or Instagram in the extension name. Mentioning
them in the description is fine, but add "not affiliated with" language.

## 2. Create the developer accounts

Only the publisher can do this. Firefox needs a free Mozilla account and has
no registration fee; see section 8. For Chrome:

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   with the Google account that should own the extension long-term.
2. Accept the developer agreement.
3. Pay the one-time **US$5** registration fee.
4. Set a publisher name and verify the contact email.
5. Enable 2-Step Verification on the account.

The fee covers up to 20 extensions on that account. Review usually takes
one to three days, but can take longer.

Official references:
[register](https://developer.chrome.com/docs/webstore/register),
[publish](https://developer.chrome.com/docs/webstore/publish),
[images](https://developer.chrome.com/docs/webstore/images).

## 3. Build the upload packages

```bash
./scripts/build-store.sh    # Chrome Web Store
./scripts/build-firefox.sh  # Firefox Add-ons (AMO)
```

The Chrome build writes `dist/<name>-<version>.zip`. The Firefox build writes
`dist/<name>-firefox-<version>.zip` and leaves an unpacked copy in
`dist/firefox/` for `about:debugging`. Both put `manifest.json` at the archive
root and include only runtime files. Do not upload the repository ZIP or a
folder.

The version must match in `package.json`, `manifest.json` and
`manifest.firefox.json`. Both build scripts run
`scripts/check-manifests.mjs`, which enforces this. Bump the version for every
upload to either store.

## 4. Prepare the listing assets

Required or recommended:

| Asset | Size | Status |
| --- | --- | --- |
| Store icon | 128×128 PNG | Ready (`icons/icon128.png`) |
| Screenshots | 1280×800 or 640×400 PNG, 1–5 | **To make** |
| Small promo tile | 440×280 PNG | Recommended |

The popup screenshot in `docs/popup.png` is 380×730 and is useful for the
README, but it is not a valid store screenshot. Make 1280×800 images showing:

1. The popup with the automatic-cleaning switch and removed tags.
2. A before/after URL example for YouTube, with `t=12312` still present.
3. Optionally, X/Facebook before/after examples.

Use real UI, no fake claims, no platform logos you do not have rights to use.

## 5. Listing copy

**Name:** ShareTail (or the chosen name)

**Short description (≤132 chars):**

> Strips account-bound share tags and tracking parameters from links you copy
> or share on YouTube, X, Facebook and Instagram.

**Detailed description:**

> Share buttons add tracking parameters to the link they hand you. YouTube adds
> `si`/`is`, X adds `a`/`s`/`t`, Facebook adds `mibextid`/`rdid`/`fbclid`, and
> Instagram adds `igsh`/`igsi`.
>
> ShareTail removes those tags automatically when you copy or share a link. It
> keeps functional parameters such as YouTube timestamps (`t=12312`), playlist
> information (`list`, `index`) and Instagram `img_index`.
>
> - Automatic cleaning on YouTube, X, Facebook and Instagram.
> - No modifier key, no clipboard history, no copied-link storage.
> - Optional `utm_*` / `mtm_*` campaign-tag removal.
> - A paste-and-clean box for links copied elsewhere.
> - Available for Chrome and Firefox.
> - 100% local: no analytics, no network requests, no remote code.
>
> Privacy policy: <your hosted privacy URL>
>
> Not affiliated with Google, YouTube, X, Meta, Facebook or Instagram.

**Category:** Productivity or Tools (choose the closest available).

**Language:** English.

## 6. Privacy and permission declarations

The store will ask for the single purpose and permission justifications. Use
these:

- **Single purpose:** Remove known share-tracking parameters from links copied
  or shared on supported social platforms.
- **`storage`:** Save the two user preferences (automatic cleaning on/off and
  campaign-tag removal on/off).
- **`clipboardWrite`:** Write the cleaned link from the popup's Copy button.
- **`scripting` (Chrome only):** Inject the page-world cleaner into the tab
  whose content script requested it, because page clipboard APIs are not
  reachable from the extension's isolated world.
- **Host permissions:** Only the four supported platforms; used to intercept
  their copy/share actions.
- **Remote code:** No.
- **Data collection:** None. No analytics, no telemetry, no clipboard history.

Host a real privacy policy URL before submitting. The simplest route is a
public GitHub repository with GitHub Pages serving `PRIVACY.md` or a small
`privacy.html`. The dashboard requires a reachable URL; a local file path is
not enough.

## 7. Submit to the Chrome Web Store

1. Create the item in the Developer Dashboard.
2. Upload the clean ZIP.
3. Fill in the listing, privacy fields and distribution.
4. Provide test instructions: no account is needed; open a YouTube video,
   press Share → Copy link, and paste.
5. Submit for review.
6. Watch the registered email and the dashboard for reviewer questions.
7. After approval, publish and reply to early reviews.

## 8. Submit to Firefox Add-ons (AMO)

The Firefox build is already shaped for AMO:

- `browser_specific_settings.gecko.id` is `cleanshare@konscanner.dev`. Keep it
  stable; a new id makes a new add-on and loses the install base.
- `strict_min_version` is `140.0`, the first Firefox that supports the AMO
  data-collection declaration (MAIN-world content scripts need 128).
- `data_collection_permissions.required` is `["none"]`; AMO requires this
  declaration for new submissions since November 2025.
- The background is an event page (`background.scripts`), not a service
  worker. Firefox does not run MV3 service workers.
- The page-world script is declared in the manifest, so Firefox does not need
  the `scripting` permission.

Steps:

1. Sign in to the [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/)
   with a Mozilla account.
2. Choose **Submit a New Add-on** and **On this site** (listed on AMO).
3. Upload `dist/<name>-firefox-<version>.zip`.
4. Let AMO validate it. The package is plain JavaScript and is not minified,
   so source-code submission is normally not required. If a reviewer asks,
   point them at the public repository and `scripts/build-firefox.sh`.
5. Fill in the listing: name, summary, description, categories, screenshots
   (1280×800), privacy-policy URL, support email and homepage.
6. Add reviewer notes: no account is needed; load the temporary add-on, open a
   YouTube video, press **Share → Copy link**, and paste.
7. Submit for review. AMO review is usually faster than the Chrome Web Store,
   but it can take several days for a new developer.
8. After approval, the signed XPI is hosted by AMO and updates are automatic.

Do not upload the same ZIP to both stores: Chrome must not see
`browser_specific_settings`, and Firefox must not see `background.service_worker`.
Build each package with its own script.

## 9. Open source (optional but recommended)

The code is already MIT-licensed. A public repository gives reviewers and
users a place to inspect the rules and report false positives.

Before pushing:

- Remove local-only paths, profiles and `dist/` from Git.
- Keep `PRIVACY.md`, `LICENSE`, `README.md` and tests.
- Add a `SECURITY.md` with a private reporting address.
- The GitHub Actions workflow runs `npm test` and both package builds on
  every push and pull request.
- Enable GitHub Pages for the privacy policy.
- Add the repository/support URL to the store listing.

## 10. After publishing

- Bump the version for every change; both stores reject duplicate versions.
- Keep `src/cleaner.js` updated when platforms rename parameters.
- Re-run `npm test`, `npm run test:e2e` and `npm run test:e2e:firefox` before
  each upload.
- Keep the privacy policy and data declarations accurate.
- Do not add network calls, telemetry or remote code without updating the
  listing and privacy disclosures.
