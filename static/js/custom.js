/* DAWN's Blog - 自定义 JS */
/* 1. 语言下拉菜单：点击外部 / Esc 关闭 */
/* 2. TOC 侧边栏滚动高亮 */

(function () {
    'use strict';

    /* ============ 1. 语言下拉 ============ */
    function setupLangDropdown() {
        const dropdowns = document.querySelectorAll('.lang-dropdown');
        dropdowns.forEach(function (dd) {
            const toggle = dd.querySelector('.lang-toggle');
            if (!toggle) return;

            // 切换
            toggle.addEventListener('click', function (e) {
                e.stopPropagation();
                const isOpen = dd.classList.contains('open');
                // 关闭其他
                document.querySelectorAll('.lang-dropdown.open').forEach(function (other) {
                    if (other !== dd) other.classList.remove('open');
                });
                if (isOpen) {
                    dd.classList.remove('open');
                    toggle.setAttribute('aria-expanded', 'false');
                } else {
                    dd.classList.add('open');
                    toggle.setAttribute('aria-expanded', 'true');
                }
            });
        });

        // 点击外部关闭
        document.addEventListener('click', function () {
            document.querySelectorAll('.lang-dropdown.open').forEach(function (dd) {
                dd.classList.remove('open');
                const t = dd.querySelector('.lang-toggle');
                if (t) t.setAttribute('aria-expanded', 'false');
            });
        });

        // Esc 关闭
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                document.querySelectorAll('.lang-dropdown.open').forEach(function (dd) {
                    dd.classList.remove('open');
                    const t = dd.querySelector('.lang-toggle');
                    if (t) t.setAttribute('aria-expanded', 'false');
                });
            }
        });
    }

    /* ============ 2. TOC 侧边栏滚动高亮 ============ */
    function setupTocHighlight() {
        const tocLinks = document.querySelectorAll('.toc-link');
        if (tocLinks.length === 0) return;

        const headings = [];
        tocLinks.forEach(function (link) {
            const targetId = link.getAttribute('data-target');
            if (targetId) {
                const heading = document.getElementById(targetId);
                if (heading) {
                    headings.push({ id: targetId, element: heading, link: link });
                }
            }
        });

        if (headings.length === 0) return;

        function updateActiveLink() {
            const scrollPos = window.scrollY + 100;

            let activeIndex = 0;
            for (let i = 0; i < headings.length; i++) {
                if (headings[i].element.offsetTop <= scrollPos) {
                    activeIndex = i;
                }
            }

            tocLinks.forEach(function (link) {
                link.classList.remove('active');
            });
            headings[activeIndex].link.classList.add('active');
        }

        window.addEventListener('scroll', updateActiveLink);
        updateActiveLink();
    }

    /* ============ 启动 ============ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setupLangDropdown();
            setupTocHighlight();
        });
    } else {
        setupLangDropdown();
        setupTocHighlight();
    }
})();