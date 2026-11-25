/*
  PALE HORSE COLLECTIVE — site script
  Builds the header, footer and every product listing from products.json.
  You should never need to edit this file to add a product.
*/
(function () {
  "use strict";

  var LIVE = /palehorsecollective\.org$/.test(location.hostname);
  var FORM_URL = "https://docs.google.com/forms/u/0/d/e/1FAIpQLScbL0a4nv4ue-dwSqw80OGy2jozCfvxrfasKMJL2U6TApn6ag/formResponse";
  var FORM_FIELD = "entry.565332746";
  var TIKTOK = "https://www.tiktok.com/@palehorsecollective";

  // ---------- helpers ----------

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function catSlug(c) { return String(c).toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
  function productUrl(p) { return LIVE ? "/products/" + p.slug : "product.html#" + p.slug; }
  function money(n) { return "$" + Number(n).toFixed(0) + " AUD"; }
  function isGraphic(src) { return /\.svg($|\?)/i.test(src); }
  function visible(list) { return list.filter(function (p) { return p.status !== "hidden"; }); }
  function categories(list) {
    var seen = [];
    list.forEach(function (p) { if (seen.indexOf(p.category) < 0) seen.push(p.category); });
    return seen;
  }

  var TEE = '<svg viewBox="0 0 200 200" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" d="M70 30 L40 42 L14 78 L40 92 L52 76 L52 176 L148 176 L148 76 L160 92 L186 78 L160 42 L130 30 C124 44 112 50 100 50 C88 50 76 44 70 30 Z"/></svg>';

  // Swap any image that fails to load for a clean placeholder, so a
  // missing photo never leaves a broken-image icon on the page.
  function placeholder(img) {
    if (img.classList.contains("hero-img")) { img.remove(); return; }
    var box = img.parentElement;
    if (!box || box.querySelector(".ph")) { img.remove(); return; }
    var label = img.getAttribute("data-label") || "Photo coming soon";
    img.remove();
    var ph = document.createElement("div");
    ph.className = "ph";
    ph.innerHTML = TEE + "<span>" + esc(label) + "</span>";
    box.appendChild(ph);
  }
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t.tagName === "IMG" && t.hasAttribute("data-fallback")) placeholder(t);
  }, true);

  function imgTag(src, alt, cls, label, extra) {
    var c = (cls || "") + (isGraphic(src) ? " contain" : "");
    return '<img src="' + esc(src) + '" alt="' + esc(alt) + '" class="' + c.trim() + '" loading="lazy" decoding="async" data-fallback data-label="' + esc(label || "") + '"' + (extra || "") + ">";
  }

  function loadProducts() {
    return fetch("products.json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("products.json " + r.status);
      return r.json();
    });
  }

  // ---------- header + footer ----------

  function renderChrome(data) {
    var page = document.body.getAttribute("data-page") || "";
    var list = visible(data.products);
    var cats = categories(list);

    var links = [{ href: "shop.html", label: "Shop all", key: "shop" }]
      .concat(cats.map(function (c) { return { href: "shop.html#" + catSlug(c), label: c, key: "cat-" + catSlug(c) }; }))
      .concat([{ href: "about.html", label: "About", key: "about" }]);

    function navItems() {
      return links.map(function (l) {
        var cur = l.key === page ? ' aria-current="page"' : "";
        return '<li><a href="' + l.href + '"' + cur + ">" + esc(l.label) + "</a></li>";
      }).join("");
    }

    var header = document.getElementById("site-header");
    if (header) {
            header.innerHTML =
        (data.site.announcement ? '<div class="announce">' + esc(data.site.announcement) + "</div>" : "") +
        '<header class="site-header"><div class="wrap header-inner">' +
          '<a class="logo" href="index.html"><img src="/horse-mark.svg" alt="" data-fallback-hide>Pale Horse Collective</a>' +
          '<nav aria-label="Main"><ul class="nav">' + navItems() + "</ul></nav>" +
          '<button class="menu-btn" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>' +
          "</button>" +
        "</div></header>" +
        '<div class="mobile-nav" id="mobile-nav" role="dialog" aria-modal="true" aria-label="Menu">' +
          '<div class="mobile-nav-top"><a class="logo" href="index.html">Pale Horse Collective</a>' +
          '<button class="menu-btn" type="button" data-close aria-label="Close menu" style="display:inline-flex">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>' +
          "</button></div>" +
          "<ul>" + navItems() + "</ul>" +
          '<p class="mobile-nav-foot">' + esc(data.site.announcement || "") + "</p>" +
        "</div>";
      wireMenu(header);
      var logoImg = header.querySelector("[data-fallback-hide]");
      if (logoImg) logoImg.addEventListener("error", function () { logoImg.remove(); });
    }

    var footer = document.getElementById("site-footer");
    if (footer) {
      var email = data.site.contactEmail;
      footer.className = "site-footer";
      footer.innerHTML =
        '<div class="wrap footer-grid">' +
          '<div class="footer-brand"><a class="logo" href="index.html">Pale Horse Collective</a>' +
          "<p>Graphic clothing drawn from the symbols hiding in plain sight. Printed to order.</p></div>" +
          '<div class="footer-col"><h2>Shop</h2><ul>' +
            '<li><a href="shop.html">Shop all</a></li>' +
            cats.map(function (c) { return '<li><a href="shop.html#' + catSlug(c) + '">' + esc(c) + "</a></li>"; }).join("") +
          "</ul></div>" +
          '<div class="footer-col"><h2>Help</h2><ul>' +
            '<li><a href="about.html#shipping">Shipping and returns</a></li>' +
            '<li><a href="mailto:' + esc(email) + '">' + esc(email) + "</a></li>" +
          "</ul></div>" +
          '<div class="footer-col"><h2>More</h2><ul>' +
            '<li><a href="about.html">About</a></li>' +
            '<li><a href="/archive.html">Stories behind the designs</a></li>' +
            '<li><a href="' + TIKTOK + '" rel="noopener">TikTok</a></li>' +
          "</ul></div>" +
        "</div>" +
        '<div class="wrap footer-base"><span>&copy; ' + new Date().getFullYear() + " Pale Horse Collective</span><span>Prices in Australian dollars</span></div>";
    }
  }

  function wireMenu(root) {
    var openBtn = root.querySelector(".header-inner .menu-btn");
    var panel = root.querySelector("#mobile-nav");
    var closeBtn = panel.querySelector("[data-close]");
    var main = document.querySelector("main");

    function open() {
      panel.classList.add("open");
      openBtn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      if (main) main.inert = true;
      var first = panel.querySelector("ul a");
      if (first) first.focus();
    }
    function close() {
      panel.classList.remove("open");
      openBtn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      if (main) main.inert = false;
      openBtn.focus();
    }
    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    panel.addEventListener("click", function (e) { if (e.target.closest("ul a")) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("open")) close();
    });
  }

  // ---------- product card ----------

  function card(p) {
    var first = p.images[0] || { src: "", alt: p.name };
    var second = p.images[1];
    var badge = p.status === "sold-out" ? '<span class="badge muted">Sold out</span>'
      : p.status === "coming-soon" ? '<span class="badge muted">Coming soon</span>'
      : p.isNew ? '<span class="badge">New</span>' : "";
    return '<li class="card"><a href="' + productUrl(p) + '">' +
      '<div class="card-media">' + badge +
        imgTag(first.src, first.alt, "main-img" + (second ? " has-alt" : ""), p.code) +
        (second ? imgTag(second.src, "", "alt-img", p.code, ' aria-hidden="true"') : "") +
      "</div>" +
      '<div class="card-info"><span class="card-name">' + esc(p.name) + "</span>" +
      '<span class="card-meta"><span>' + esc(p.colour) + '</span><span class="card-price">' + money(p.price) + "</span></span></div>" +
    "</a></li>";
  }

  function sortForDisplay(list) {
    return list.slice().sort(function (a, b) { return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0); });
  }

  // ---------- email signup ----------

  function wireSignup() {
    var form = document.querySelector("[data-signup]");
    if (!form) return;
    var input = form.querySelector("input[type=email]");
    var note = form.querySelector(".form-note");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!input.value || !input.checkValidity()) {
        note.textContent = "Enter a valid email address, like name@example.com.";
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      input.removeAttribute("aria-invalid");
      var body = FORM_FIELD + "=" + encodeURIComponent(input.value);
      fetch(FORM_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body })
        .catch(function () {});
      input.value = "";
      note.textContent = "You're on the list. We'll email you when something new goes up.";
    });
  }

  // ---------- pages ----------

  function homePage(data) {
    var list = sortForDisplay(visible(data.products));
    var s = data.site;

    var hero = document.getElementById("hero");
    if (hero) {
      hero.innerHTML =
        '<img class="hero-img" src="' + esc(s.heroImage) + '" alt="' + esc(s.heroAlt) + '" data-fallback data-label="">' +
        '<div class="hero-copy wrap"><h1 class="wordmark">Pale<br>Horse</h1>' +
        '<div class="hero-row"><p class="hero-line">' + esc(s.heroLine) + "</p>" +
        '<a class="btn" href="shop.html">' + esc(s.heroButton) + "</a></div></div>";
    }

    var grid = document.getElementById("new-grid");
    if (grid) grid.innerHTML = list.slice(0, 8).map(card).join("");

    var tiles = document.getElementById("tiles");
    if (tiles) {
      var cats = categories(list);
      var tileHtml = cats.map(function (c) {
        var lead = list.filter(function (p) { return p.category === c; })[0];
        var img = lead && lead.images[0];
        return '<a class="tile" href="shop.html#' + catSlug(c) + '">' +
          (img ? imgTag(img.src, "", "", "", ' aria-hidden="true"') : "") +
          '<span class="tile-label">' + esc(c) + "<small>Shop " + esc(c.toLowerCase()) + "</small></span></a>";
      }).join("");
      tiles.innerHTML = tileHtml;
      // One category isn't worth a whole section. It shows once there are two.
      var section = document.getElementById("tiles-section");
      if (section && cats.length < 2) section.hidden = true;
    }
  }

  function shopPage(data) {
    var list = sortForDisplay(visible(data.products));
    var cats = categories(list);
    var filters = document.getElementById("filters");
    var grid = document.getElementById("shop-grid");
    var count = document.getElementById("shop-count");
    var title = document.getElementById("shop-title");

    filters.innerHTML = ['all'].concat(cats).map(function (c) {
      var key = c === "all" ? "all" : catSlug(c);
      return '<button type="button" class="chip" data-cat="' + key + '" aria-pressed="false">' + (c === "all" ? "All" : esc(c)) + "</button>";
    }).join("");

    function show(key) {
      var match = cats.filter(function (c) { return catSlug(c) === key; })[0];
      if (!match) key = "all";
      var items = key === "all" ? list : list.filter(function (p) { return catSlug(p.category) === key; });
      grid.innerHTML = items.length ? items.map(card).join("") : "";
      count.textContent = items.length + (items.length === 1 ? " product" : " products");
      title.textContent = key === "all" ? "Shop all" : match;
      document.title = (key === "all" ? "Shop all" : match) + " | Pale Horse Collective";
      filters.querySelectorAll(".chip").forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-cat") === key ? "true" : "false");
      });
      document.querySelectorAll(".nav a").forEach(function (a) {
        var h = a.getAttribute("href");
        var on = (key === "all" && h === "shop.html") || h === "shop.html#" + key;
        if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
    }

    filters.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      var key = b.getAttribute("data-cat");
      history.replaceState(null, "", key === "all" ? location.pathname : "#" + key);
      show(key);
    });
    window.addEventListener("hashchange", function () { show(location.hash.slice(1) || "all"); });
    show(location.hash.slice(1) || "all");
  }

  function productSlug() {
    var m = location.pathname.match(/\/products\/([^\/?#]+)/);
    if (m) return decodeURIComponent(m[1]);
    var q = new URLSearchParams(location.search).get("p");
    if (q) return q;
    return location.hash.slice(1);
  }

  function productPage(data) {
    var all = visible(data.products);
    var slug = productSlug();
    var p = all.filter(function (x) { return x.slug === slug; })[0];
    var root = document.getElementById("product");

    if (!p) {
      root.innerHTML = '<div class="page-head"><h1 class="h1">Product not found</h1>' +
        '<p>This one may have been taken down. <a class="text-link" href="shop.html">See everything in the shop</a>.</p></div>';
      return;
    }

    document.title = p.name + " | Pale Horse Collective";
    var meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", p.name + ". " + p.blurb);

    var buyable = p.status === "live";
    var btnLabel = p.status === "sold-out" ? "Sold out" : p.status === "coming-soon" ? "Coming soon" : "Buy now";
    var n = p.images.length;

    root.innerHTML =
      '<nav class="crumbs" aria-label="Breadcrumb"><ol>' +
        '<li><a href="shop.html">Shop</a></li>' +
        '<li><a href="shop.html#' + catSlug(p.category) + '">' + esc(p.category) + "</a></li>" +
        '<li aria-current="page">' + esc(p.name) + "</li>" +
      "</ol></nav>" +
      '<div class="pdp">' +
        "<div>" +
          '<div class="gallery" tabindex="0" aria-label="Product photos, scroll sideways for more">' +
            p.images.map(function (im, i) {
              return "<figure>" + imgTag(im.src, im.alt, "", p.code + (n > 1 ? " · " + (i + 1) + " of " + n : ""), i === 0 ? ' loading="eager" fetchpriority="high"' : "") + "</figure>";
            }).join("") +
          "</div>" +
          (n > 1 ? '<p class="gallery-count">Swipe for ' + (n - 1) + " more photo" + (n > 2 ? "s" : "") + "</p>" : "") +
        "</div>" +
        '<div class="buy">' +
          '<h1 class="h1">' + esc(p.name) + "</h1>" +
          '<span class="code">' + esc(p.code) + " · " + esc(p.colour) + "</span>" +
          '<p class="price">' + money(p.price) + "<small>Free shipping</small></p>" +
          '<p class="buy-blurb">' + esc(p.blurb) + "</p>" +
          '<form id="buy-form" novalidate>' +
            '<fieldset class="sizes"><legend>Size <span id="size-chosen"></span></legend><div class="size-row">' +
              p.sizes.map(function (s, i) {
                var id = "size-" + i;
                return '<input type="radio" name="size" id="' + id + '" value="' + esc(s) + '"' + (buyable ? "" : " disabled") + '><label for="' + id + '">' + esc(s) + "</label>";
              }).join("") +
            "</div></fieldset>" +
            '<button class="btn btn-block" type="submit"' + (buyable ? "" : ' disabled aria-disabled="true"') + ">" + btnLabel + "</button>" +
            '<p class="buy-msg" id="buy-msg" role="status" aria-live="polite"></p>' +
          "</form>" +
          '<p class="buy-note">Printed to order. Ships in 10 to 14 days. Secure checkout with Stripe.</p>' +
          '<div class="accordion">' +
            '<details open><summary>Details and fit</summary><div class="acc-body"><ul>' +
              p.details.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") +
            "</ul></div></details>" +
            '<details><summary>Behind the design</summary><div class="acc-body"><p>' + esc(p.story) + "</p>" +
              (p.storyLink ? '<p><a class="text-link" href="' + esc(p.storyLink) + '">Read the full story</a></p>' : "") +
            "</div></details>" +
            '<details><summary>Shipping and returns</summary><div class="acc-body"><p>' + esc(data.site.shipping) + "</p><p>" + esc(data.site.returns) + "</p></div></details>" +
          "</div>" +
        "</div>" +
      "</div>";

    // highlight current category in the nav
    document.querySelectorAll(".nav a").forEach(function (a) {
      if (a.getAttribute("href") === "shop.html#" + catSlug(p.category)) a.setAttribute("aria-current", "page");
    });

    var others = all.filter(function (x) { return x.slug !== p.slug; });
    var more = document.getElementById("more-section");
    if (others.length && more) {
      document.getElementById("more-grid").innerHTML = sortForDisplay(others).slice(0, 4).map(card).join("");
      more.hidden = false;
    }

    wireBuy(p);
  }

  function wireBuy(p) {
    var form = document.getElementById("buy-form");
    var msg = document.getElementById("buy-msg");
    var chosen = document.getElementById("size-chosen");
    var btn = form.querySelector("button[type=submit]");

    form.addEventListener("change", function () {
      var s = form.querySelector("input[name=size]:checked");
      chosen.textContent = s ? s.value : "";
      msg.textContent = ""; msg.classList.remove("error");
    });

    if (new URLSearchParams(location.search).get("order") === "confirmed") {
      msg.textContent = "Order confirmed. Your receipt is on its way to your inbox.";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var s = form.querySelector("input[name=size]:checked");
      if (!s) {
        msg.textContent = "Pick a size first.";
        msg.classList.add("error");
        var firstSize = form.querySelector("input[name=size]");
        if (firstSize) firstSize.focus();
        return;
      }
      var label = btn.textContent;
      btn.textContent = "Opening checkout";
      btn.disabled = true;
      fetch("/.netlify/functions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: p.checkoutId, size: s.value })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.url) throw new Error("no url");
          window.location.href = d.url;
        })
        .catch(function () {
          btn.textContent = label;
          btn.disabled = false;
          msg.textContent = "Checkout didn't open. Try again, or email us and we'll sort it out.";
          msg.classList.add("error");
        });
    });
  }

  // ---------- boot ----------

  var page = document.body.getAttribute("data-page") || "";
  loadProducts().then(function (data) {
    renderChrome(data);
    if (page === "home") homePage(data);
    if (page === "shop") shopPage(data);
    if (page === "product") productPage(data);
    wireSignup();
  }).catch(function () {
    var m = document.querySelector("main");
    if (m) m.insertAdjacentHTML("afterbegin", '<p class="wrap empty">The shop didn\'t load. Refresh the page to try again.</p>');
  });
})();
