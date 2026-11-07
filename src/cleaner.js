/*
 * CleanShare URL rules.
 *
 * This file is loaded as a plain script in the extension's MAIN world and in
 * the popup, and is also require()d by the Node tests. Keeping the rules in
 * one place makes it easy to add the next tracking parameter a platform
 * invents.
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window === "undefined" && typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.__shareClean = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    stripUtm: true,
  });

  /*
   * Parameters that identify a click or a share and are safe to remove on any
   * site. Platform-specific one-letter parameters (YouTube `si`, X `s`/`t`)
   * are deliberately not in this list because they can be meaningful on
   * other sites.
   */
  const GLOBAL_PARAMS = new Set(["fbclid", "twclid"]);

  const CAMPAIGN_PREFIXES = ["utm_", "mtm_"];

  const HOST_RULES = [
    {
      id: "youtube",
      domains: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
      // si / is: share identifier tied to the sharer's Google account.
      // pp: encoded playback/surface context.
      // feature: records the surface that produced the click.
      params: new Set(["si", "is", "pp", "feature"]),
    },
    {
      id: "x",
      domains: ["x.com", "twitter.com"],
      // a / t: share tokens. s: app/platform code (19 Android, 20 web,
      // 46 iPhone). cn / ref_src / ref_url / src: referral tags.
      params: new Set([
        "a",
        "s",
        "t",
        "cn",
        "ref_src",
        "ref_url",
        "refsrc",
        "src",
        "twclid",
      ]),
    },
    {
      id: "facebook",
      domains: ["facebook.com", "fb.com", "fb.watch", "messenger.com"],
      // fbclid: click ID. mibextid / rdid: app-share attribution.
      // shbid / shbv: share surface and version. sfnsn: share surface.
      params: new Set([
        "fbclid",
        "mibextid",
        "rdid",
        "shbid",
        "shbv",
        "sfnsn",
        "__tn__",
        "hc_ref",
        "fref",
        "ref",
        "refid",
        "comment_tracking",
        "dti",
        "tracking",
        "referral_code",
        "referral_story_type",
      ]),
      prefixes: ["__cft__[", "__xts__["],
    },
    {
      id: "instagram",
      domains: ["instagram.com", "instagr.am"],
      // igshid was the old share id; igsh and igsi are the newer names.
      params: new Set(["igsh", "igshid", "igsi"]),
    },
  ];

  function hostMatches(hostname, domain) {
    return hostname === domain || hostname.endsWith("." + domain);
  }

  function findRule(hostname) {
    return HOST_RULES.find((rule) =>
      rule.domains.some((domain) => hostMatches(hostname, domain))
    );
  }

  function shouldRemove(name, rule, stripUtm) {
    const key = name.toLowerCase();

    if (GLOBAL_PARAMS.has(key)) return true;
    if (stripUtm && CAMPAIGN_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      return true;
    }
    if (!rule) return false;
    if (rule.params.has(key)) return true;
    return Boolean(
      rule.prefixes && rule.prefixes.some((prefix) => key.startsWith(prefix))
    );
  }

  /**
   * Remove known share-tracking parameters from one URL.
   *
   * Returns the original string unchanged when the URL is invalid, is not
   * http(s), or has nothing to remove. That preserves the exact formatting of
   * already-clean links (including percent-encoding and parameter order).
   *
   * @param {string} raw
   * @param {{stripUtm?: boolean}} [options]
   * @returns {string}
   */
  function cleanUrl(raw, options) {
    if (typeof raw !== "string") return raw;

    const value = raw.trim();
    if (!/^https?:\/\//i.test(value)) return raw;

    let url;
    try {
      url = new URL(value);
    } catch {
      return raw;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") return raw;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const rule = findRule(hostname);
    const stripUtm = !options || options.stripUtm !== false;

    let changed = false;
    for (const name of Array.from(url.searchParams.keys())) {
      if (shouldRemove(name, rule, stripUtm)) {
        url.searchParams.delete(name);
        changed = true;
      }
    }

    return changed ? url.toString() : raw;
  }

  // A URL in free text. The trailing punctuation is split off before parsing
  // and appended back, so "see https://x.com/a/status/1?s=20." keeps its dot.
  const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
  const TRAILING_PUNCTUATION =
    /[.,;:!?)\]}，。、！？；：）】》」』…\p{Extended_Pictographic}]+$/u;

  /**
   * Clean every http(s) URL inside a piece of text. Text without URLs is
   * returned untouched.
   *
   * @param {string} text
   * @param {{stripUtm?: boolean}} [options]
   * @returns {string}
   */
  function cleanText(text, options) {
    if (typeof text !== "string" || !/https?:\/\//i.test(text)) return text;

    return text.replace(URL_PATTERN, (match) => {
      const trailingMatch = match.match(TRAILING_PUNCTUATION);
      const trailing = trailingMatch ? trailingMatch[0] : "";
      const core = trailing ? match.slice(0, -trailing.length) : match;
      return cleanUrl(core, options) + trailing;
    });
  }

  return {
    DEFAULT_SETTINGS,
    GLOBAL_PARAMS,
    HOST_RULES,
    cleanText,
    cleanUrl,
  };
});
