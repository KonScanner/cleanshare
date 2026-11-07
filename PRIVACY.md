# Privacy

CleanShare is a local URL cleaner. It does not collect, transmit, sell, or
share any data.

## What it stores

Only two settings, in the browser's `storage.sync` area:

- whether automatic cleaning is enabled
- whether campaign tags (`utm_*`, `mtm_*`) are stripped

Chrome may sync those settings through the profile's Google account. Firefox
may sync them through Firefox Sync when Sync is enabled; otherwise they stay
on the device. There is no CleanShare account and no CleanShare server.

## What it reads

The content script runs only on `youtube.com`, `youtu.be`, `x.com`,
`twitter.com`, `facebook.com` and `instagram.com`. It observes URLs that the
page is about to place on the clipboard or in the Web Share API.

At the moment you copy, it reads the current selection or the focused input so
that it can remove known tracking parameters. It does not read the clipboard,
messages, or browsing history, and it never stores or transmits the selected
text.

## What it writes

The extension writes the cleaned URL to the clipboard only when the page
itself was already copying/sharing a link, or when you press **Copy** in the
popup. The `clipboardWrite` permission exists for that popup button.

## Network

There are no network requests, analytics, telemetry, tracking pixels, or
remote code.

In Chrome, a small service worker receives a message from the page's content
script and injects the page-world cleaner into that tab with
`chrome.scripting`. In Firefox, the manifest declares that page-world script,
so the background event page does no injection. Neither background script
reads page content, collects data, or contacts a server.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save the two toggles. |
| `clipboardWrite` | Let the popup's **Copy** button write the cleaned link. |
| `scripting` (Chrome only) | Inject the page-world cleaner into the supported tab that asked for it. |
| Site access (content scripts + host permissions) | Wrap the copy/share APIs on the four supported platforms. |

There is no `tabs`, `webNavigation`, `webRequest`, or "read all sites" access.

## Contact

Open an issue in the repository where you found this extension.
