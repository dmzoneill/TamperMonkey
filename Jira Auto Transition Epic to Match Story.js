// ==UserScript==
// @name         Jira Auto Transition Epic to Match Story
// @namespace    https://issues.redhat.com/
// @version      2.0
// @description  Automatically transition the Epic to the same status as the Story in Jira if they are different.
// @author       David O Neill
// @match        https://issues.redhat.com/browse/AAP-*
// @icon         https://cdn.imgbin.com/3/22/25/imgbin-six-thinking-hats-red-hat-enterprise-linux-fedora-cartoon-cowboy-hat-i5r6w8BjC5Ua6Y7HxHZzFsEb9.jpg
// @run-at       document-end
// ==/UserScript==


(function () {
    "use strict";

    // Mapping of states to transition IDs
    const TRANSITIONS = {
        "New": "61",
        "Refinement": "11",
        "Backlog": "21",
        "In Progress": "31",
        "Release Pending": "41",
        "Closed": "51"
    };

    function getIssueId() {
        const match = window.location.pathname.match(/AAP-(\d+)/);
        return match ? match[0] : null;
    }

    function isStory() {
        const typeElement = document.querySelector("#type-val img");
        return typeElement && typeElement.alt.includes("Story");
    }

    function getCurrentStoryStatus() {
        const statusElement = document.querySelector("#opsbar-transitions_more .dropdown-text");
        return statusElement ? statusElement.innerText.trim() : null;
    }

    function getEpicId() {
        const epicElement = document.querySelector('div[data-fieldtypecompletekey="com.pyxis.greenhopper.jira:gh-epic-link"] a');
        if (epicElement) {
            const match = epicElement.href.match(/AAP-(\d+)/);
            return match ? match[0] : null;
        }
        return null;
    }

    function getAtlToken() {
        const metaTag = document.querySelector("meta[name='atlassian-token']");
        return metaTag ? metaTag.content : null;
    }

    async function getEpicStatus(epicId, atlToken) {
        const url = `https://issues.redhat.com/rest/api/2/issue/${epicId}?fields=status&atl_token=${atlToken}`;

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: { "Accept": "application/json" },
                credentials: "include"
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            console.log(`[INFO] Epic ${epicId} is currently in status: ${data.fields.status.name}`);
            return data.fields.status.name;
        } catch (error) {
            console.error(`[ERROR] Failed to fetch Epic ${epicId} status:`, error);
            return null;
        }
    }

    async function transitionEpicToStoryStatus(epicId, storyStatus, atlToken) {
        const transitionId = TRANSITIONS[storyStatus];
        if (!transitionId) {
            console.log(`[INFO] No matching transition found for status: ${storyStatus}. Exiting.`);
            return;
        }

        const url = `https://issues.redhat.com/rest/api/2/issue/${epicId}/transitions?atl_token=${atlToken}`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({ transition: { id: transitionId } })
            });

            if (response.ok) {
                console.log(`[SUCCESS] Epic ${epicId} transitioned to ${storyStatus} (${transitionId})`);
            } else {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
        } catch (error) {
            console.error(`[ERROR] Transition failed`, error);
        }
    }

    async function main() {
        const issueId = getIssueId();
        if (!issueId) {
            console.warn("Could not determine issue ID. Exiting.");
            return;
        }

        if (!isStory()) {
            console.log("[INFO] Not a Story. Exiting.");
            return;
        }

        const storyStatus = getCurrentStoryStatus();
        if (!storyStatus) {
            console.log("[INFO] Could not determine Story status. Exiting.");
            return;
        }

        const epicId = getEpicId();
        if (!epicId) {
            console.log("[INFO] No Parent Epic found. Exiting.");
            return;
        }

        const atlToken = getAtlToken();
        if (!atlToken) {
            console.error("[ERROR] Could not retrieve Atlassian token. API requests may fail.");
            return;
        }

        const epicStatus = await getEpicStatus(epicId, atlToken);
        if (!epicStatus) {
            console.log("[INFO] Could not retrieve Epic status. Exiting.");
            return;
        }

        if (epicStatus === storyStatus) {
            console.log(`[INFO] Epic ${epicId} is already in the same status as Story ${issueId}. No transition needed.`);
            return;
        }

        console.log(`[INFO] Story ${issueId} is in status: ${storyStatus}. Transitioning Epic ${epicId} to match.`);
        await transitionEpicToStoryStatus(epicId, storyStatus, atlToken);
    }

    // Run after page load
    window.addEventListener("load", () => {
        setTimeout(main, 3000); // Wait 3 seconds to ensure page fully loads
    });

})();
