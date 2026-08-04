(function() {
  var searchBox = document.getElementById("article-search-box");
  var searchInput = document.getElementById("article-search-input");
  var searchCount = document.getElementById("search-count");
  var searchPrev = document.getElementById("search-prev");
  var searchNext = document.getElementById("search-next");
  var searchClose = document.getElementById("search-close");
  var articleContent = document.querySelector(".post-content") || document.querySelector("article") || document.querySelector(".entry-content");
  
  if (!searchBox || !articleContent) return;
  
  var matches = [];
  var currentMatch = -1;
  var originalContent = "";
  var isDragging = false;
  var dragStartX, dragStartY, boxStartX, boxStartY;
  var dragHandle = searchBox.querySelector("div:first-child");
  
  if (dragHandle) {
    dragHandle.style.cursor = "move";
    dragHandle.style.userSelect = "none";
    
    dragHandle.addEventListener("mousedown", function(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      var rect = searchBox.getBoundingClientRect();
      boxStartX = rect.left;
      boxStartY = rect.top;
      searchBox.style.transition = "none";
      e.preventDefault();
    });
    
    dragHandle.addEventListener("touchstart", function(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
      var touch = e.touches[0];
      isDragging = true;
      dragStartX = touch.clientX;
      dragStartY = touch.clientY;
      var rect = searchBox.getBoundingClientRect();
      boxStartX = rect.left;
      boxStartY = rect.top;
      searchBox.style.transition = "none";
      e.preventDefault();
    });
  }
  
  document.addEventListener("mousemove", function(e) {
    if (!isDragging) return;
    var newX = boxStartX + (e.clientX - dragStartX);
    var newY = boxStartY + (e.clientY - dragStartY);
    var maxX = window.innerWidth - searchBox.offsetWidth;
    var maxY = window.innerHeight - searchBox.offsetHeight;
    searchBox.style.left = Math.max(0, Math.min(newX, maxX)) + "px";
    searchBox.style.top = Math.max(0, Math.min(newY, maxY)) + "px";
    searchBox.style.right = "auto";
  });
  
  document.addEventListener("touchmove", function(e) {
    if (!isDragging) return;
    var touch = e.touches[0];
    var newX = boxStartX + (touch.clientX - dragStartX);
    var newY = boxStartY + (touch.clientY - dragStartY);
    var maxX = window.innerWidth - searchBox.offsetWidth;
    var maxY = window.innerHeight - searchBox.offsetHeight;
    searchBox.style.left = Math.max(0, Math.min(newX, maxX)) + "px";
    searchBox.style.top = Math.max(0, Math.min(newY, maxY)) + "px";
    searchBox.style.right = "auto";
  });
  
  document.addEventListener("mouseup", function() { isDragging = false; });
  document.addEventListener("touchend", function() { isDragging = false; });
  
  function showSearchBox() {
    searchBox.style.display = "block";
    searchInput.focus();
    if (!originalContent) originalContent = articleContent.innerHTML;
  }
  
  function hideSearchBox() {
    searchBox.style.display = "none";
    clearHighlights();
    searchInput.value = "";
    searchCount.textContent = "";
    matches = [];
    currentMatch = -1;
  }
  
  function clearHighlights() {
    if (originalContent) articleContent.innerHTML = originalContent;
  }
  
  function highlightMatches(keyword) {
    clearHighlights();
    matches = [];
    currentMatch = -1;
    if (!keyword.trim()) { searchCount.textContent = ""; return; }
    
    var regex = new RegExp("(" + keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    
    function walk(node) {
      if (node.nodeType === 3) {
        if (regex.test(node.textContent)) {
          var span = document.createElement("span");
          span.innerHTML = node.textContent.replace(regex, '<mark class="search-highlight">$1</mark>');
          node.parentNode.replaceChild(span, node);
        }
      } else if (node.nodeType === 1 && node.tagName !== "SCRIPT" && node.tagName !== "STYLE") {
        for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      }
    }
    walk(articleContent);
    
    matches = articleContent.querySelectorAll(".search-highlight");
    if (matches.length > 0) {
      currentMatch = 0;
      matches[0].classList.add("search-highlight-active");
      matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
      searchCount.textContent = "1/" + matches.length;
    } else {
      searchCount.textContent = "未找到";
    }
  }
  
  function setActive() {
    for (var i = 0; i < matches.length; i++) matches[i].classList.remove("search-highlight-active");
    if (currentMatch >= 0 && currentMatch < matches.length) {
      matches[currentMatch].classList.add("search-highlight-active");
      matches[currentMatch].scrollIntoView({ behavior: "smooth", block: "center" });
      searchCount.textContent = (currentMatch + 1) + "/" + matches.length;
    }
  }
  
  searchNext.addEventListener("click", function() { if (matches.length) { currentMatch = (currentMatch + 1) % matches.length; setActive(); } });
  searchPrev.addEventListener("click", function() { if (matches.length) { currentMatch = (currentMatch - 1 + matches.length) % matches.length; setActive(); } });
  searchClose.addEventListener("click", hideSearchBox);
  searchInput.addEventListener("input", function() { highlightMatches(this.value); });
  
  document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "f" && searchBox.style.display === "none") { e.preventDefault(); showSearchBox(); }
    if (e.key === "Escape") hideSearchBox();
    if (searchBox.style.display !== "none" && e.key === "Enter") { e.preventDefault(); if (e.shiftKey) { if (matches.length) { currentMatch = (currentMatch - 1 + matches.length) % matches.length; setActive(); } } else { if (matches.length) { currentMatch = (currentMatch + 1) % matches.length; setActive(); } } }
  });
  
  var header = document.querySelector(".post-header");
  if (header) {
    var btn = document.createElement("button");
    btn.textContent = "🔍 搜索";
    btn.style.cssText = "position:absolute;top:10px;right:10px;padding:8px 16px;background:var(--primary);color:var(--theme);border:none;border-radius:6px;cursor:pointer;font-size:14px;z-index:10;";
    btn.addEventListener("click", showSearchBox);
    header.style.position = "relative";
    header.appendChild(btn);
  }
})();
