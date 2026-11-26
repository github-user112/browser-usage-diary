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

  // 浏览器启动时不能沿用上次的 active：tabId 跨会话会变，origin 也可能是关机前的旧页面。
  // 整体重置并重新锚定当前活动标签：既不算入关机时间，也不会把启动后的时长记到旧站点头上。
  chrome.runtime.onStartup.addListener(function () {
    ensureAlarm();
    var now = Date.now();
    chrome.storage.local.set({ active: null }, function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0]) activate(tabs[0], now);
      });
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
    // 只要正在更新的就是当前活动标签就重新锚定，不要求 active.tabId 必须相等：
    // active 可能为空（安装时没有 http 标签）或残留旧会话的 tabId（跨重启失效），
    // 否则导航永远不会触发结算，数据就停更了。
    if (tab && tab.active) { activate(tab, Date.now()); return; }
    chrome.storage.local.get(DEFAULTS, function (data) {
      var active = data.active;
      if (active && active.tabId === tabId) activate(tab, Date.now());
    });
  });

  chrome.tabs.onRemoved.addListener(function (tabId) {
    chrome.storage.local.get(DEFAULTS, function (data) {
      if (!data.active || data.active.tabId !== tabId) return;
      // 关闭标签时浏览器会把焦点切到另一个标签，并且 onActivated 可能先于本回调落地。
      // 因此结算后必须重新问一次当前激活标签，不能盲写 -1/null，
      // 否则会把 onActivated 设置好的状态覆盖成「无活动页」，导致此后完全不计时。
      settle(Date.now()).then(function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          void chrome.runtime.lastError;
          var t = tabs && tabs[0];
          var id = t && typeof t.id === "number" ? t.id : -1;
          setActive(id, id === -1 ? null : originOf(t.url), Date.now());
        });
      });
    });
  });

  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name !== ALARM) return;
    var now = Date.now();
    settle(now).then(function () {
      // 结算后用 tabs.query 的实时结果校准 active：即使标签事件全部丢失，
      // 最迟一个 alarm 周期也能把时长记到真正活动的站点上（skill §2：不能只依赖事件与内存状态）
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (chrome.runtime.lastError || !tabs || !tabs[0]) return;
        var tab = tabs[0];
        if (typeof tab.id !== "number") return;
        var origin = originOf(tab.url);
        chrome.storage.local.get(DEFAULTS, function (data) {
          var a = data.active;
          if (!a || a.tabId !== tab.id || a.origin !== origin) {
            setActive(tab.id, origin, now);
          }
        });
      });
    });
  });

  // popup 打开时请求立即结算一次：alarm 周期是 1 分钟，
  // 不做这一步的话用户刚浏览的几十秒看不到，会误以为没有统计数据。
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== "settle-now") return;
    settle(Date.now()).then(function () {
      chrome.storage.local.get(DEFAULTS, function (data) {
        sendResponse({ ok: true, days: data.days || {} });
      });
    });
    return true; // 异步响应
  });
})();
