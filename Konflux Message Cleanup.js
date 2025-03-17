// ==UserScript==
// @license      Apache2
// @name         Konflux Message Cleanup
// @namespace    https://gitlab.cee.redhat.com/
// @version      2025-02-19-2
// @description  Blast away konflux messages, even after WebSocket updates
// @author       David O Neill
// @match        *://gitlab.cee.redhat.com/*/merge_requests/*
// @icon         https://cdn.imgbin.com/3/22/25/imgbin-six-thinking-hats-red-hat-enterprise-linux-fedora-cartoon-cowboy-hat-i5r6w8BjC5Ua6Y7HxHZzFsEb9.jpg
// @grant        none
// ==/UserScript==

// Helper function to click all open confirmation modals
function clickAllModals() {
    document.querySelectorAll('div[data-testid="confirmation-modal"] button[data-testid="confirm-ok-button"]').forEach(btn => {
      btn.click();
      console.log('Clicked confirm on a modal');
    });
  }
  
  // Continuously handle modals every 300ms
  setInterval(clickAllModals, 300);
  
  // Function to delete all comments by 'konflux'
  function deleteAllKonfluxComments() {
    document.querySelectorAll('.timeline-entry:not(.note-skeleton)').forEach(comment => {
      const author = comment.querySelector('span[data-testid="author-name"]');
      if (author && author.textContent.trim() === 'konflux') {
        console.log(`Found comment by konflux: ${comment.id}`);
  
        const moreActionsButton = comment.querySelector('.more-actions-toggle button');
        if (moreActionsButton) {
          moreActionsButton.click();
          console.log('Opened more actions menu');
  
          setTimeout(() => {
            const deleteButton = comment.querySelector('.js-note-delete button');
            if (deleteButton) {
              deleteButton.click();
              console.log('Clicked delete button, modal pending...');
            }
          }, 500);
        }
      }
    });
  }
  
  // Function to detect new comments added via WebSocket updates
  function observeNewComments() {
    const targetNode = document.querySelector('.timeline'); // Main timeline container
    if (!targetNode) {
      console.error("Timeline container not found!");
      return;
    }
  
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.matches('.timeline-entry:not(.note-skeleton)')) {
            console.log("New comment detected via WebSocket!");
            deleteAllKonfluxComments();
          }
        });
      });
    });
  
    // Start observing the timeline for changes
    observer.observe(targetNode, { childList: true, subtree: true });
    console.log("Now observing for dynamically added comments...");
  }
  
  // Wait until comments fully load initially, then start watching for new ones
  function waitForCommentsThenDelete() {
    const checkInterval = setInterval(() => {
      const loadedComments = document.querySelectorAll('.timeline-entry:not(.note-skeleton)');
      const skeletonComments = document.querySelectorAll('.timeline-entry.note-skeleton');
  
      if (skeletonComments.length === 0 && loadedComments.length > 0) {
        clearInterval(checkInterval);
        console.log('All comments loaded. Starting deletion...');
        deleteAllKonfluxComments();
        observeNewComments(); // Start watching for new comments
      } else {
        console.log('Waiting for comments to fully load...');
      }
    }, 500);
  }
  
  // Initiate the process once the DOM is ready
  (function() {
    'use strict';
    window.addEventListener('load', waitForCommentsThenDelete, false);
  })();
  