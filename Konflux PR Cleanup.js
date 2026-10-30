// ==UserScript==
// @license      Apache2
// @name         Konflux PR Cleanup
// @namespace    https://gitlab.cee.redhat.com/
// @version      2025-02-19-1
// @description  Blast away konflux prs
// @author       David O Neill
// @match        *://gitlab.cee.redhat.com/*
// @icon         https://cdn.imgbin.com/3/22/25/imgbin-six-thinking-hats-red-hat-enterprise-linux-fedora-cartoon-cowboy-hat-i5r6w8BjC5Ua6Y7HxHZzFsEb9.jpg
// @grant        none
// ==/UserScript==

const GITLAB_ORIGIN = "https://gitlab.cee.redhat.com";
const MR_PATH_RE =
  /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/-\/merge_requests\/(\d+)\/?$/;

/**
 * Parse a candidate href into trusted GitLab MR path parts, or null.
 * Only accepts https URLs on the hard-coded GitLab origin with a strict path shape.
 */
function parseMrParts(href) {
  let parsed;
  try {
    parsed = new URL(href, GITLAB_ORIGIN);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.origin !== GITLAB_ORIGIN) {
    return null;
  }
  const match = parsed.pathname.match(MR_PATH_RE);
  if (!match) {
    return null;
  }
  return { namespace: match[1], project: match[2], mrId: match[3] };
}

function mrPageUrl(parts) {
  return (
    GITLAB_ORIGIN +
    "/" +
    parts.namespace +
    "/" +
    parts.project +
    "/-/merge_requests/" +
    parts.mrId
  );
}

function mrApiUrl(parts) {
  const encodedProject = encodeURIComponent(
    parts.namespace + "/" + parts.project,
  );
  return (
    GITLAB_ORIGIN +
    "/api/v4/projects/" +
    encodedProject +
    "/merge_requests/" +
    parts.mrId
  );
}

async function RHOTPGHLoaded() {
  const links = [...document.querySelectorAll("a")].filter((a) =>
    a.textContent.includes("Update dependency"),
  );

  if (links.length === 0) {
    console.log("No matching merge requests found.");
    return;
  }

  const getCsrfToken = async (parts) => {
    const pageUrl = mrPageUrl(parts);
    try {
      const response = await fetch(pageUrl, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        console.error(
          `Failed to fetch MR page: ${pageUrl} - ${response.statusText}`,
        );
        return null;
      }

      const pageText = await response.text();
      const csrfMatch = pageText.match(
        /<meta name="csrf-token" content="([^"]+)"/,
      );

      return csrfMatch ? csrfMatch[1] : null;
    } catch (error) {
      console.error(`Error fetching CSRF token from ${pageUrl}:`, error);
      return null;
    }
  };

  const closeMergeRequest = async (parts, linkElement) => {
    const pageUrl = mrPageUrl(parts);
    const apiUrl = mrApiUrl(parts);
    try {
      const csrfToken = await getCsrfToken(parts);
      if (!csrfToken) {
        console.error(`Could not retrieve CSRF token for: ${pageUrl}`);
        return;
      }

      const response = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
          "x-requested-with": "XMLHttpRequest",
        },
        body: JSON.stringify({ state_event: "close" }),
        credentials: "include",
      });

      if (response.ok) {
        console.log(`Closed MR: ${pageUrl}`);

        const mergeRequestElement = linkElement.closest(".merge-request");
        if (mergeRequestElement) {
          mergeRequestElement.remove();
          console.log(`Removed MR element from DOM: ${pageUrl}`);
        }
      } else {
        const errorText = await response.text();
        console.error(`Failed to close MR: ${pageUrl}`, errorText);
      }
    } catch (error) {
      console.error(`Error closing MR: ${pageUrl}`, error);
    }
  };

  for (const linkElement of links) {
    const parts = parseMrParts(linkElement.href);
    if (!parts) {
      console.warn(`Skipping invalid URL: ${linkElement.href}`);
      continue;
    }
    console.log(mrPageUrl(parts));
    await closeMergeRequest(parts, linkElement);
  }
}

(function () {
  "use strict";
  window.addEventListener("load", RHOTPGHLoaded, false);
})();
