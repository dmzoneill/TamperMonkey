// ==UserScript==
// @name         Trading View Delete GoPro Dialog
// @namespace    http://fio.ie/
// @version      0.1
// @description  Delete the trading view overlay for gopro
// @author       dmzoneill
// @match        https://www.tradingview.com/chart/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tradingview.com
// @grant        none
// ==/UserScript==

function waitForElement(selector) {
	return new Promise(function(resolve, reject) {
		var element = document.querySelector(selector);

		if(element) {
			resolve(element);
			return;
		}

		var observer = new MutationObserver(function(mutations) {
			mutations.forEach(function(mutation) {
				var nodes = Array.from(mutation.addedNodes);
				for(var node of nodes) {
					if(node.matches && node.matches(selector)) {
						observer.disconnect();
						resolve(node);
						return;
					}
				};
			});
		});

		observer.observe(document.documentElement, { childList: true, subtree: true });
	});
}

(function() {
    'use strict';

    waitForElement("#overlap-manager-root").then(function(element) {
        element.parentNode.removeChild(element)
    });
})();
