/* DAWN's Blog - 自定义 JS */
/* 1. 语言下拉菜单：点击外部 / Esc 关闭 */
/* 2. 搜索按钮：点击/⌘K 跳转到 /search/ 页面 */

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

    /* ============ 2. 搜索按钮：跳转 + ⌘K 快捷键 ============ */
    function setupSearch() {
        // 获取当前语言的搜索 URL（zh 用 /search/，其他用 /xx/search/）
        function getSearchUrl() {
            const lang = (document.documentElement.lang || 'zh').toLowerCase();
            if (lang === 'zh' || lang === 'zh-cn') return '/search/';
            const base = lang.split('-')[0];
            if (['en', 'ko', 'ja'].indexOf(base) >= 0) return '/' + base + '/search/';
            return '/search/';
        }

        const searchButtons = document.querySelectorAll('.search-toggle');
        searchButtons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                window.location.href = getSearchUrl();
            });
        });

        // 全局快捷键：⌘K (Mac) / Ctrl+K (Win/Linux)
        document.addEventListener('keydown', function (e) {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const cmdK = isMac ? e.metaKey && e.key === 'k' : e.ctrlKey && e.key === 'k';
            if (cmdK) {
                e.preventDefault();
                window.location.href = getSearchUrl();
            }
            // Alt + / 也是 PaperMod 默认的搜索快捷键
            if (e.altKey && e.key === '/') {
                e.preventDefault();
                window.location.href = getSearchUrl();
            }
        });
    }

    /* ============ 启动 ============ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setupLangDropdown();
            setupSearch();
        });
    } else {
        setupLangDropdown();
        setupSearch();
    }
})();