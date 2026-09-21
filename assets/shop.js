// War & Pizza — progressive enhancement: swaps placeholder art for real
// eBay listing photos/prices once the ebay-search function is configured.
// If the function isn't set up yet (or a request fails), tiles just keep
// showing their placeholder art -- nothing breaks.
//
// EBAY_API_BASE: leave blank ("") when this page and the function live on
// the same domain (e.g. the Netlify deploy). If the frontend lives
// somewhere else (like a WordPress site) while the function stays on
// Netlify, set this to that Netlify site's URL, e.g.:
//   window.EBAY_API_BASE = "https://your-site-name.netlify.app";
// ...in a <script> tag placed BEFORE this one.
(function () {
  "use strict";
  var API_BASE = window.EBAY_API_BASE || "";

  function fmtPrice(raw) {
    if (!raw) return null;
    var parts = raw.split(" ");
    var value = parseFloat(parts[0]);
    var currency = parts[1] || "USD";
    if (isNaN(value)) return null;
    var symbol = currency === "USD" ? "$" : currency + " ";
    return symbol + value.toFixed(value % 1 === 0 ? 0 : 2);
  }

  function enhanceTile(tile) {
    var q = tile.getAttribute("data-q");
    if (!q) return;

    fetch(API_BASE + "/.netlify/functions/ebay-search?q=" + encodeURIComponent(q) + "&limit=1")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.items || !data.items.length) return;
        var item = data.items[0];

        var art = tile.querySelector(".art");
        if (art && item.image) {
          art.innerHTML = "";
          art.style.background = "#141110";
          var img = document.createElement("img");
          img.src = item.image;
          img.alt = item.title || "";
          img.loading = "lazy";
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "cover";
          img.style.display = "block";
          art.appendChild(img);
        }

        var tag = tile.querySelector(".tag");
        var price = fmtPrice(item.price);
        if (tag && price) {
          tag.textContent = price;
        }

        var h3 = tile.querySelector(".tile-body h3");
        if (h3 && item.title) {
          h3.textContent = item.title;
        }

        var link = tile.querySelector(".shop-link");
        if (link && item.url) {
          link.href = item.url;
        }
      })
      .catch(function () {
        // Silent fallback -- placeholder art stays as-is.
      });
  }

  function init() {
    var tiles = document.querySelectorAll(".tile[data-q]");
    tiles.forEach(enhanceTile);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
