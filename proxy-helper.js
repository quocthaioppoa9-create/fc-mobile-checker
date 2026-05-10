// proxy-helper.js - Quản lý proxy rotation
class ProxyManager {
    constructor(proxies = []) {
        this.proxies = proxies;
        this.currentIndex = 0;
        this.failedProxies = new Set();
    }

    /**
     * Lấy proxy tiếp theo (round-robin)
     */
    getNext() {
        if (this.proxies.length === 0) return null;

        let attempts = 0;
        while (attempts < this.proxies.length) {
            const proxy = this.proxies[this.currentIndex];
            this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

            const key = `${proxy.host}:${proxy.port}`;
            if (!this.failedProxies.has(key)) {
                return proxy;
            }
            attempts++;
        }

        // Nếu tất cả proxy đều fail, reset và thử lại
        this.failedProxies.clear();
        return this.proxies[0] || null;
    }

    /**
     * Đánh dấu proxy lỗi
     */
    markFailed(proxy) {
        if (proxy) {
            this.failedProxies.add(`${proxy.host}:${proxy.port}`);
        }
    }

    /**
     * Tạo chuỗi proxy cho Puppeteer args
     */
    static toProxyArg(proxy) {
        if (!proxy) return null;
        return `--proxy-server=http://${proxy.host}:${proxy.port}`;
    }

    /**
     * Kiểm tra proxy có auth không
     */
    static hasAuth(proxy) {
        return proxy && proxy.username && proxy.password;
    }

    /**
     * Lấy thông tin hiển thị proxy
     */
    static getDisplayString(proxy) {
        if (!proxy) return 'Không dùng proxy';
        const auth = this.hasAuth(proxy) ? ` (Auth: ${proxy.username})` : '';
        return `${proxy.host}:${proxy.port}${auth}`;
    }

    /**
     * Số lượng proxy khả dụng
     */
    getAvailableCount() {
        return this.proxies.length - this.failedProxies.size;
    }

    getTotal() {
        return this.proxies.length;
    }
}

module.exports = ProxyManager;
