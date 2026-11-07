"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanUrl, cleanText } = require("../src/cleaner.js");

test("YouTube: strips si and is but keeps timestamp and playlist", () => {
  assert.equal(
    cleanUrl("https://youtu.be/dQw4w9WgXcQ?si=hK3nR9pQ2mF7xW"),
    "https://youtu.be/dQw4w9WgXcQ"
  );
  assert.equal(
    cleanUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&is=abc123"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  );
  assert.equal(
    cleanUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42&si=abc&list=PL123&index=2"
    ),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42&list=PL123&index=2"
  );
});

test("YouTube: keeps numeric and human-readable timestamps", () => {
  assert.equal(
    cleanUrl("https://youtu.be/dQw4w9WgXcQ?si=track&t=12312"),
    "https://youtu.be/dQw4w9WgXcQ?t=12312"
  );
  assert.equal(
    cleanUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s&is=track"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"
  );
  assert.equal(
    cleanUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=12312&si=track"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=12312"
  );
});

test("YouTube: strips feature and pp, keeps ab_channel", () => {
  assert.equal(
    cleanUrl(
      "https://youtu.be/abc?feature=share&pp=ygUabc&ab_channel=Someone"
    ),
    "https://youtu.be/abc?ab_channel=Someone"
  );
});

test("YouTube: works on music.youtube.com and youtube-nocookie.com", () => {
  assert.equal(
    cleanUrl("https://music.youtube.com/watch?v=abc&si=tracking"),
    "https://music.youtube.com/watch?v=abc"
  );
  assert.equal(
    cleanUrl("https://www.youtube-nocookie.com/embed/abc?si=tracking"),
    "https://www.youtube-nocookie.com/embed/abc"
  );
});

test("X: strips a, s, t, cn and referral tags", () => {
  assert.equal(
    cleanUrl("https://x.com/user/status/123?a=Kq3vX9mPzR2tLw8nYb4c&s=19"),
    "https://x.com/user/status/123"
  );
  assert.equal(
    cleanUrl(
      "https://twitter.com/user/status/123?s=20&t=abc&cn=xyz&ref_src=twsrc%5Etfw&ref_url=https%3A%2F%2Fexample.com"
    ),
    "https://twitter.com/user/status/123"
  );
});

test("X: leaves ordinary search parameters alone", () => {
  assert.equal(
    cleanUrl("https://x.com/search?q=hello&f=live"),
    "https://x.com/search?q=hello&f=live"
  );
});

test("X: keeps the hash fragment", () => {
  assert.equal(
    cleanUrl("https://x.com/user/status/123?s=20#reply"),
    "https://x.com/user/status/123#reply"
  );
});

test("Facebook: strips share ids and click ids", () => {
  assert.equal(
    cleanUrl(
      "https://www.facebook.com/share/p/ABC/?mibextid=wwXIfr&rdid=xyz&shbid=1&shbv=2"
    ),
    "https://www.facebook.com/share/p/ABC/"
  );
  assert.equal(
    cleanUrl("https://www.facebook.com/watch/?v=123&fbclid=abc&sfnsn=mo"),
    "https://www.facebook.com/watch/?v=123"
  );
});

test("Facebook: strips encoded __cft__ keys", () => {
  assert.equal(
    cleanUrl(
      "https://www.facebook.com/photo/?fbid=1&__cft__%5B0%5D=abc&__tn__=%2H-R"
    ),
    "https://www.facebook.com/photo/?fbid=1"
  );
});

test("Instagram: strips igsh, igshid and igsi, keeps img_index", () => {
  assert.equal(
    cleanUrl("https://www.instagram.com/reel/ABC/?igsh=tracking"),
    "https://www.instagram.com/reel/ABC/"
  );
  assert.equal(
    cleanUrl("https://www.instagram.com/p/ABC/?igshid=old"),
    "https://www.instagram.com/p/ABC/"
  );
  assert.equal(
    cleanUrl("https://www.instagram.com/p/ABC/?igsi=new"),
    "https://www.instagram.com/p/ABC/"
  );
  assert.equal(
    cleanUrl("https://www.instagram.com/p/ABC/?img_index=2&igsh=tracking"),
    "https://www.instagram.com/p/ABC/?img_index=2"
  );
});

test("Global click ids are stripped on any site", () => {
  assert.equal(
    cleanUrl("https://example.com/article?fbclid=abc&id=7"),
    "https://example.com/article?id=7"
  );
  assert.equal(
    cleanUrl("https://example.com/article?twclid=abc&id=7"),
    "https://example.com/article?id=7"
  );
});

test("Campaign tags follow the stripUtm option", () => {
  const url =
    "https://example.com/article?utm_source=newsletter&utm_medium=email&id=7";
  assert.equal(cleanUrl(url), "https://example.com/article?id=7");
  assert.equal(
    cleanUrl(url, { stripUtm: false }),
    "https://example.com/article?utm_source=newsletter&utm_medium=email&id=7"
  );
  assert.equal(
    cleanUrl("https://example.com/?mtm_campaign=x", { stripUtm: false }),
    "https://example.com/?mtm_campaign=x"
  );
});

test("Already-clean URLs are returned byte for byte", () => {
  const url = "https://example.com/a%20b?x=1&y=two#frag";
  assert.equal(cleanUrl(url), url);
});

test("Invalid and non-http values are untouched", () => {
  assert.equal(cleanUrl("not a url"), "not a url");
  assert.equal(cleanUrl("mailto:someone@example.com"), "mailto:someone@example.com");
  assert.equal(cleanUrl("ftp://example.com/?fbclid=x"), "ftp://example.com/?fbclid=x");
  assert.equal(cleanUrl(undefined), undefined);
  assert.equal(cleanUrl(null), null);
});

test("cleanText cleans every URL in a message and keeps punctuation", () => {
  assert.equal(
    cleanText(
      "Try https://youtu.be/abc?si=track and https://x.com/a/status/1?s=20, then reply."
    ),
    "Try https://youtu.be/abc and https://x.com/a/status/1, then reply."
  );
  assert.equal(cleanText("No links here."), "No links here.");
  assert.equal(
    cleanText("A link: https://example.com/?utm_source=x."),
    "A link: https://example.com/."
  );
});

test("cleanText keeps Unicode punctuation and emoji after URLs", () => {
  assert.equal(
    cleanText("see https://x.com/a/status/1?s=20😀"),
    "see https://x.com/a/status/1😀"
  );
  assert.equal(
    cleanText("see https://x.com/a/status/1?s=20。"),
    "see https://x.com/a/status/1。"
  );
});

test("cleanText keeps URLs that only differ by surrounding text", () => {
  assert.equal(
    cleanText("(https://youtu.be/abc?si=tracking)"),
    "(https://youtu.be/abc)"
  );
});

test("cleaning is idempotent", () => {
  const once = cleanUrl("https://x.com/a/status/1?a=1&s=20&t=2");
  assert.equal(cleanUrl(once), once);
});

test("parameter names are matched case-insensitively", () => {
  assert.equal(
    cleanUrl("https://youtu.be/abc?SI=tracking"),
    "https://youtu.be/abc"
  );
});

test("duplicate tracking parameters are all removed", () => {
  assert.equal(
    cleanUrl("https://youtu.be/abc?si=one&si=two&t=3"),
    "https://youtu.be/abc?t=3"
  );
});
