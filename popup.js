/* 浏览器使用日记 · popup：只读取 storage.local，不访问网络或历史 */
(function () {
  "use strict";

  var chart = document.getElementById("chart");
  var empty = document.getElementById("empty");
  var totalEl = document.getElementById("totalTime");
  var countEl = document.getElementById("siteCount");
  var totalLabel = document.getElementById("totalLabel");
  var countLabel = document.getElementById("countLabel");
  var statusEl = document.getElementById("status");
  var clearBtn = document.getElementById("clear");
  var view = "today";
  var confirmClear = false;

  /* 是否运行在浏览器扩展环境里。为 false 时（例如直接用浏览器打开 popup.html 预览），
     用示例数据渲染，避免 chrome.storage 不存在导致脚本中断、页面停在 0。
     扩展环境下这段分支不会执行，真实数据路径与原来完全一致。 */
  var IS_EXT = typeof chrome !== "undefined" && !!(chrome.storage && chrome.storage.local);

  var DEMO_STATIONS = [
    ["https://www.mi.com", 8280000],
    ["https://vibe-coding.browser.miui.com", 6120000],
    ["https://github.com", 3360000],
    ["https://www.zhihu.com", 2040000],
    ["https://mail.qq.com", 720000]
  ];

  function demoDays() {
    var days = {};
    var base = [1, 0.9, 1, 0.72, 0.95, 0.85, 0.62];
    for (var i = 6; i >= 0; i--) {
      var bucket = {};
      DEMO_STATIONS.forEach(function (s) {
        bucket[s[0]] = Math.round(s[1] * base[i] * (i === 0 ? 1 : 0.8));
      });
      days[dayKey(Date.now() - i * 86400000)] = bucket;
    }
    return days;
  }

  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function lastDays(n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(dayKey(Date.now() - i * 86400000));
    return out;
  }

  function prettyOrigin(origin) {
    return String(origin).replace(/^https?:\/\//, "").replace(/\/$/, "");
  }

  function format(ms) {
    var sec = Math.floor(ms / 1000);
    if (sec < 60) return sec + " 秒";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + " 分钟";
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h + " 小时" + (m ? " " + m + " 分" : "");
  }

  function say(text, ok) {
    statusEl.textContent = text;
    statusEl.classList.toggle("ok", !!ok);
  }

  function bar(name, value, max) {
    var row = document.createElement("div");
    row.className = "bar-row";
    var head = document.createElement("div");
    head.className = "bar-head";
    var n = document.createElement("span");
    n.className = "bar-name";
    n.textContent = name;
    n.title = name;
    var v = document.createElement("span");
    v.className = "bar-value";
    v.textContent = format(value);
    head.appendChild(n); head.appendChild(v);
    var track = document.createElement("div");
    track.className = "bar-track";
    var fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = value > 0 ? Math.max(3, Math.round(value / max * 100)) + "%" : "0%";
    track.appendChild(fill);
    row.appendChild(head); row.appendChild(track);
    return row;
  }

  function render(days) {
    days = days || {};
    var items;
    if (view === "today") {
      var today = days[dayKey(Date.now())] || {};
      items = Object.keys(today).map(function (k) { return { name: prettyOrigin(k), value: today[k] }; });
      items.sort(function (a, b) { return b.value - a.value; });
      totalLabel.textContent = "今日总时长";
      countLabel.textContent = "访问站点";
    } else {
      items = lastDays(7).map(function (k) {
        var sum = 0;
        var day = days[k] || {};
        Object.keys(day).forEach(function (o) { sum += day[o]; });
        return { name: k.slice(5).replace("-", "/"), value: sum };
      });
      totalLabel.textContent = "近 7 天总时长";
      countLabel.textContent = "有记录天数";
    }

    var total = items.reduce(function (s, i) { return s + i.value; }, 0);
    var nonzero = items.filter(function (i) { return i.value > 0; });
    totalEl.textContent = format(total);
    countEl.textContent = String(nonzero.length);

    chart.textContent = "";
    if (!nonzero.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    // 今日视图只列有记录的站点；近 7 天视图固定 7 天（0 值画空条），保留「趋势」语义
    var shown = view === "week" ? items : nonzero;
    var max = shown.reduce(function (m, i) { return i.value > m ? i.value : m; }, 0) || 1;
    shown.slice(0, 8).forEach(function (i) { chart.appendChild(bar(i.name, i.value, max)); });
  }

  function readAndRender() {
    chrome.storage.local.get({ days: {} }, function (data) {
      if (chrome.runtime.lastError) {
        say("读取失败：" + chrome.runtime.lastError.message, false);
        return;
      }
      render(data.days);
    });
  }

  function load() {
    if (!IS_EXT) {
      say("预览模式 · 当前不在浏览器扩展中运行，以下为示例数据。", true);
      render(demoDays());
      return;
    }
    readAndRender();
  }

  /* 首次进入：先让后台把「当前这段尚未结算的停留」落盘再读取。
     结算周期是 1 分钟，不做这一步的话刚浏览几十秒打开弹窗会看到 0，误以为没数据。 */
  function bootstrap() {
    if (!IS_EXT) {
      load();
      return;
    }
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      readAndRender();
    }
    try {
      chrome.runtime.sendMessage({ type: "settle-now" }, function () {
        void chrome.runtime.lastError;
        finish();
      });
    } catch (e) {
      finish();
    }
    window.setTimeout(finish, 800); // 后台无响应时的兜底
  }

  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      view = btn.dataset.view;
      document.querySelectorAll(".tab").forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      load();
    });
  });

  clearBtn.addEventListener("click", function () {
    if (!IS_EXT) {
      say("预览模式下没有真实数据可清空。", false);
      return;
    }
    if (!confirmClear) {
      confirmClear = true;
      clearBtn.textContent = "再点一次确认清空";
      clearBtn.classList.add("confirm");
      window.setTimeout(function () {
        confirmClear = false;
        clearBtn.textContent = "清空今日数据";
        clearBtn.classList.remove("confirm");
      }, 4000);
      return;
    }
    var key = dayKey(Date.now());
    chrome.storage.local.get({ days: {} }, function (data) {
      var days = data.days || {};
      days[key] = {};
      chrome.storage.local.set({ days: days }, function () {
        confirmClear = false;
        clearBtn.textContent = "清空今日数据";
        clearBtn.classList.remove("confirm");
        say("今日数据已清空。", true);
        load();
      });
    });
  });

  if (IS_EXT) chrome.storage.onChanged.addListener(function () { load(); });
  bootstrap();
})();
