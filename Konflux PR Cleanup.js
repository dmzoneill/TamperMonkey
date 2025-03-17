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

async function RHOTPGHLoaded() {
    // Find all links with the text "Update dependency"
    const links = [...document.querySelectorAll('a')]
        .filter(a => a.textContent.includes("Update dependency"));

    if (links.length === 0) {
        console.log("No matching merge requests found.");
        return;
    }

    // Extract merge request URLs
    const mrUrls = links.map(link => link.href);

    console.log(mrUrls)

    // Function to fetch CSRF token from a GitLab MR page
    const getCsrfToken = async (mrPageUrl) => {
        try {
            const response = await fetch(mrPageUrl, {
                method: "GET",
                credentials: "include"
            });

            if (!response.ok) {
                console.error(`Failed to fetch MR page: ${mrPageUrl} - ${response.statusText}`);
                return null;
            }

            const pageText = await response.text();
            const csrfMatch = pageText.match(/<meta name="csrf-token" content="([^"]+)"/);

            return csrfMatch ? csrfMatch[1] : null;
        } catch (error) {
            console.error(`Error fetching CSRF token from ${mrPageUrl}:`, error);
            return null;
        }
    };

    // Function to close a GitLab Merge Request and remove its associated <li> element
    const closeMergeRequest = async (mrPageUrl, linkElement) => {
        try {
            const match = mrPageUrl.match(/\/([^/]+)\/([^/]+)\/-\/merge_requests\/(\d+)/);
            if (!match) {
                console.warn(`Skipping invalid URL: ${mrPageUrl}`);
                return;
            }

            const [, namespace, project, mrId] = match;
            const encodedProject = encodeURIComponent(`${namespace}/${project}`);
            const apiUrl = `https://gitlab.cee.redhat.com/api/v4/projects/${encodedProject}/merge_requests/${mrId}`;

            // Fetch the MR page to get the latest CSRF token
            const csrfToken = await getCsrfToken(mrPageUrl);
            if (!csrfToken) {
                console.error(`Could not retrieve CSRF token for: ${mrPageUrl}`);
                return;
            }

            // Send request to close the MR
            const response = await fetch(apiUrl, {
                method: "PUT",
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "content-type": "application/json",
                    "x-csrf-token": csrfToken,
                    "x-requested-with": "XMLHttpRequest"
                },
                body: JSON.stringify({ state_event: "close" }),
                credentials: "include"
            });

            if (response.ok) {
                console.log(`Closed MR: ${mrPageUrl}`);

                // Remove the associated <li class="merge-request"> from the DOM
                const mergeRequestElement = linkElement.closest('.merge-request');
                if (mergeRequestElement) {
                    mergeRequestElement.remove();
                    console.log(`Removed MR element from DOM: ${mrPageUrl}`);
                }
            } else {
                const errorText = await response.text();
                console.error(`Failed to close MR: ${mrPageUrl}`, errorText);
            }
        } catch (error) {
            console.error(`Error closing MR: ${mrPageUrl}`, error);
        }
    };

    // Close all found merge requests and remove their elements
    for (const linkElement of links) {
        const url = linkElement.href;
        console.log(url);
        await closeMergeRequest(url, linkElement);
    }
}

(function() {
    'use strict';
    window.addEventListener('load', RHOTPGHLoaded, false);
})();
