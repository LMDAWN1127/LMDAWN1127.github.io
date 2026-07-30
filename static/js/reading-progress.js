// 阅读进度条
document.addEventListener("DOMContentLoaded", function() {
    // 创建进度条元素
    const progressBar = document.createElement("div");
    progressBar.className = "reading-progress";
    document.body.insertBefore(progressBar, document.body.firstChild);
    
    // 更新进度
    function updateProgress() {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = (scrollTop / docHeight) * 100;
        progressBar.style.width = progress + "%";
    }
    
    // 监听滚动事件
    window.addEventListener("scroll", updateProgress);
    updateProgress();
});
