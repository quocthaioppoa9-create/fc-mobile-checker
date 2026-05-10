// login.js - Module xử lý đăng nhập Garena
const { delay } = require('./utils');

// URL đăng nhập Garena
const GARENA_LOGIN_URL = 'https://sso.garena.com/universal/login?app_id=100054&redirect_uri=https%3A%2F%2Faccount.garena.com%2F&locale=vi-VN';
const GARENA_ACCOUNT_URL = 'https://account.garena.com/';

// Selectors - Cập nhật theo giao diện Garena thực tế
const SELECTORS = {
    // Trang đăng nhập SSO Garena
    usernameInput: 'input[name="username"], input#username, input[type="text"]',
    passwordInput: 'input[name="password"], input#password, input[type="password"]',
    loginButton: 'button[type="submit"], button.btn-primary, #btn-login, button:has-text("Đăng nhập")',
    loginButtonAlt: 'button[type="submit"]',

    // Captcha indicators
    captchaFrame: 'iframe[src*="captcha"], iframe[src*="recaptcha"], .captcha-container',
    captchaImage: '.captcha-image, img[src*="captcha"]',
    geetest: '.geetest_holder, .geetest_panel',

    // Trạng thái đăng nhập
    errorMessage: '.error-message, .alert-danger, .error, .login-error, [class*="error"]',
    wrongPassword: '.error-message, .alert-danger',

    // Sau khi đăng nhập thành công
    loggedInIndicator: '.user-info, .account-info, .profile, [class*="logged"], .dashboard',
    avatar: '.avatar, .user-avatar, img[class*="avatar"]',
};

/**
 * Thực hiện đăng nhập vào Garena
 * @param {import('puppeteer').Page} page
 * @param {string} username
 * @param {string} password
 * @param {Function} onStatusChange - Callback cập nhật trạng thái
 * @returns {Object} Kết quả đăng nhập
 */
async function performLogin(page, username, password, onStatusChange = () => { }) {
    try {
        onStatusChange('Đang mở trang đăng nhập...');

        // Truy cập trang đăng nhập Garena
        await page.goto(GARENA_LOGIN_URL, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await delay(2000);

        onStatusChange('Đang điền thông tin...');

        // Chờ form đăng nhập hiển thị
        const usernameField = await waitForAnySelector(page, [
            'input[name="username"]',
            'input#username',
            'input[type="text"]:not([name="captcha"])',
            'input[placeholder*="tài khoản"]',
            'input[placeholder*="username"]',
            'input[placeholder*="Tên đăng nhập"]'
        ], 15000);

        if (!usernameField) {
            throw new Error('Không tìm thấy ô nhập tài khoản');
        }

        // Xóa và điền username
        await usernameField.click({ clickCount: 3 });
        await delay(200);
        await usernameField.type(username, { delay: 50 + Math.random() * 80 });
        await delay(500);

        // Tìm ô password
        const passwordField = await waitForAnySelector(page, [
            'input[name="password"]',
            'input#password',
            'input[type="password"]'
        ], 5000);

        if (!passwordField) {
            throw new Error('Không tìm thấy ô nhập mật khẩu');
        }

        // Xóa và điền password
        await passwordField.click({ clickCount: 3 });
        await delay(200);
        await passwordField.type(password, { delay: 50 + Math.random() * 80 });
        await delay(800);

        onStatusChange('Đang nhấn đăng nhập...');

        // Nhấn nút đăng nhập
        const loginBtn = await waitForAnySelector(page, [
            'button[type="submit"]',
            '#btn-login',
            'button.btn-primary',
            'button.login-btn',
            'input[type="submit"]'
        ], 5000);

        if (loginBtn) {
            await loginBtn.click();
        } else {
            // Thử nhấn Enter
            await passwordField.press('Enter');
        }

        await delay(3000);

        // Kiểm tra kết quả đăng nhập
        const result = await checkLoginResult(page, onStatusChange);
        return result;

    } catch (error) {
        return {
            success: false,
            error: error.message,
            status: `Lỗi: ${error.message}`
        };
    }
}

/**
 * Kiểm tra kết quả sau khi nhấn đăng nhập
 */
async function checkLoginResult(page, onStatusChange) {
    const maxWaitTime = 300000; // 5 phút chờ captcha
    const checkInterval = 2000;
    let elapsed = 0;
    let captchaDetected = false;

    while (elapsed < maxWaitTime) {
        // 1. Kiểm tra đã redirect sang trang account chưa (đăng nhập thành công)
        const currentUrl = page.url();
        if (currentUrl.includes('account.garena.com') ||
            currentUrl.includes('dashboard') ||
            currentUrl.includes('profile') ||
            !currentUrl.includes('login')) {

            // Kiểm tra thêm xem có thực sự đăng nhập thành công
            if (!currentUrl.includes('sso.garena.com')) {
                onStatusChange('✅ Đăng nhập thành công!');
                return { success: true, status: 'Đăng nhập thành công' };
            }
        }

        // 2. Kiểm tra sai mật khẩu
        const hasError = await page.evaluate(() => {
            const errorElements = document.querySelectorAll(
                '.error-message, .alert-danger, .error, [class*="error"], .toast-error'
            );
            for (const el of errorElements) {
                const text = el.textContent.toLowerCase();
                if (text.includes('sai') || text.includes('wrong') ||
                    text.includes('incorrect') || text.includes('invalid') ||
                    text.includes('không đúng') || text.includes('thất bại')) {
                    return el.textContent.trim();
                }
            }
            return null;
        });

        if (hasError) {
            onStatusChange('❌ Sai mật khẩu');
            return {
                success: false,
                error: 'wrong_password',
                status: `Sai mật khẩu: ${hasError}`
            };
        }

        // 3. Kiểm tra Captcha
        const hasCaptcha = await page.evaluate(() => {
            // Kiểm tra nhiều loại captcha
            const captchaIndicators = [
                // GeeTest
                '.geetest_holder', '.geetest_panel', '.geetest_popup_wrap',
                // reCAPTCHA
                'iframe[src*="recaptcha"]', '.g-recaptcha',
                // hCaptcha
                'iframe[src*="hcaptcha"]',
                // Captcha Garena tự tạo
                '.captcha-container', '.captcha-wrapper', 'img[src*="captcha"]',
                // Slide captcha
                '.slide-captcha', '.captcha-slider',
                // Các loại khác
                '[class*="captcha"]', '[id*="captcha"]'
            ];

            for (const selector of captchaIndicators) {
                const el = document.querySelector(selector);
                if (el && el.offsetParent !== null) {
                    return true;
                }
            }

            // Kiểm tra iframe chứa captcha
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                const src = iframe.src || '';
                if (src.includes('captcha') || src.includes('challenge') ||
                    src.includes('geetest') || src.includes('recaptcha')) {
                    return true;
                }
            }

            return false;
        });

        if (hasCaptcha && !captchaDetected) {
            captchaDetected = true;
            onStatusChange('⚠️ CAPTCHA! Hãy giải captcha trên trình duyệt...');
            console.log('\n🔔 CAPTCHA ĐÃ XUẤT HIỆN! Vui lòng giải captcha trên cửa sổ trình duyệt.\n');
        }

        // 4. Kiểm tra trang đã thay đổi (đăng nhập thành công sau captcha)
        if (captchaDetected) {
            const stillOnLogin = await page.evaluate(() => {
                return window.location.href.includes('sso.garena.com') ||
                    window.location.href.includes('login');
            });

            if (!stillOnLogin) {
                onStatusChange('✅ Đăng nhập thành công (sau Captcha)!');
                return { success: true, status: 'Đăng nhập thành công' };
            }
        }

        // 5. Kiểm tra bị khóa tài khoản
        const isLocked = await page.evaluate(() => {
            const body = document.body.textContent.toLowerCase();
            return body.includes('bị khóa') || body.includes('locked') ||
                body.includes('suspended') || body.includes('banned');
        });

        if (isLocked) {
            onStatusChange('🔒 Tài khoản bị khóa');
            return { success: false, error: 'locked', status: 'Tài khoản bị khóa' };
        }

        await delay(checkInterval);
        elapsed += checkInterval;

        // Cập nhật thời gian chờ
        if (captchaDetected) {
            const remainSecs = Math.floor((maxWaitTime - elapsed) / 1000);
            onStatusChange(`⚠️ Chờ giải Captcha... (Còn ${remainSecs}s)`);
        }
    }

    return {
        success: false,
        error: 'timeout',
        status: 'Hết thời gian chờ (timeout)'
    };
}

/**
 * Chờ một trong nhiều selector xuất hiện
 */
async function waitForAnySelector(page, selectors, timeout = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        for (const selector of selectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    const isVisible = await page.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            el.offsetParent !== null;
                    }, element);

                    if (isVisible) return element;
                }
            } catch (e) {
                // Bỏ qua lỗi selector
            }
        }
        await delay(500);
    }

    return null;
}

/**
 * Đăng xuất khỏi tài khoản hiện tại
 */
async function performLogout(page) {
    try {
        await page.goto('https://account.garena.com/api/logout', {
            waitUntil: 'networkidle2',
            timeout: 15000
        });
        await delay(2000);

        // Xóa cookies
        const cookies = await page.cookies();
        if (cookies.length > 0) {
            await page.deleteCookie(...cookies);
        }

        // Xóa localStorage và sessionStorage
        await page.evaluate(() => {
            try {
                localStorage.clear();
                sessionStorage.clear();
            } catch (e) { }
        });

        await delay(1000);
    } catch (error) {
        // Nếu logout thất bại, xóa cookies là đủ
        try {
            const cookies = await page.cookies();
            if (cookies.length > 0) {
                await page.deleteCookie(...cookies);
            }
        } catch (e) { }
    }
}

module.exports = {
    performLogin,
    performLogout,
    GARENA_LOGIN_URL,
    GARENA_ACCOUNT_URL,
    SELECTORS
};
