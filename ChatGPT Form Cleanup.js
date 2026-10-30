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
/* global GM_xmlhttpRequest, GM_getValue, GM_registerMenuCommand */

(function () {
  "use strict";

  // Escape text for safe interpolation into HTML
  function getOwnValue(map, key) {
    for (const [entryKey, entryValue] of Object.entries(map)) {
      if (entryKey === key) {
        return entryValue;
      }
    }
    return undefined;
  }

  function setEditorText(target, text) {
    const p = document.createElement("p");
    String(text)
      .split("\n")
      .forEach((line, idx) => {
        if (idx > 0) p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(line));
      });
    target.replaceChildren(p);
  }

  const siteConfigs = {
    "app.slack.com": {
      buttons: ["button[data-qa='slash_commands_composer_button']"],
      editors: [
        ".ql-editor[aria-label^='Message to']",
        ".ql-editor[aria-label^='Reply to thread']",
      ],
      systemPrompt: GM_getValue(
        "systemPrompt_app.slack.com",
        "You are an experienced engineer optimizing Slack messages.",
      ),
      userPromptTemplate: GM_getValue(
        "userPromptTemplate_app.slack.com",
        "Please clean up this Slack message:\n\n{text}",
      ),
    },
    "issues.redhat.com": {
      buttons: ["button.aui-button[aria-pressed='false'][resolved]"],
      editors: ["iframe.tox-edit-area__iframe"],
      systemPrompt: GM_getValue(
        "systemPrompt_issues.redhat.com",
        "You are a technical editor for Red Hat issues.",
      ),
      userPromptTemplate: GM_getValue(
        "userPromptTemplate_issues.redhat.com",
        "Improve the following issue report:\n\n{text}",
      ),
    },
  };

  // Default global settings
  const defaultSettings = {
    apiKey: GM_getValue("apiKey", ""),
    apiUrl: GM_getValue("apiUrl", "https://api.openai.com/v1/chat/completions"),
  };

  function logDebug(message) {
    console.info(`[ChatGPT-Button] ${message}`);
  }

  // Function to open the settings page (DOM APIs only — no HTML string blobs)
  function openSettingsPage() {
    const settingsWindow = window.open("about:blank", "_blank");
    if (!settingsWindow) {
      return;
    }

    const doc = settingsWindow.document;
    doc.title = "ChatGPT Cleanup Settings";

    const style = doc.createElement("style");
    style.textContent =
      "body { font-family: Arial, sans-serif; padding: 20px; }" +
      "label { display: block; margin-top: 10px; font-weight: bold; }" +
      "input, textarea { width: 100%; padding: 5px; margin-top: 5px; }" +
      "button { margin-top: 15px; padding: 10px; cursor: pointer; }";
    doc.head.appendChild(style);

    const heading = doc.createElement("h2");
    heading.textContent = "ChatGPT Cleanup Settings";
    doc.body.appendChild(heading);

    const apiKeyLabel = doc.createElement("label");
    apiKeyLabel.textContent = "OpenAI API Key:";
    doc.body.appendChild(apiKeyLabel);

    const apiKeyInput = doc.createElement("input");
    apiKeyInput.type = "text";
    apiKeyInput.id = "apiKey";
    apiKeyInput.value = defaultSettings.apiKey;
    doc.body.appendChild(apiKeyInput);

    for (const [site, cfg] of Object.entries(siteConfigs)) {
      const siteHeading = doc.createElement("h3");
      siteHeading.textContent = "Settings for " + site;
      doc.body.appendChild(siteHeading);

      const systemLabel = doc.createElement("label");
      systemLabel.textContent = "System Prompt:";
      doc.body.appendChild(systemLabel);

      const systemArea = doc.createElement("textarea");
      systemArea.id = "systemPrompt_" + site;
      systemArea.value = cfg.systemPrompt;
      doc.body.appendChild(systemArea);

      const userLabel = doc.createElement("label");
      userLabel.textContent = "User Prompt Template:";
      doc.body.appendChild(userLabel);

      const userArea = doc.createElement("textarea");
      userArea.id = "userPromptTemplate_" + site;
      userArea.value = cfg.userPromptTemplate;
      doc.body.appendChild(userArea);
    }

    const saveButton = doc.createElement("button");
    saveButton.id = "saveSettings";
    saveButton.type = "button";
    saveButton.textContent = "Save Settings";
    doc.body.appendChild(saveButton);

    const siteKeys = Object.keys(siteConfigs);
    saveButton.addEventListener("click", function () {
      const apiKey = apiKeyInput.value;
      localStorage.setItem("chatgpt_apiKey", apiKey);

      for (const site of siteKeys) {
        const systemEl = doc.getElementById("systemPrompt_" + site);
        const userEl = doc.getElementById("userPromptTemplate_" + site);
        if (systemEl) {
          localStorage.setItem("chatgpt_systemPrompt_" + site, systemEl.value);
        }
        if (userEl) {
          localStorage.setItem(
            "chatgpt_userPromptTemplate_" + site,
            userEl.value,
          );
        }
      }

      settingsWindow.alert("Settings saved. Refresh to apply changes.");
    });
  }

  function addThreadChatButton() {
    const threadDialog = document.querySelector(
      "div.p-view_contents.p-view_contents--secondary[aria-label*='Thread in channel']",
    );
    if (!threadDialog) return;

    const existingChatButtons = document.querySelectorAll(
      ".chatgpt-cleanup-button",
    );
    if (existingChatButtons.length < 2) return;

    const targetButton = existingChatButtons[1];
    if (
      !targetButton ||
      targetButton.nextSibling?.classList?.contains("thread-chat-icon-button")
    )
      return;

    const newButton = document.createElement("button");
    newButton.className = "thread-chat-icon-button";
    newButton.setAttribute("aria-label", "Summarize Thread");
    newButton.setAttribute("type", "button");
    newButton.textContent = "💬";
    newButton.style.marginLeft = "5px";
    newButton.style.cursor = "pointer";

    targetButton.parentNode.insertBefore(newButton, targetButton.nextSibling);

    newButton.addEventListener("click", async () => {
      const richTextSections = threadDialog.querySelectorAll(
        ".p-rich_text_section",
      );
      const texts = Array.from(richTextSections)
        .map((el) => el.innerText.trim())
        .filter(Boolean);
      const combinedText = texts.join("\n\n");

      console.log("[Thread Extracted Texts]", combinedText);

      let systemPrompt = "You are a summarization and analysis assistant.";
      systemPrompt +=
        "The user will send you a chunk of text that represents a chat log. The text may contain informal or fragmented sentences.";
      systemPrompt +=
        "Your job is to analyze the chat, then return a slim, well-formatted response with the following three sections:";
      systemPrompt +=
        "Summary – one or two short bullet points that explain what the conversation is mainly about.";
      systemPrompt +=
        "Key Points – a list of clear, useful bullet points summarizing what was discussed or agreed upon.";
      systemPrompt +=
        "Unanswered Questions – bullet points listing any unresolved questions or issues that were raised but not answered.";
      systemPrompt += "Formatting instructions:";
      systemPrompt +=
        "Use bold to label each section, but do not use headings or titles.";
      systemPrompt += "Use bullet points (•) for each item.";
      systemPrompt +=
        "Keep language professional, clear, and to the point.Read all this text. Summarize it.";
      systemPrompt +=
        "Respond in html, wrapping each line in its own paragraph (p) element";

      const userPrompt = combinedText;

      try {
        const summary = await sendToOpenAI(userPrompt, systemPrompt, "{text}");
        console.log("[Thread Summary]", summary);

        // Find the Slack reply editor
        const replyEditor = document.querySelector(
          ".ql-editor[aria-label^='Reply to thread']",
        );
        if (!replyEditor) {
          alert("Could not find the reply editor.");
          return;
        }

        setEditorText(replyEditor, summary);
        alert("Summary added to the reply editor.");
      } catch (err) {
        console.error("Failed to summarize:", err);
        alert("Error occurred while summarizing thread.");
      }
    });
  }

  function addChatGPTButton() {
    const hostname = window.location.hostname;

    const config = getOwnValue(siteConfigs, hostname);
    if (!config) {
      logDebug(`No configuration found for this site: ${hostname}`);
      return;
    }

    let targetSelectors = [];

    config.buttons.forEach((sel) => {
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

      const associatedEditorSelector =
        config.editors.at(index) || config.editors[0];
      logDebug(`Assigning button to editor: ${associatedEditorSelector}`);

      const chatGPTButton = document.createElement("button");
      chatGPTButton.className = "chatgpt-cleanup-button";
      chatGPTButton.setAttribute("role", "button");
      chatGPTButton.setAttribute("aria-label", "ChatGPT Cleanup");
      chatGPTButton.setAttribute("type", "button");
      chatGPTButton.dataset.editorSelector = associatedEditorSelector;
      chatGPTButton.textContent = "✏️";
      chatGPTButton.style.marginLeft = "5px";
      existingButton.parentNode.insertBefore(
        chatGPTButton,
        existingButton.nextSibling,
      );
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
        const userPromptTemplate =
          config.userPromptTemplate || "Default user prompt: {text}";
        const cleanedText = await sendToOpenAI(
          textToClean,
          systemPrompt,
          userPromptTemplate,
        );

        logDebug(`Cleaned text received: ${cleanedText}`);
        setEditorText(editor, cleanedText);
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
          Authorization: `Bearer ${defaultSettings.apiKey}`,
        },
        data: JSON.stringify({
          model: "gpt-4",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: userPromptTemplate.replace("{text}", selectedText),
            },
          ],
          temperature: 0.5,
        }),
        onload: function (response) {
          try {
            const data = JSON.parse(response.responseText);
            resolve(
              data.choices?.[0]?.message?.content ||
                "Error: Unable to clean text.",
            );
          } catch {
            reject("Error parsing OpenAI response.");
          }
        },
        onerror: function () {
          reject("Error: Unable to connect to OpenAI.");
        },
      });
    });
  }

  // Register the settings page in Tampermonkey menu
  GM_registerMenuCommand("Configure ChatGPT Settings", openSettingsPage);

  const observer = new MutationObserver(() => {
    logDebug("MutationObserver triggered, checking for buttons");
    addChatGPTButton();
    addThreadChatButton();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  logDebug("Initial button check");
  addChatGPTButton();
  addThreadChatButton();
})();
