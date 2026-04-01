const runtime = globalThis.browser?.runtime ?? chrome.runtime

runtime.onInstalled.addListener(() => {
  console.log("Dental Patient Log Extension instalada.")
})
