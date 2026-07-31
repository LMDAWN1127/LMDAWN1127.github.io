// 语言切换器（下拉）交互逻辑
(function () {
    function initLangDropdown() {
        const dropdown = document.querySelector('.lang-dropdown');
        const toggle = document.querySelector('.lang-toggle');
        if (!dropdown || !toggle) return;

        // 切换下拉
        toggle.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = dropdown.classList.toggle('open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });

        // 点击外部关闭
        document.addEventListener('click', function (e) {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });

        // Esc 键关闭
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && dropdown.classList.contains('open')) {
                dropdown.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.focus();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLangDropdown);
    } else {
        initLangDropdown();
    }
})();
