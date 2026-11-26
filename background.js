/* 浏览器使用日记 · Service Worker
 * 只记录站点 origin（协议+主机），不存完整 URL、标题或路径，不联网。
 * 计时不依赖 SW 常驻：每次切换/定时都从 storage 读取 active 并落盘。
 */
(function () {
  "use strict";

  var ALARM = "usage-tick";
  var MAX_DAYS = 30;
  var DEFAULTS = { active: null, days: {} };

  // 串行化写入，避免 tabs 事件与 alarm 并发时重复累加
  var queue = Promise.resolve();
  function enqueue(job) {
    queue = queue.then(job).catch(function (e) { console.warn("[usage] job failed", e); });
    return queue;
  }

  function dayKey(ts) {
    var d = new Date(ts);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function originOf(url) {
    if (typeof url !== "string") return null;
    if (!/^https?:\/\//i.test(url)) return null;
    try { return new URL(url).origin; } catch (e) { return null; }
  }

  function prune(days, now) {
    var cutoff = dayKey(now - MAX_DAYS * 86400000);
    var out = {};
    Object.keys(days).forEach(function (k) { if (k >= cutoff) out[k] = days[k]; });
    return out;
  }

  function settle(now) {
    return enqueue(function () {
      // 用 callback 形式调用 storage：Promise 形式需要 Chrome 95+，
      // 国内浏览器内核版本参差（实测机型内核仅 Chromium 70），callback 全版本可用
      return new Promise(function (resolve) {
        chrome.storage.local.get(DEFAULTS, function (data) {
          var active = data.active;
          var days = data.days || {};
          if (!active || !active.origin) { resolve(); return; }

          var delta = Math.max(0, now - (active.startedAt || now));
          var updated = { tabId: active.tabId, origin: active.origin, startedAt: now };
          if (delta >= 1000) {
            var key = dayKey(now);
            if (!days[key]) days[key] = {};
            days[key][active.origin] = (days[key][active.origin] || 0) + delta;
          }
          chrome.storage.local.set({ active: updated, days: prune(days, now) }, function () {
            resolve();
          });
        });
      });
    });
  }

  function setActive(tabId, origin, now) {
    return enqueue(function () {
      return new Promise(function (resolve) {
        chrome.storage.local.set({
          active: { tabId: tabId, origin: origin, startedAt: now || Date.now() }
        }, function () { resolve(); });
      });
    });
  }

  function activate(tab, now) {
    if (!tab || typeof tab.id !== "number") return;
    var origin = originOf(tab.url);
    settle(now).then(function () { setActive(tab.id, origin, now); });
  }

  function ensureAlarm() {
    chrome.alarms.get(ALARM, function (alarm) {
      if (!alarm) chrome.alarms.create(ALARM, { periodInMinutes: 1 });
    });
  }

  chrome.runtime.onInstalled.addListener(function () {
    ensureAlarm();
    chrome.storage.local.set({ active: null });
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs && tabs[0]) activate(tabs[0], Date.now());
    });
  });

  // 浏览器启动时，把上次残留的 active 时间重置到现在，避免把关机时间算进停留时长
  chrome.runtime.onStartup.addListener(function () {
    ensureAlarm();
    var now = Date.now();
    chrome.storage.local.get(DEFAULTS, function (data) {
      if (data.active) setActive(data.active.tabId, data.active.origin, now);
    });
  });

  chrome.tabs.onActivated.addListener(function (info) {
    var now = Date.now();
    chrome.tabs.get(info.tabId, function (tab) {
      if (chrome.runtime.lastError) return;
      activate(tab, now);
    });
  });

  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (!changeInfo.url) return;
    chrome.storage.local.get(DEFAULTS, function (data) {
      var active = data.active;
      if (!active || active.tabId !== tabId) return;
      activate(tab, Date.now());
    });
  });

  chrome.tabs.onRemoved.addListener(function (tabId) {
    var now = Date.now();
    chrome.storage.local.get(DEFAULTS, function (data) {
      if (data.active && data.active.tabId === tabId) {
        settle(now).then(function () { setActive(-1, null, now); });
      }
    });
  });

  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === ALARM) settle(Date.now());
  });
})();
