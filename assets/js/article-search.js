(function() {
  const searchBox = document.getElementById("article-search-box");
  const searchInput = document.getElementById("article-search-input");
  const searchCount = document.getElementById("search-count");
  const searchPrev = document.getElementById("search-prev");
  const searchNext = document.getElementById("search-next");
  const searchClose = document.getElementById("search-close");
  const articleContent = document.querySelector(".post-content") || document.querySelector("article") || document.querySelector(".entry-content");
  
  if (!articleContent) return;
  
  let matches = [];
  let currentMatch = -1;
  let originalContent = "";
  
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
    if (originalContent) {
      articleContent.innerHTML = originalContent;
    }
  }
  
  function highlightMatches(keyword) {
    clearHighlights();
    matches = [];
    currentMatch = -1;
    
    if (!keyword.trim()) {
      searchCount.textContent = "";
      return;
    }
    
    const escapedKeyword = keyword.replace(/[.*+?${}()|[\]\\]/g, "\\$&&");
    const regex = new RegExp("(" + escapedKeyword + ")", "gi");
    
    function highlightNode(node) {
      if (node.nodeType === 3) {
        const text = node.textContent;
        if (regex.test(text)) {
          const span = document.createElement("span");
          span.innerHTML = text.replace(regex, "<span class=\"search-highlight\"></span>");
          node.parentNode.replaceChild(span, node);
        }
      } else if (node.nodeType === 1 && node.tagName !== "SCRIPT" && node.tagName !== "STYLE") {
        Array.from(node.childNodes).forEach(highlightNode);
      }
    }
    
    highlightNode(articleContent);
    
    matches = articleContent.querySelectorAll(".search-highlight");
    searchCount.textContent = matches.length > 0 ? "0/" + matches.length : "未找到";
    
    if (matches.length > 0) {
      currentMatch = 0;
      setActiveMatch();
    }
  }
  
  function setActiveMatch() {
    matches.forEach(function(m) { m.classList.remove("search-highlight-active"); });
    if (currentMatch >= 0 && currentMatch < matches.length) {
      matches[currentMatch].classList.add("search-highlight-active");
      matches[currentMatch].scrollIntoView({ behavior: "smooth", block: "center" });
      searchCount.textContent = (currentMatch + 1) + "/" + matches.length;
    }
  }
  
  function nextMatch() {
    if (matches.length === 0) return;
    currentMatch = (currentMatch + 1) % matches.length;
    setActiveMatch();
  }
  
  function prevMatch() {
    if (matches.length === 0) return;
    currentMatch = (currentMatch - 1 + matches.length) % matches.length;
    setActiveMatch();
  }
  
  // Keyboard shortcuts
  document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      if (searchBox.style.display === "none") {
        e.preventDefault();
        showSearchBox();
      }
    }
    if (e.key === "Escape") {
      hideSearchBox();
    }
    if (searchBox.style.display !== "none") {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) prevMatch(); else nextMatch();
      }
    }
  });
  
  searchInput.addEventListener("input", function() {
    highlightMatches(this.value);
  });
  
  searchPrev.addEventListener("click", prevMatch);
  searchNext.addEventListener("click", nextMatch);
  searchClose.addEventListener("click", hideSearchBox);
  
  // Add search button to article header
  const articleHeader = document.querySelector(".post-header") || document.querySelector(".entry-header") || document.querySelector("header.page-header");
  if (articleHeader) {
    const searchBtn = document.createElement("button");
    searchBtn.innerHTML = "🔍 搜索";
    searchBtn.style.cssText = "position:absolute; top:10px; right:10px; padding:8px 16px; background:var(--primary); color:var(--theme); border:none; border-radius:6px; cursor:pointer; font-size:14px; z-index:10;";
    searchBtn.addEventListener("click", showSearchBox);
    articleHeader.style.position = "relative";
    articleHeader.appendChild(searchBtn);
  }
})();
