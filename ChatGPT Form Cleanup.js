// ==UserScript==
// @name         ChatGPT Form Cleanup
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds a button to clean up Slack messages using ChatGPT
// @author       David O Neill
// @icon         https://cdn.imgbin.com/3/22/25/imgbin-six-thinking-hats-red-hat-enterprise-linux-fedora-cartoon-cowboy-hat-i5r6w8BjC5Ua6Y7HxHZzFsEb9.jpg
// @match        https://app.slack.com/*
// @match        https://issues.redhat.com/*
// @match        https://your-settings-page.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(function () {
    "use strict";

    const siteConfigs = {
        "app.slack.com": {
            buttons: ["button[data-qa='slash_commands_composer_button']"],
            editors: [".ql-editor[aria-label^='Message to']", ".ql-editor[aria-label^='Reply to thread']"],
            systemPrompt: GM_getValue("systemPrompt_app.slack.com", "You are an experienced engineer optimizing Slack messages."),
            userPromptTemplate: GM_getValue("userPromptTemplate_app.slack.com", "Please clean up this Slack message:\n\n{text}")
        },
        "issues.redhat.com": {
            buttons: ["button.aui-button[aria-pressed='false'][resolved]"],
            editors: ["iframe.tox-edit-area__iframe"],
            systemPrompt: GM_getValue("systemPrompt_issues.redhat.com", "You are a technical editor for Red Hat issues."),
            userPromptTemplate: GM_getValue("userPromptTemplate_issues.redhat.com", "Improve the following issue report:\n\n{text}")
        }
    };

    // Default global settings
    const defaultSettings = {
        apiKey: GM_getValue("apiKey", ""),
        apiUrl: GM_getValue("apiUrl", "https://api.openai.com/v1/chat/completions")
    };

    // Load settings or set defaults if they don't exist
    const settings = {
        apiKey: GM_getValue("apiKey", defaultSettings.apiKey),
        apiUrl: GM_getValue("apiUrl", defaultSettings.apiUrl),
        systemPrompt: GM_getValue("systemPrompt", defaultSettings.systemPrompt),
        userPromptTemplate: GM_getValue("userPromptTemplate", defaultSettings.userPromptTemplate)
    };

    function logDebug(message) {
        console.info(`[ChatGPT-Button] ${message}`);
    }

    // Function to open the settings page
    function openSettingsPage() {
        let settingsHtml = "<html><head><title>ChatGPT Cleanup Settings</title>" +
            "<style>body { font-family: Arial, sans-serif; padding: 20px; }" +
            "label { display: block; margin-top: 10px; font-weight: bold; }" +
            "input, textarea { width: 100%; padding: 5px; margin-top: 5px; }" +
            "button { margin-top: 15px; padding: 10px; cursor: pointer; }</style></head><body>" +
            "<h2>ChatGPT Cleanup Settings</h2>" +
            "<label>OpenAI API Key:</label>" +
            `<input type='text' id='apiKey' value='${defaultSettings.apiKey}'>`;

        for (const site in siteConfigs) {
            settingsHtml += `<h3>Settings for ${site}</h3>`;
            settingsHtml += `<label>System Prompt:</label>`;
            settingsHtml += `<textarea id='systemPrompt_${site}'>${siteConfigs[site].systemPrompt}</textarea>`;
            settingsHtml += `<label>User Prompt Template:</label>`;
            settingsHtml += `<textarea id='userPromptTemplate_${site}'>${siteConfigs[site].userPromptTemplate}</textarea>`;
        }

        settingsHtml += "<button id='saveSettings'>Save Settings</button></body></html>";

        // Create a Blob for the settings page
        const settingsBlob = new Blob([settingsHtml], { type: "text/html" });
        const settingsUrl = URL.createObjectURL(settingsBlob);

        // Open settings page in a new tab
        const settingsWindow = window.open(settingsUrl, "_blank");

        if (settingsWindow) {
            // Wait for settings page to load before injecting script
            setTimeout(() => {
                const scriptContent = `
                document.getElementById('saveSettings').addEventListener('click', function() {
                    const apiKey = document.getElementById('apiKey').value;
                    localStorage.setItem('chatgpt_apiKey', apiKey);

                    ${Object.keys(siteConfigs).map(site => `
                        localStorage.setItem('chatgpt_systemPrompt_${site}', document.getElementById('systemPrompt_${site}').value);
                        localStorage.setItem('chatgpt_userPromptTemplate_${site}', document.getElementById('userPromptTemplate_${site}').value);
                    `).join("")}

                    alert('Settings saved. Refresh to apply changes.');
                });
            `;

                // Create a Blob for the JavaScript
                const scriptBlob = new Blob([scriptContent], { type: "application/javascript" });
                const scriptUrl = URL.createObjectURL(scriptBlob);

                // Create and append the script element
                const scriptElement = settingsWindow.document.createElement("script");
                scriptElement.src = scriptUrl;
                settingsWindow.document.body.appendChild(scriptElement);
            }, 500);
        }
    }

    function addChatGPTButton() {
        const hostname = window.location.hostname;

        if (!(hostname in siteConfigs)) {
            logDebug(`No configuration found for this site: ${hostname}`);
            return;
        }

        const config = siteConfigs[hostname];
        let targetSelectors = [];

        config.buttons.forEach(sel => {
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
                targetSelectors.push(...elements);
            }
        });

        logDebug(`Found ${targetSelectors.length} target buttons on ${hostname}`);

        if (targetSelectors.length === 0) {
            logDebug("No buttons found, retrying in 500ms...");
            setTimeout(addChatGPTButton, 500);
            return;
        }

        targetSelectors.forEach((existingButton, index) => {
            if (!existingButton || !existingButton.parentNode) {
                logDebug("Skipping invalid button element.");
                return;
            }

            if (existingButton.parentNode.querySelector(".chatgpt-cleanup-button")) {
                logDebug("Button already exists, skipping.");
                return;
            }

            const associatedEditorSelector = config.editors[index] || config.editors[0];
            logDebug(`Assigning button to editor: ${associatedEditorSelector}`);

            const chatGPTButton = document.createElement("button");
            chatGPTButton.className = "chatgpt-cleanup-button";
            chatGPTButton.setAttribute("role", "button");
            chatGPTButton.setAttribute("aria-label", "ChatGPT Cleanup");
            chatGPTButton.setAttribute("type", "button");
            chatGPTButton.dataset.editorSelector = associatedEditorSelector;
            chatGPTButton.textContent = "✏️";
            existingButton.parentNode.insertBefore(chatGPTButton, existingButton.nextSibling);
            logDebug("Button inserted into the page");

            chatGPTButton.addEventListener("click", async () => {
                let editor;
                if (associatedEditorSelector.startsWith("iframe")) {
                    const iframe = document.querySelector(associatedEditorSelector);
                    if (iframe && iframe.contentDocument) {
                        editor = iframe.contentDocument.body;
                    }
                } else {
                    editor = document.querySelector(associatedEditorSelector);
                }

                if (!editor) {
                    logDebug("Editor not found");
                    alert("Editor not found.");
                    return;
                }

                const textToClean = editor.innerText.trim();
                logDebug(`Text to clean: ${textToClean}`);

                if (!textToClean) {
                    logDebug("No text to clean");
                    alert("No text to clean.");
                    return;
                }

                chatGPTButton.disabled = true;
                chatGPTButton.style.opacity = "0.5";

                const systemPrompt = config.systemPrompt || "Default system prompt";
                const userPromptTemplate = config.userPromptTemplate || "Default user prompt: {text}";
                const cleanedText = await sendToOpenAI(textToClean, systemPrompt, userPromptTemplate);

                logDebug(`Cleaned text received: ${cleanedText}`);
                editor.innerHTML = `<p>${cleanedText}</p>`;
                chatGPTButton.disabled = false;
                chatGPTButton.style.opacity = "1";
            });
        });
    }

    async function sendToOpenAI(selectedText, systemPrompt, userPromptTemplate) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: defaultSettings.apiUrl,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${defaultSettings.apiKey}`
                },
                data: JSON.stringify({
                    model: "gpt-4",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPromptTemplate.replace("{text}", selectedText) }
                    ],
                    temperature: 0.5
                }),
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data.choices?.[0]?.message?.content || "Error: Unable to clean text.");
                    } catch (error) {
                        reject("Error parsing OpenAI response.");
                    }
                },
                onerror: function () {
                    reject("Error: Unable to connect to OpenAI.");
                }
            });
        });
    }

    // Register the settings page in Tampermonkey menu
    GM_registerMenuCommand("Configure ChatGPT Settings", openSettingsPage);

    const observer = new MutationObserver(() => {
        logDebug("MutationObserver triggered, checking for buttons");
        addChatGPTButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    logDebug("Initial button check");
    addChatGPTButton();
})();
