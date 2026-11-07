# Publishing CleanShare

This is the checklist for taking the local extension to a public Chrome Web
Store listing. The code is ready; the account, payment and store submission
need the publisher's Google account.

## 1. Pick a name first

**Do not publish as "CleanShare".** A similar extension called
[CleanShare — Link Cleaner](https://www.crxsoso.com/firefox/detail/cleanshare-link-cleaner)
already exists. Reusing the name invites confusion and review problems.

Suggested working name: **ShareTail** (the tracking tail of a share link).
Other options: ShareTag Cleaner, TagTail, CleanLink Share.

Before publishing, update the name consistently in:

- `manifest.json` (`name`, `short_name`)
- `popup/popup.html` (`<title>`, `<h1>`)
- `README.md`
- this file, if desired

Do not put YouTube, X, Facebook or Instagram in the extension name. Mentioning
them in the description is fine, but add "not affiliated with" language.

## 2. Create the developer account

Only the publisher can do this:

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

## 3. Build the upload package

```bash
./scripts/build-store.sh
```

This writes `dist/<name>-<version>.zip` with `manifest.json` at the archive
root and only runtime files. Do not upload the repository ZIP or a folder;
upload this clean ZIP. Bump `version` in `manifest.json` for every upload.

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
- **`scripting`:** Inject the page-world cleaner into the tab whose content
  script requested it, because page clipboard APIs are not reachable from the
  extension's isolated world.
- **Host permissions:** Only the four supported platforms; used to intercept
  their copy/share actions.
- **Remote code:** No.
- **Data collection:** None. No analytics, no telemetry, no clipboard history.

Host a real privacy policy URL before submitting. The simplest route is a
public GitHub repository with GitHub Pages serving `PRIVACY.md` or a small
`privacy.html`. The dashboard requires a reachable URL; a local file path is
not enough.

## 7. Submit and review

1. Create the item in the Developer Dashboard.
2. Upload the clean ZIP.
3. Fill in the listing, privacy fields and distribution.
4. Provide test instructions: no account is needed; open a YouTube video,
   press Share → Copy link, and paste.
5. Submit for review.
6. Watch the registered email and the dashboard for reviewer questions.
7. After approval, publish and reply to early reviews.

## 8. Open source (optional but recommended)

The code is already MIT-licensed. A public repository gives reviewers and
users a place to inspect the rules and report false positives.

Before pushing:

- Remove local-only paths, profiles and `dist/` from Git.
- Keep `PRIVACY.md`, `LICENSE`, `README.md` and tests.
- Add a `SECURITY.md` with a private reporting address.
- Add a GitHub Actions workflow that runs `npm test` and the package build.
- Enable GitHub Pages for the privacy policy.
- Add the repository/support URL to the store listing.

## 9. After publishing

- Bump the version for every change; the store rejects duplicate versions.
- Keep `src/cleaner.js` updated when platforms rename parameters.
- Re-run `npm test` and `node test/e2e.mjs` before each upload.
- Keep the privacy policy and data declarations accurate.
- Do not add network calls, telemetry or remote code without updating the
  listing and privacy disclosures.
