const XSTATUS_LIST = ["shopping", "duck", "tired", "party", "beer", "thinking", "eating", "tv", "friends", "coffee", "music", "business", "camera", "funny", "phone", "games", "college", "sick", "sleeping", "surfing", "internet", "engineering", "typing", "angry", "unknown", "ppc", "mobile", "man", "wc", "question", "way", "heart", "smoking", "sex", "search", "diary"],
    SMILEY_MAP_RAW = [
        ["aa", ["O:-)", "O=)"]],
        ["ab", [":-)", ":)", "=)"]],
        ["ac", [":-(", ":(", ";("]],
        ["ad", [";-)", ";)"]],
        ["ae", [":-P"]],
        ["af", ["8-)"]],
        ["ag", [":-D"]],
        ["ah", [":-["]],
        ["ai", ["=-O"]],
        ["aj", [":-*"]],
        ["ak", [":'("]],
        ["al", [":-X", ":-x"]],
        ["am", [">:o"]],
        ["an", [":-|"]],
        ["ao", [":-\\", ":-/"]],
        ["ap", ["*JOKINGLY*"]],
        ["aq", ["]:->"]],
        ["ar", ["[:-}"]],
        ["as", ["*KISSED*"]],
        ["at", [":-!"]],
        ["au", ["*TIRED*"]],
        ["av", ["*STOP*"]],
        ["aw", ["*KISSING*"]],
        ["ax", ["@}->--"]],
        ["ay", ["*THUMBS UP*"]],
        ["az", ["*DRINK*"]],
        ["ba", ["*IN LOVE*"]],
        ["bb", ["@="]],
        ["bc", ["*HELP*"]],
        ["bd", ["\\m/"]],
        ["be", ["%)"]],
        ["bf", ["*OK*"]],
        ["bg", ["*WASSUP*", "*SUP*"]],
        ["bh", ["*SORRY*"]],
        ["bi", ["*BRAVO*"]],
        ["bj", ["*ROFL*", "*LOL*"]],
        ["bk", ["*PARDON*"]],
        ["bl", ["*NO*"]],
        ["bm", ["*CRAZY*"]],
        ["bn", ["*DONT_KNOW*", "*UNKNOWN*"]],
        ["bo", ["*DANCE*"]],
        ["bp", ["*YAHOO*", "*YAHOO!*"]],
        ["bq", ["*HI*", "*PREVED*", "*PRIVET*", "*HELLO*"]],
        ["br", ["*BYE*"]],
        ["bs", ["*YES*"]],
        ["bt", [";D", "*ACUTE*"]],
        ["bu", ["*WALL*", "*DASH*"]],
        ["bv", ["*WRITE*", "*MAIL*"]],
        ["bw", ["*SCRATCH*"]]
    ],
    SMILEY_BASE_URL = "/static/smiles/",
    SMILEY_TRIGGERS = SMILEY_MAP_RAW.flatMap(([t, e]) => e.map(e => ({
        code: t,
        trigger: e
    }))).sort((t, e) => e.trigger.length - t.trigger.length);

function escapeRegExp(t) {
    return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
const SMILEY_REGEX = new RegExp(SMILEY_TRIGGERS.map(t => escapeRegExp(t.trigger)).join("|"), "gi"),
    SMILEY_BY_TRIGGER = {};
SMILEY_TRIGGERS.forEach(t => {
    const e = t.trigger.toLowerCase();
    e in SMILEY_BY_TRIGGER || (SMILEY_BY_TRIGGER[e] = t.code)
});
const STATUS_ICON_W = 16,
    STATUS_ICON_H = 16,
    STATUS_ICON_INDEX = {
        AWAY: 0,
        FREE: 1,
        DND: 2,
        NA: 4,
        OFFLINE: 6,
        ONLINE: 7
    },
    XSTATUS_ICON_W = 16,
    XSTATUS_ICON_H = 16,
    XSTATUS_EMPTY_INDEX = XSTATUS_LIST.length,
    XSTATUS_UNKNOWN_INDEX = XSTATUS_LIST.length + 1;

function statusIconIndex(t) {
    return STATUS_ICON_INDEX[String(t || "").toUpperCase()]
}

function xstatusIconIndex(t) {
    if (!t) return XSTATUS_EMPTY_INDEX;
    const e = XSTATUS_LIST.indexOf(t);
    return e >= 0 ? e : XSTATUS_UNKNOWN_INDEX
}

function statusIconHtml(t, e = "") {
    const s = statusIconIndex(t);
    return void 0 === s ? "" : `<span class="status-icon ${e}" style="background-position:-${16*s-1}px 0" title="${t||""}"></span>`
}

function xstatusIconHtml(t, e = "") {
    if (!t) return "";
    return `<span class="xstatus-icon ${e}" style="background-position:-${16*xstatusIconIndex(t)}px 0" title="${t}"></span>`
}
class ICQApp {
    constructor() {
        this.ws = null, this.reconnectTimer = null, this.state = {
            connected: !1,
            myUin: null,
            myNick: "",
            myInfo: null,
            contacts: {},
            groups: {},
            messages: {},
            drafts: {},
            currentChat: null,
            typing: {},
            searchResults: [],
            authRequests: [],
            pendingAuthUin: null,
            accountPrefs: {
                lastStatus: null,
                lastXstatus: null,
                xstatusDraft: null,
                hideOffline: !1
            },
            avatarToken: null
        }, this._navState = {
            modal: null,
            chatOpen: !1,
            chatUin: null
        }, this.init()
    }
    init() {
        this.populateXStatus(), this.loadSettings(), this.bindEvents(), this.bindAvatarEvents(), this.fixMobileViewportHeight(), this.registerServiceWorker(), this.connectWS(), this.tryAutoLogin()
    }
    registerServiceWorker() {
        this._swReady = null, "serviceWorker" in navigator && (navigator.serviceWorker.register("/sw.js").then(() => {
            this._swReady = navigator.serviceWorker.ready
        }).catch(t => console.warn("Не удалось зарегистрировать service worker для уведомлений", t)), navigator.serviceWorker.addEventListener("message", t => {
            t.data && "icq-notif-click" === t.data.type && t.data.uin && this.openChat(t.data.uin)
        }))
    }
    loadSettings() {
        let t = {};
        try {
            t = JSON.parse(localStorage.getItem("icq_settings") || "{}")
        } catch (e) {
            t = {}
        }
        this.state.settings = {
            chatFontSize: 14,
            sendMode: "ctrlenter",
            notifSoundEnabled: !0,
            notifBrowserEnabled: !0,
            ...t
        }, this.applyFontSize(this.state.settings.chatFontSize)
    }
    saveSettings() {
        try {
            localStorage.setItem("icq_settings", JSON.stringify(this.state.settings))
        } catch (t) {
            console.warn("Не удалось сохранить настройки", t)
        }
    }
    accountPrefsKey(t) {
        return `icq_account_${t}`
    }
    loadAccountPrefs(t) {
        let e = {};
        try {
            e = JSON.parse(localStorage.getItem(this.accountPrefsKey(t)) || "{}")
        } catch (t) {
            e = {}
        }
        this.state.accountPrefs = {
            lastStatus: null,
            lastXstatus: null,
            xstatusDraft: null,
            hideOffline: !1,
            mutedContacts: {},
            ...e
        }, this.updateHideOfflineButton(), this.registerKnownAccount(t)
    }
    saveAccountPrefs() {
        if (this.state.myUin) try {
            localStorage.setItem(this.accountPrefsKey(this.state.myUin), JSON.stringify(this.state.accountPrefs))
        } catch (t) {
            console.warn("Не удалось сохранить настройки аккаунта", t)
        }
    }
    connectPayload(t, e) {
        this.loadAccountPrefs(t);
        const s = {
            uin: t,
            password: e
        };
        this.state.accountPrefs.lastStatus && "FREE" !== this.state.accountPrefs.lastStatus && (s.status = this.state.accountPrefs.lastStatus);
        const n = this.state.accountPrefs.lastXstatus;
        return n && n.name && (s.xstatus = n.name, s.xstatus_title = n.title || "", s.xstatus_desc = n.desc || ""), s
    }
    registerKnownAccount(t) {
        if (!t) return;
        let e = [];
        try {
            e = JSON.parse(localStorage.getItem("icq_known_accounts") || "[]")
        } catch (t) {
            e = []
        }
        if (!e.includes(t)) {
            e.push(t);
            try {
                localStorage.setItem("icq_known_accounts", JSON.stringify(e))
            } catch (t) {}
        }
    }
    updateHideOfflineButton() {
        const t = document.getElementById("btn-toggle-offline"),
            e = !!this.state.accountPrefs.hideOffline;
        t.classList.toggle("active", e), t.textContent = e ? "🙉" : "🙈", t.title = e ? "Показать всех (сейчас скрыты не в сети)" : "Скрыть не в сети"
    }
    applyFontSize(t) {
        document.documentElement.style.setProperty("--chat-font-size", t + "px")
    }
    isContactMuted(t) {
        return !(!this.state.accountPrefs.mutedContacts || !this.state.accountPrefs.mutedContacts[t])
    }
    toggleContactMuted(t) {
        this.state.accountPrefs.mutedContacts || (this.state.accountPrefs.mutedContacts = {}), this.isContactMuted(t) ? delete this.state.accountPrefs.mutedContacts[t] : this.state.accountPrefs.mutedContacts[t] = !0, this.saveAccountPrefs()
    }
    playNotifSound() {
        this._notifAudio || (this._notifAudio = new Audio("/static/sounds/sndMsg.wav"));
        try {
            this._notifAudio.pause(), this._notifAudio.currentTime = 0, this._notifAudio.play().catch(() => {})
        } catch (t) {}
    }
    notificationPermissionStatus() {
        return "Notification" in window ? Notification.permission : "unsupported"
    }
    async requestNotificationPermission() {
        if (!("Notification" in window)) return "unsupported";
        if ("default" === Notification.permission) try {
            return await Notification.requestPermission()
        } catch (t) {
            return Notification.permission
        }
        return Notification.permission
    }
    async showBrowserNotification(t, e) {
        if (!("Notification" in window)) return;
        if ("granted" !== Notification.permission) return;
        const s = this.state.contacts[t] && this.state.contacts[t].display_name || t,
            n = {
                body: e,
                tag: "icq-msg-" + t,
                data: {
                    uin: t
                }
            };
        if (this._swReady) try {
            const t = await this._swReady;
            if (t && t.showNotification) return void await t.showNotification(s, n)
        } catch (t) {
            console.warn("showNotification через service worker не сработал, пробуем обычный конструктор", t)
        }
        try {
            const e = new Notification(s, n);
            e.onclick = () => {
                window.focus(), this.openChat(t), e.close()
            }
        } catch (t) {
            console.warn("Notification API недоступен в этом браузере", t)
        }
    }
    fixMobileViewportHeight() {
        const t = window.visualViewport;
        if (!t) return;
        const e = () => {
            document.documentElement.style.setProperty("--vvh", t.height + "px"), window.scrollTo(0, 0)
        };
        t.addEventListener("resize", e), t.addEventListener("scroll", e), e();
        const s = document.getElementById("message-input");
        s && (s.addEventListener("focus", () => setTimeout(e, 50)), s.addEventListener("blur", () => setTimeout(e, 50)))
    }
    saveCreds(t, e) {
        try {
            localStorage.setItem("icq_creds", JSON.stringify({
                uin: t,
                password: e
            }))
        } catch (t) {
            console.warn("Не удалось сохранить учётные данные", t)
        }
    }
    loadCreds() {
        try {
            const t = localStorage.getItem("icq_creds");
            return t ? JSON.parse(t) : null
        } catch (t) {
            return null
        }
    }
    clearCreds() {
        try {
            localStorage.removeItem("icq_creds")
        } catch (t) {}
    }
    tryAutoLogin() {
        const t = this.loadCreds();
        t && t.uin && t.password && (document.getElementById("login-uin").value = t.uin, document.getElementById("login-password").value = t.password, this.state.myUin = t.uin, this._lastPassword = t.password, this._pendingAutoLogin = !0)
    }
    startAutoLoginCountdown(t = 5) {
        if (this._autoLoginActive) return;
        this._autoLoginSeconds = t, this._autoLoginActive = !0;
        const e = document.getElementById("login-btn-text"),
            s = () => {
                e.textContent = `Отменить автовход (${this._autoLoginSeconds})`
            };
        s(), this._autoLoginInterval = setInterval(() => {
            if (this._autoLoginSeconds--, this._autoLoginSeconds <= 0) return this.stopAutoLoginCountdown(), void this.doAutoLoginConnect();
            s()
        }, 1e3)
    }
    stopAutoLoginCountdown() {
        clearInterval(this._autoLoginInterval), this._autoLoginInterval = null, this._autoLoginActive = !1
    }
    cancelAutoLogin() {
        this.stopAutoLoginCountdown(), document.getElementById("login-btn-text").textContent = "Подключиться", this.toast("Автовход отменён", "info")
    }
    doAutoLoginConnect() {
        this.setLoginLoading(!0), this.send("connect", this.connectPayload(this.state.myUin, this._lastPassword))
    }
    isMobile() {
        return window.matchMedia("(max-width: 768px)").matches
    }
    historyKey() {
        return `icq_history_${this.state.myUin}`
    }
    loadHistory() {
        try {
            const t = localStorage.getItem(this.historyKey());
            this.state.messages = t ? JSON.parse(t) : {}
        } catch (t) {
            this.state.messages = {}
        }
    }
    saveHistory() {
        try {
            const t = 300,
                e = {};
            Object.keys(this.state.messages).forEach(s => {
                e[s] = this.state.messages[s].slice(-t)
            }), localStorage.setItem(this.historyKey(), JSON.stringify(e))
        } catch (t) {
            console.warn("Не удалось сохранить историю сообщений", t)
        }
    }
    populateXStatus() {
        const t = document.getElementById("xstatus-select");
        XSTATUS_LIST.forEach(e => {
            const s = document.createElement("option");
            s.value = e, s.textContent = e.charAt(0).toUpperCase() + e.slice(1), t.appendChild(s)
        })
    }
    connectWS() {
        if (this.reconnectTimer && clearTimeout(this.reconnectTimer), this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
        const t = "https:" === window.location.protocol ? "wss:" : "ws:";
        this.ws = new WebSocket(`${t}//${window.location.host}/ws`), this.ws.onopen = () => {
            console.log("WS open"), this._pendingAutoLogin && this._lastPassword && (this._pendingAutoLogin = !1, this.startAutoLoginCountdown())
        }, this.ws.onmessage = t => {
            try {
                this.handleMessage(JSON.parse(t.data))
            } catch (t) {
                console.error("bad json", t)
            }
        }, this.ws.onclose = () => {
            const t = this.state.connected;
            this.state.connected = !1, this.updateUI(), this.reconnectTimer = setTimeout(() => this.connectWS(), 3e3), !this._intentionalDisconnect && t && this._lastPassword && (this._pendingAutoLogin = !0, this.showReconnectBanner())
        }, this.ws.onerror = t => console.error("WS error", t)
    }
    send(t, e = {}) {
        return this.ws && this.ws.readyState === WebSocket.OPEN ? (this.ws.send(JSON.stringify({
            cmd: t,
            ...e
        })), !0) : (this.toast("Нет соединения", "error"), "connect" === t && this.setLoginLoading(!1), !1)
    }
    handleMessage(t) {
        const e = this["on_" + t.event];
        e ? e.call(this, t) : console.log("unhandled", t.event, t)
    }
    on_connected(t) {
        this.state.connected = !0, this.state.avatarToken = t && t.avatar_token || null, this.setLoginLoading(!1), this.hideReconnectBanner(), this.toast("Подключено к ICQ", "success"), this.switchScreen("app"), this.updateUI(), this.loadAccountPrefs(this.state.myUin), this.state.myStatus = this.state.accountPrefs.lastStatus || "FREE", this.state.myXstatus = null;
        const e = this.state.accountPrefs.lastXstatus;
        e && e.name && (this.state.myXstatus = e.name), this.updateMyStatusIcon(), this.initNavState(), this.state.myUin && this._lastPassword && this.saveCreds(this.state.myUin, this._lastPassword), this.send("request_my_info"), this.loadHistory(), this.state.currentChat && this.renderMessages(this.state.currentChat)
    }
    on_disconnected() {
        this.state.connected = !1, this.state.myStatus = null, this.state.myXstatus = null, this.state.avatarToken = null, this.setLoginLoading(!1);
        const t = this._intentionalDisconnect;
        t || this.toast("Отключено от ICQ", "warning"), this._intentionalDisconnect = !1, this.updateUI(), this.resetToLoginUI(!0, t)
    }
    on_error(t) {
        this.setLoginLoading(!1), this._intentionalDisconnect || (this.toast(t.message || "Ошибка", "error"), t.message && t.message.includes("Auth") && (document.getElementById("login-error").textContent = t.message, this.clearCreds()))
    }
    on_roster(t) {
        this.state.groups = {}, t.groups.forEach(t => this.state.groups[t.group_id] = t), this.state.contacts = {}, t.contacts.forEach(t => this.state.contacts[t.uin] = t), this.renderContacts()
    }
    on_contact_online(t) {
        this.mergeContact(t.contact)
    }
    on_contact_offline(t) {
        this.mergeContact(t.contact)
    }
    on_contact_status(t) {
        this.mergeContact(t.contact)
    }
    mergeContact(t) {
        const e = this.state.contacts[t.uin] || {};
        this.state.contacts[t.uin] = {
            ...e,
            ...t
        }, this.renderContacts(), this.state.currentChat === t.uin && this.updateChatHeader()
    }
    on_message(t) {
        const e = t.message;
        if (this.state.messages[e.sender_uin] || (this.state.messages[e.sender_uin] = []), this.state.messages[e.sender_uin].push(e), this.saveHistory(), this.isChatVisible(e.sender_uin)) this.renderMessage(e), this.scrollBottom();
        else {
            this.state.unread || (this.state.unread = {}), this.state.unread[e.sender_uin] = (this.state.unread[e.sender_uin] || 0) + 1, this.renderContacts();
            const t = this.state.contacts[e.sender_uin]?.display_name || e.sender_uin;
            this.toast(`Сообщение от ${t}`, "info"), e.is_outgoing || this.isContactMuted(e.sender_uin) || (this.state.settings.notifSoundEnabled && this.playNotifSound(), this.state.settings.notifBrowserEnabled && this.showBrowserNotification(e.sender_uin, e.text))
        }
    }
    on_typing(t) {
        this.state.typingStatus || (this.state.typingStatus = {}), this.state.typingTimers || (this.state.typingTimers = {}), this.state.typingStatus[t.uin] = !!t.is_typing, clearTimeout(this.state.typingTimers[t.uin]), t.is_typing && (this.state.typingTimers[t.uin] = setTimeout(() => {
            this.state.typingStatus[t.uin] = !1, this.updateTypingIndicator()
        }, 6e3)), this.updateTypingIndicator()
    }
    updateTypingIndicator() {
        const t = document.getElementById("typing-indicator"),
            e = this.state.currentChat,
            s = e && this.state.typingStatus && this.state.typingStatus[e];
        t.classList.toggle("typing-indicator-visible", !!s)
    }
    on_xstatus_updated(t) {
        this.mergeContact(t.contact)
    }
    on_user_info(t) {
        const e = t.info;
        if (this._addContactAutofillUin && e && String(e.uin) === this._addContactAutofillUin) {
            this._addContactAutofillUin = null;
            const t = document.getElementById("modal-add-contact"),
                s = document.getElementById("add-nick"),
                n = document.getElementById("add-uin"),
                a = e.nick || e.first_name || "";
            !t.classList.contains("hidden") && n.value.trim() === String(e.uin) && !s.value.trim() && (s.value = a);
            const i = this._nickAutofillResolvers && this._nickAutofillResolvers[String(e.uin)];
            return void(i && (delete this._nickAutofillResolvers[String(e.uin)], i(a)))
        }
        this.showUserInfo(e)
    }
    on_my_info(t) {
        this.state.myInfo = t.info, this.state.myNick = t.info.nick || t.info.uin, document.getElementById("my-uin").textContent = this.state.myNick || this.state.myUin, this.renderProfile(t.info)
    }
    on_search_result(t) {
        this.state.searchResults.push(t.result), this.renderSearch()
    }
    on_search_done(t) {
        this.state.searchResults = t.results, this.renderSearch(), this.toast(`Найдено: ${t.results.length}`, "success")
    }
    on_offline_message(t) {
        this.on_message(t)
    }
    on_auth_request(t) {
        this.state.pendingAuthUin = t.uin, document.getElementById("auth-body").innerHTML = `<p><b>${this.esc(t.uin)}</b> запрашивает авторизацию.</p>\n       <p class="auth-msg">${this.esc(t.message||"")}</p>`, this.pushModal("modal-auth")
    }
    on_auth_reply(t) {
        this.toast(`Авторизация ${t.granted?"разрешена":"отклонена"} (${t.uin})`, t.granted ? "success" : "warning"), t.granted && this.state.contacts[t.uin] && (this.state.contacts[t.uin].pending_auth = !1, this.renderContacts(), this.state.currentChat === t.uin && this.updateChatHeader())
    }
    on_you_were_added(t) {
        this.toast(`${t.uin} добавил(а) вас в контакт-лист`, "info")
    }
    on_save_my_info_result(t) {
        this.toast(t.success ? "Анкета сохранена" : "Ошибка сохранения", t.success ? "success" : "error"), t.success && this.send("request_my_info")
    }
    on_add_contact_result(t) {
        t.success ? (t.contact && (this.state.contacts[t.contact.uin] = t.contact, this.renderContacts()), this.toast(t.auth_requested ? "Контакт добавлен, запрос авторизации отправлен" : "Контакт добавлен", "success")) : this.toast(t.error || "Ошибка добавления", "warning")
    }
    on_register_result(t) {
        const e = document.getElementById("btn-register-submit"),
            s = document.getElementById("reg-result");
        s.className = "reg-result", t.success ? (s.classList.add("success"), s.innerHTML = `Новый UIN: <b>${this.esc(t.uin)}</b>.`, document.getElementById("login-uin").value = t.uin, this.toast("Зарегистрирован UIN " + t.uin, "success"), this._justRegistered = !0, this._regNewUin = t.uin, this._regNewPassword = this._pendingRegPassword, e.disabled = !1, e.textContent = "Войти") : (this._justRegistered = !1, e.disabled = !1, e.textContent = "Зарегистрировать", s.classList.add("error"), s.textContent = t.message || "Не удалось зарегистрировать UIN", document.getElementById("reg-captcha-answer").value = "", document.getElementById("reg-captcha-question").textContent = "Загрузка проверочного вопроса…", this.send("get_captcha"))
    }
    on_captcha(t) {
        document.getElementById("reg-captcha-question").textContent = t.question
    }
    on_change_password_result(t) {
        const e = document.getElementById("btn-change-password");
        e.disabled = !1, e.textContent = "🔑 Сменить пароль";
        const s = document.getElementById("change-pw-result");
        s.className = "reg-result", t.success ? (s.classList.add("success"), s.textContent = "Пароль изменён.", this._pendingNewPassword && (this._lastPassword = this._pendingNewPassword, this.state.myUin && this.saveCreds(this.state.myUin, this._pendingNewPassword), document.getElementById("login-password").value = this._pendingNewPassword), document.getElementById("change-pw-current").value = "", document.getElementById("change-pw-new").value = "", document.getElementById("change-pw-new2").value = "", this.toast("Пароль успешно изменён", "success")) : (s.classList.add("error"), s.textContent = "Не удалось сменить пароль. Проверьте текущий пароль и попробуйте снова.", this.toast("Ошибка смены пароля", "error")), this._pendingNewPassword = null
    }
    on_create_group_result(t) {
        t.success && t.group ? (this.state.groups[t.group.group_id] = t.group, this.renderContacts(), this.toast("Группа создана", "success")) : this.toast("Не удалось создать группу", "error")
    }
    on_delete_group_result(t) {
        t.success ? (void 0 !== this._pendingDeleteGid && delete this.state.groups[this._pendingDeleteGid], this.renderContacts(), this.toast("Группа удалена", "success")) : this.toast("Не удалось удалить группу (возможно, она не пуста)", "error"), this._pendingDeleteGid = void 0
    }
    on_remove_contact_result(t) {
        this.toast(t.success ? "Контакт удалён" : "Ошибка удаления", t.success ? "success" : "error"), t.success && t.uin && (delete this.state.contacts[t.uin], delete this.state.messages[t.uin], this.state.unread && delete this.state.unread[t.uin], this.saveHistory(), this.renderContacts(), this.state.currentChat === t.uin && this.closeChat(), delete this.state.drafts[t.uin])
    }
    on_rename_contact_result(t) {
        t.success ? (t.contact && this.mergeContact(t.contact), this.toast("Контакт переименован", "success")) : this.toast("Не удалось переименовать контакт", "error")
    }
    on_move_contact_result(t) {
        t.success ? (t.contact && this.mergeContact(t.contact), this.toast("Контакт перемещён", "success")) : this.toast("Не удалось переместить контакт", "error")
    }
    switchScreen(t) {
        document.querySelectorAll(".screen").forEach(t => t.classList.remove("active")), document.getElementById(t + "-screen").classList.add("active")
    }
    updateUI() {
        this.updateMyStatusIcon()
    }
    updateMyStatusIcon() {
        const t = this.state.connected ? this.state.myStatus || "ONLINE" : "OFFLINE",
            e = statusIconIndex(t),
            s = document.getElementById("my-status-icon");
        s.style.backgroundPosition = void 0 !== e ? `-${16*e}px 0` : "0 0", s.title = t;
        const n = document.getElementById("my-xstatus-icon");
        this.state.connected && this.state.myXstatus ? (n.style.backgroundPosition = `-${16*xstatusIconIndex(this.state.myXstatus)}px 0`, n.title = this.state.myXstatus, n.classList.remove("hidden")) : n.classList.add("hidden")
    }
    showReconnectBanner() {
        document.getElementById("reconnect-banner").classList.remove("hidden")
    }
    hideReconnectBanner() {
        document.getElementById("reconnect-banner").classList.add("hidden")
    }
    resetToLoginUI(t, e = !1) {
        const s = t ? this.state.myUin : "";
        this.closeChat(), document.querySelectorAll(".modal").forEach(t => t.classList.add("hidden")), this.hideReconnectBanner(), this.switchScreen("login"), this.setLoginLoading(!1), document.getElementById("login-uin").value = s || "";
        const n = document.getElementById("login-password");
        e ? n.value = "" : this._lastPassword && (n.value = this._lastPassword)
    }
    setLoginLoading(t) {
        const e = document.getElementById("btn-login"),
            s = document.getElementById("login-spinner"),
            n = document.getElementById("login-btn-text"),
            a = document.getElementById("login-uin"),
            i = document.getElementById("login-password");
        e.disabled = t, a.disabled = t, i.disabled = t, s.classList.toggle("hidden", !t), n.textContent = t ? "Подключение…" : "Подключиться", t && (document.getElementById("login-error").textContent = "")
    }
    toast(t, e = "info") {
        const s = document.getElementById("toast-container"),
            n = document.createElement("div");
        n.className = "toast " + e, n.textContent = t, s.appendChild(n);
        const a = setTimeout(() => n.remove(), 5e3);
        this.makeSwipeToDismiss(n, a)
    }
    makeSwipeToDismiss(t, e) {
        let s = null,
            n = 0,
            a = !1;
        const i = e => {
                s = e, n = 0, a = !0, t.classList.add("dragging")
            },
            o = e => {
                a && null !== s && (n = e - s, t.style.transform = `translateX(${n}px)`, t.style.opacity = String(Math.max(0, 1 - Math.abs(n) / 150)))
            },
            c = () => {
                a && (a = !1, t.classList.remove("dragging"), Math.abs(n) > 60 ? (clearTimeout(e), t.classList.add("toast-out"), t.style.transform = `translateX(${n>0?"100%":"-100%"})`, t.style.opacity = "0", setTimeout(() => t.remove(), 220)) : (t.style.transform = "", t.style.opacity = ""))
            };
        t.addEventListener("mousedown", t => {
            i(t.clientX), t.preventDefault()
        }), window.addEventListener("mousemove", t => o(t.clientX)), window.addEventListener("mouseup", c), t.addEventListener("touchstart", t => i(t.touches[0].clientX), {
            passive: !0
        }), t.addEventListener("touchmove", t => o(t.touches[0].clientX), {
            passive: !0
        }), t.addEventListener("touchend", c)
    }
    esc(t) {
        const e = document.createElement("div");
        return e.textContent = t, e.innerHTML
    }
    avatarUrl(t) {
        return t ? `/api/avatar/${encodeURIComponent(t)}` : ""
    }
    avatarImgHtml(t) {
        if (!t) return "";
        this._avatarLoaded = this._avatarLoaded || {};
        return `<img class="avatar-img${!0===this._avatarLoaded[t]?" loaded":""}" data-uin="${this.esc(t)}" src="${this.avatarUrl(t)}" alt="" loading="lazy"\n      onload="this.classList.add('loaded'); window.app &amp;&amp; window.app.markAvatarLoaded(this.dataset.uin)"\n      onerror="this.remove()">`
    }
    markAvatarLoaded(t) {
        this._avatarLoaded = this._avatarLoaded || {}, this._avatarLoaded[t] = !0
    }
    containsNonEnglishLetters(t) {
        if (!t) return !1;
        for (const e of String(t))
            if (/\p{L}/u.test(e) && !/[A-Za-z]/.test(e)) return !0;
        return !1
    }
    async copyToClipboard(t) {
        try {
            await navigator.clipboard.writeText(t), this.toast("UIN скопирован", "success")
        } catch (t) {
            this.toast("Не удалось скопировать", "error")
        }
    }
    parseSmileys(t) {
        if (!t) return "";
        let e, s = "",
            n = 0;
        for (SMILEY_REGEX.lastIndex = 0; null !== (e = SMILEY_REGEX.exec(t));) {
            s += this.esc(t.slice(n, e.index));
            const a = SMILEY_BY_TRIGGER[e[0].toLowerCase()];
            s += `<img class="smiley" src="${SMILEY_BASE_URL}${a}.gif" alt="${this.esc(e[0])}" title="${this.esc(e[0])}">`, n = e.index + e[0].length
        }
        return s += this.esc(t.slice(n)), s
    }
    buildSmileyPanel() {
        const t = document.getElementById("smiley-panel");
        t.innerHTML = "", SMILEY_MAP_RAW.forEach(([e, s]) => {
            const n = s[0],
                a = document.createElement("button");
            a.type = "button", a.title = n, a.innerHTML = `<img src="${SMILEY_BASE_URL}${e}.gif" alt="${this.esc(n)}">`, a.addEventListener("click", () => this.insertSmiley(n)), t.appendChild(a)
        })
    }
    insertSmiley(t) {
        const e = document.getElementById("message-input"),
            s = e.selectionStart ?? e.value.length,
            n = e.selectionEnd ?? e.value.length,
            a = e.value.slice(0, s),
            i = e.value.slice(n),
            o = a && !/\s$/.test(a),
            c = i && !/^\s/.test(i);
        e.value = a + (o ? " " : "") + t + (c ? " " : "") + i;
        const d = (a + (o ? " " : "") + t + (c ? " " : "")).length;
        e.focus(), e.setSelectionRange(d, d), document.getElementById("smiley-panel").classList.add("hidden"), e.value.trim() && this.startTyping()
    }
    showConfirm(t, e = {}) {
        return new Promise(s => {
            const n = document.getElementById("modal-generic");
            document.getElementById("generic-modal-title").textContent = e.title || "Подтверждение", document.getElementById("generic-modal-message").textContent = t;
            document.getElementById("generic-modal-input").classList.add("hidden");
            const a = document.getElementById("generic-modal-ok"),
                i = document.getElementById("generic-modal-cancel");
            a.textContent = e.okText || "ОК", i.textContent = e.cancelText || "Отмена", i.classList.remove("hidden"), n.classList.remove("hidden");
            const o = t => {
                    n.classList.add("hidden"), a.onclick = null, i.onclick = null, document.removeEventListener("keydown", c), s(t)
                },
                c = t => {
                    "Escape" === t.key && o(!1)
                };
            document.addEventListener("keydown", c), a.onclick = () => o(!0), i.onclick = () => o(!1)
        })
    }
    showPrompt(t, e = "", s = {}) {
        return new Promise(n => {
            const a = document.getElementById("modal-generic");
            document.getElementById("generic-modal-title").textContent = s.title || "Введите значение", document.getElementById("generic-modal-message").textContent = t;
            const i = document.getElementById("generic-modal-input");
            i.classList.remove("hidden"), i.value = e || "", i.placeholder = s.placeholder || "";
            const o = document.getElementById("generic-modal-ok"),
                c = document.getElementById("generic-modal-cancel");
            o.textContent = s.okText || "ОК", c.textContent = s.cancelText || "Отмена", c.classList.remove("hidden"), a.classList.remove("hidden"), setTimeout(() => {
                i.focus(), i.select()
            }, 50);
            const d = t => {
                a.classList.add("hidden"), o.onclick = null, c.onclick = null, i.onkeydown = null, n(t)
            };
            o.onclick = () => d(i.value.trim() ? i.value : null), c.onclick = () => d(null), i.onkeydown = t => {
                "Enter" === t.key ? (t.preventDefault(), d(i.value.trim() ? i.value : null)) : "Escape" === t.key && (t.preventDefault(), d(null))
            }
        })
    }
    renderContacts() {
        const t = document.getElementById("contact-list"),
            e = document.getElementById("contact-filter").value.toLowerCase(),
            s = this.state.accountPrefs.hideOffline;
        t.innerHTML = "";
        const n = t => {
            const e = this.state.groups[t];
            return "0" === String(t) || e && e.name && "general" === e.name.trim().toLowerCase()
        };
        Object.keys(this.state.groups).sort((t, e) => {
            const s = n(t);
            return s !== n(e) ? s ? -1 : 1 : this.state.groups[t].name.localeCompare(this.state.groups[e].name)
        }).forEach(a => {
            const i = this.state.groups[a],
                o = Object.values(this.state.contacts).filter(t => t.group_id == a),
                c = o.filter(t => !e || (t.display_name || "").toLowerCase().includes(e) || t.uin.includes(e)).filter(t => !s || t.is_online || this.state.currentChat === t.uin || (this.state.unread && this.state.unread[t.uin]) > 0).sort((t, e) => {
                    const s = this.state.unread && this.state.unread[t.uin] || 0,
                        n = this.state.unread && this.state.unread[e.uin] || 0;
                    return n > 0 != s > 0 ? (n > 0) - (s > 0) : s > 0 && n > 0 ? this.lastMessageTs(e) - this.lastMessageTs(t) : e.is_online - t.is_online || (t.display_name || "").localeCompare(e.display_name || "")
                });
            if (!c.length && (e || o.length > 0)) return;
            const d = document.createElement("div");
            d.className = "group-header";
            const r = !o.length && !n(a);
            d.innerHTML = `<span>${this.esc(i.name)}</span>\n        <span class="group-header-actions">\n          ${r?`<button data-gid="${a}" class="btn-del-grp" title="Удалить пустую группу">🗑️</button>`:""}\n          <button data-gid="${a}" class="btn-add-to-grp" title="Добавить контакт в группу">+</button>\n        </span>`, t.appendChild(d), c.forEach(e => {
                const s = document.createElement("div");
                s.className = "contact-item", this.state.currentChat === e.uin && s.classList.add("active"), e.pending_auth && s.classList.add("pending");
                const n = (e.status || "OFFLINE").toLowerCase(),
                    a = this.esc((e.display_name || "?")[0].toUpperCase()),
                    i = this.state.unread && this.state.unread[e.uin] || 0;
                s.innerHTML = `\n          <div class="contact-avatar ${n}"><span class="contact-avatar-letter">${a}</span>${this.avatarImgHtml(e.uin)}${statusIconHtml(e.status,"status-badge")}</div>\n          <div class="contact-info">\n            <div class="contact-name-row">\n              <span class="contact-name">${this.esc(e.display_name||e.uin)}</span>\n              ${this.isContactMuted(e.uin)?'<span class="mute-icon" title="Без звука и уведомлений">🔕</span>':""}\n            </div>\n            <div class="contact-meta">${this.esc(e.uin)} ${"Unknown"!==e.client?"• "+this.esc(e.client):""}</div>\n            ${e.xstatus?`<div class="contact-status">${xstatusIconHtml(e.xstatus)}${e.xstatus_msg?`<span class="status-line-text">${this.esc(e.xstatus_msg)}</span>`:""}</div>`:""}\n          </div>\n          ${i>0?`<span class="unread-badge">${i>99?"99+":i}</span>`:""}`, s.addEventListener("click", () => this.openChat(e.uin)), s.addEventListener("contextmenu", t => this.showCtx(t, e.uin)), t.appendChild(s)
            })
        });
        const a = Object.keys(this.state.messages).filter(t => !this.state.contacts[t] && (this.state.messages[t] || []).length).filter(t => !e || t.toLowerCase().includes(e));
        if (a.length) {
            const e = document.createElement("div");
            e.className = "group-header", e.innerHTML = "<span>Не из списка</span>", t.appendChild(e), a.sort((t, e) => {
                const s = this.state.unread && this.state.unread[t] || 0,
                    n = this.state.unread && this.state.unread[e] || 0;
                return n > 0 != s > 0 ? (n > 0) - (s > 0) : this.lastMessageTs(e) - this.lastMessageTs(t)
            }).forEach(e => {
                const s = document.createElement("div");
                s.className = "contact-item stranger", this.state.currentChat === e && s.classList.add("active");
                const n = this.state.unread && this.state.unread[e] || 0;
                s.innerHTML = `\n            <div class="contact-avatar offline"><span class="contact-avatar-letter">${this.esc(e[0]||"?")}</span>${this.avatarImgHtml(e)}</div>\n            <div class="contact-info">\n              <div class="contact-name-row">\n                <span class="contact-name">${this.esc(e)}</span>\n                ${this.isContactMuted(e)?'<span class="mute-icon" title="Без звука и уведомлений">🔕</span>':""}\n              </div>\n              <div class="contact-meta">не в контакт-листе</div>\n            </div>\n            ${n>0?`<span class="unread-badge">${n>99?"99+":n}</span>`:""}\n            <button class="btn-add-stranger" data-uin="${this.esc(e)}" title="Добавить в контакты">➕</button>`, s.addEventListener("click", t => {
                    t.target.closest(".btn-add-stranger") || this.openChat(e)
                }), t.appendChild(s)
            })
        }
        const i = document.createElement("div");
        i.className = "group-header", i.innerHTML = '<button id="btn-new-group">+ Новая группа</button>', t.appendChild(i), t.querySelectorAll(".btn-add-stranger").forEach(t => {
            t.addEventListener("click", e => {
                e.stopPropagation(), this.openAddContact(0, {
                    uin: t.dataset.uin
                })
            })
        }), t.querySelectorAll(".btn-add-to-grp").forEach(t => {
            t.addEventListener("click", e => {
                e.stopPropagation(), this.openAddContact(parseInt(t.dataset.gid))
            })
        }), t.querySelectorAll(".btn-del-grp").forEach(t => {
            t.addEventListener("click", async e => {
                e.stopPropagation();
                const s = parseInt(t.dataset.gid),
                    n = this.state.groups[s];
                await this.showConfirm(`Удалить пустую группу «${n?n.name:s}»?`, {
                    title: "Удаление группы"
                }) && (this._pendingDeleteGid = s, this.send("delete_group", {
                    group_id: s
                }))
            })
        });
        const o = t.querySelector("#btn-new-group");
        o && o.addEventListener("click", async () => {
            const t = await this.showPrompt("Название группы:", "", {
                title: "Новая группа"
            });
            t && this.send("create_group", {
                name: t
            })
        })
    }
    startTyping() {
        const t = this.state.currentChat;
        t && (this._typingSentFor !== t && (this.send("send_typing", {
            uin: t,
            is_typing: !0
        }), this._typingSentFor = t), clearTimeout(this._typingTimeout), this._typingTimeout = setTimeout(() => this.stopTyping(), 4e3))
    }
    stopTyping() {
        clearTimeout(this._typingTimeout), this._typingTimeout = null, this._typingSentFor && (this.send("send_typing", {
            uin: this._typingSentFor,
            is_typing: !1
        }), this._typingSentFor = null)
    }
    lastMessageTs(t) {
        const e = this.state.messages[t];
        return e && e.length && e[e.length - 1].timestamp || 0
    }
    saveDraftForCurrentChat() {
        const t = this.state.currentChat;
        if (!t) return;
        const e = document.getElementById("message-input").value;
        e ? this.state.drafts[t] = e : delete this.state.drafts[t]
    }
    loadDraftForChat(t) {
        document.getElementById("message-input").value = this.state.drafts[t] || "", this._autoGrowMsgInput ? this._autoGrowMsgInput() : this._resetMsgInputHeight && this._resetMsgInputHeight()
    }
    openChat(t) {
        if (this.stopTyping(), this.saveDraftForCurrentChat(), document.getElementById("smiley-panel").classList.add("hidden"), this.state.currentChat = t, this.state.unread && (this.state.unread[t] = 0), this.renderContacts(), document.getElementById("chat-placeholder").classList.add("hidden"), document.getElementById("chat-container").classList.remove("hidden"), this.updateChatHeader(), this.renderMessages(t), this.loadDraftForChat(t), this.updateTypingIndicator(), this.isMobile()) {
            const e = {
                ...this._navState,
                chatOpen: !0,
                chatUin: t,
                modal: null
            };
            history.pushState(e, "", location.href), this.applyNavState(e)
        }
    }
    closeChat() {
        if (this.stopTyping(), this.saveDraftForCurrentChat(), document.getElementById("smiley-panel").classList.add("hidden"), this.state.currentChat = null, document.getElementById("chat-placeholder").classList.remove("hidden"), document.getElementById("chat-container").classList.add("hidden"), this.renderContacts(), this.updateTypingIndicator(), this.isMobile() && this._navState && this._navState.chatOpen) {
            const t = {
                ...this._navState,
                chatOpen: !1,
                chatUin: null,
                modal: null
            };
            history.replaceState(t, "", location.href), this.applyNavState(t)
        }
    }
    updateChatHeader() {
        const t = this.state.currentChat,
            e = this.state.contacts[t],
            s = document.getElementById("btn-add-stranger-chat");
        if (!e) return document.getElementById("chat-name").textContent = t, document.getElementById("chat-status").innerHTML = "Не в контакт-листе", document.getElementById("chat-client").textContent = "", document.getElementById("btn-request-auth").classList.add("hidden"), document.getElementById("chat-mute-icon").classList.toggle("hidden", !this.isContactMuted(t)), void s.classList.remove("hidden");
        document.getElementById("chat-name").textContent = e.display_name || e.uin, document.getElementById("chat-mute-icon").classList.toggle("hidden", !this.isContactMuted(t));
        const n = e.xstatus ? `${xstatusIconHtml(e.xstatus)}${e.xstatus_msg?`<span class="status-line-text">${this.esc(e.xstatus_msg)}</span>`:""}` : "";
        document.getElementById("chat-status").innerHTML = `${statusIconHtml(e.status)}${n}`, document.getElementById("chat-client").textContent = "Unknown" !== e.client ? e.client : "", document.getElementById("btn-request-auth").classList.toggle("hidden", !e.pending_auth), s.classList.add("hidden")
    }
    renderMessages(t) {
        document.getElementById("messages").innerHTML = "", (this.state.messages[t] || []).forEach(t => this.renderMessage(t)), this.scrollBottom()
    }
    renderMessage(t) {
        const e = document.getElementById("messages"),
            s = document.createElement("div"),
            n = t.is_outgoing || t.sender_uin === this.state.myUin;
        s.className = "message " + (n ? "outgoing" : "incoming");
        const a = new Date(1e3 * t.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            }),
            i = n ? "Вы" : this.state.contacts[t.sender_uin]?.display_name || t.sender_uin,
            o = this.esc((i[0] || "?").toUpperCase()),
            c = n ? this.state.myUin : t.sender_uin;
        s.innerHTML = `\n      <div class="message-avatar"><span>${o}</span>${this.avatarImgHtml(c)}</div>\n      <div class="message-bubble">\n        ${n?"":`<div class="message-sender">${this.esc(i)}</div>`}\n        <div class="message-text">${this.parseSmileys(t.text)}</div>\n        <div class="message-time">${a}</div>\n      </div>`, e.appendChild(s)
    }
    scrollBottom() {
        const t = document.getElementById("messages");
        t.scrollTop = t.scrollHeight
    }
    applyNavState(t) {
        if (document.querySelectorAll(".modal").forEach(t => t.classList.add("hidden")), t.modal) {
            const e = document.getElementById(t.modal);
            e && e.classList.remove("hidden")
        }
        if (this.isMobile()) {
            const e = !t.chatOpen;
            document.querySelector(".sidebar").classList.toggle("mobile-open", e), e ? (document.getElementById("chat-container").classList.add("hidden"), document.getElementById("chat-placeholder").classList.remove("hidden")) : t.chatUin && (document.getElementById("chat-placeholder").classList.add("hidden"), document.getElementById("chat-container").classList.remove("hidden"))
        }
        this._navState = t
    }
    isChatVisible(t) {
        return this.state.currentChat === t && (!this.isMobile() || !(!this._navState || !this._navState.chatOpen))
    }
    initNavState() {
        this._navState = {
            modal: null,
            chatOpen: !1,
            chatUin: null
        }, history.replaceState(this._navState, "", location.href), this.applyNavState(this._navState)
    }
    pushModal(t) {
        const e = {
            ...this._navState,
            modal: t
        };
        history.pushState(e, "", location.href), this.applyNavState(e)
    }
    replaceModal(t) {
        const e = {
            ...this._navState,
            modal: t
        };
        history.replaceState(e, "", location.href), this.applyNavState(e)
    }
    goBack() {
        history.back()
    }
    genderLabel(t) {
        return "M" === t ? "Мужской" : "F" === t ? "Женский" : ""
    }
    renderProfile(t, e = !0) {
        const s = document.getElementById("profile-body");
        if (!t) return void(s.innerHTML = "<p>Загрузка…</p>");
        const n = [
            ["nick", "Ник"],
            ["first_name", "Имя"],
            ["last_name", "Фамилия"],
            ["email", "Email"],
            ["city", "Город"],
            ["home_page", "Сайт"],
            ["birthday", "День рождения (ДД.ММ.ГГГГ)"],
            ["about", "О себе"]
        ];
        if (e) {
            const e = t.uin || this.state.myUin || "",
                a = (t.nick || t.first_name || e || "?")[0].toUpperCase();
            let i = `<div class="profile-avatar-row">\n        <div class="profile-avatar-circle" id="profile-avatar-circle"><span>${this.esc(a)}</span>${this.avatarImgHtml(e)}</div>\n        <div class="profile-avatar-actions">\n          <button type="button" id="btn-avatar-change" class="btn btn-secondary">🖼️ Изменить фото</button>\n          <button type="button" id="btn-avatar-remove" class="btn btn-secondary">🗑️ Удалить</button>\n        </div>\n      </div>\n      <label>UIN\n        <div class="uin-copy-row">\n          <input type="text" id="pf-display-uin" value="${this.esc(e)}" readonly>\n          <button type="button" id="btn-copy-uin" class="btn btn-secondary" title="Скопировать UIN">📋</button>\n        </div>\n      </label>`;
            n.forEach(([e, s]) => {
                const n = t[e] || "";
                i += "about" === e ? `<label>${s}<textarea id="pf-${e}" rows="3">${this.esc(n)}</textarea></label>` : `<label>${s}<input type="text" id="pf-${e}" value="${this.esc(n)}"></label>`
            }), i += `<label>Пол\n        <select id="pf-gender">\n          <option value="" ${t.gender?"":"selected"}>— Не указан —</option>\n          <option value="M" ${"M"===t.gender?"selected":""}>Мужской</option>\n          <option value="F" ${"F"===t.gender?"selected":""}>Женский</option>\n        </select>\n      </label>`, i += `<label><input type="checkbox" id="pf-auth_required" ${t.auth_required?"checked":""}> Требовать авторизацию при добавлении</label>`, s.innerHTML = i;
            const o = document.getElementById("btn-copy-uin");
            o && o.addEventListener("click", () => this.copyToClipboard(e));
            const c = document.getElementById("btn-avatar-change");
            c && c.addEventListener("click", () => this.startAvatarUpload(e));
            const d = document.getElementById("btn-avatar-remove");
            d && d.addEventListener("click", () => this.removeAvatar(e))
        } else {
            const e = t.uin || "",
                a = (t.nick || t.first_name || e || "?")[0].toUpperCase(),
                i = `<div class="profile-avatar-row view-only">\n          <div class="profile-avatar-circle"><span>${this.esc(a)}</span>${this.avatarImgHtml(e)}</div>\n        </div>\n        <div class="uin-copy-row">\n          <input type="text" id="pf-display-uin" value="${this.esc(e)}" readonly>\n          <button type="button" id="btn-copy-uin" class="btn btn-secondary" title="Скопировать UIN">📋</button>\n        </div>`,
                o = [...n];
            t.gender && o.push(["gender", "Пол"]);
            const c = o.filter(([e]) => {
                    const s = t[e];
                    return null != s && "" !== String(s).trim()
                }),
                d = c.length ? c.map(([e, s]) => `<div class="profile-view-row"><span class="profile-view-label">${s}</span><span class="profile-view-value">${this.esc("gender"===e?this.genderLabel(t[e]):t[e])}</span></div>`).join("") : "<p>Анкета не заполнена</p>";
            s.innerHTML = i + d;
            const r = document.getElementById("btn-copy-uin");
            r && r.addEventListener("click", () => this.copyToClipboard(e))
        }
    }
    showUserInfo(t) {
        this.renderProfile(t, !1), document.querySelector("#modal-profile h2").textContent = "Анкета " + t.uin, document.getElementById("btn-save-profile").style.display = "none", document.getElementById("btn-refresh-profile").style.display = "none", this.pushModal("modal-profile")
    }
    renderSearch() {
        const t = document.getElementById("search-results");
        t.innerHTML = "", this.state.searchResults.forEach(e => {
            const s = document.createElement("div");
            s.className = "search-result-item", s.innerHTML = `<div><b>${this.esc(e.nick||e.uin)}</b> (${this.esc(e.uin)}) ${e.auth_req?'<span class="auth-req-badge" title="Требуется авторизация">🔒</span>':""}<br><small>${this.esc(e.first_name)} ${this.esc(e.last_name)} ${e.email?"• "+this.esc(e.email):""}</small></div>\n        <button data-uin="${this.esc(e.uin)}">Добавить</button>`, s.querySelector("button").addEventListener("click", () => {
                this.openAddContact(0, {
                    uin: e.uin,
                    nick: e.nick || e.first_name || "",
                    replace: !0
                })
            }), t.appendChild(s)
        })
    }
    populateGroupSelect(t, e) {
        t.innerHTML = "", Object.values(this.state.groups).sort((t, e) => t.name.localeCompare(e.name)).forEach(s => {
            const n = document.createElement("option");
            n.value = s.group_id, n.textContent = s.name, s.group_id === e && (n.selected = !0), t.appendChild(n)
        })
    }
    openAddContact(t, e = {}) {
        this.populateGroupSelect(document.getElementById("add-group"), t), document.getElementById("add-uin").value = void 0 !== e.uin ? e.uin : "", document.getElementById("add-nick").value = void 0 !== e.nick ? e.nick : "", e.replace ? this.replaceModal("modal-add-contact") : this.pushModal("modal-add-contact"), e.uin && !e.nick ? this.requestNickAutofill(e.uin) : this._addContactAutofillUin = null
    }
    requestNickAutofill(t) {
        this._addContactAutofillUin = String(t), this.send("request_user_info", {
            uin: t
        })
    }
    requestNickAutofillAsync(t, e = 2500) {
        return new Promise(s => {
            this._addContactAutofillUin = String(t);
            let n = !1;
            const a = t => {
                n || (n = !0, s(t || ""))
            };
            this._nickAutofillResolvers = this._nickAutofillResolvers || {}, this._nickAutofillResolvers[String(t)] = a, this.send("request_user_info", {
                uin: t
            }), setTimeout(() => a(""), e)
        })
    }
    openMoveContact(t) {
        this.state.moveUin = t;
        const e = this.state.contacts[t] ? this.state.contacts[t].group_id : void 0;
        this.populateGroupSelect(document.getElementById("move-group"), e), this.pushModal("modal-move-contact")
    }
    showCtx(t, e) {
        t.preventDefault();
        const s = document.getElementById("context-menu"),
            n = this.state.contacts[e],
            a = s.querySelector('[data-action="request-auth"]');
        a && a.classList.toggle("hidden", !(n && n.pending_auth));
        const i = s.querySelector('[data-action="toggle-mute"]');
        if (i) {
            const t = this.isContactMuted(e);
            i.textContent = t ? "🔔 Включить уведомления" : "🔕 Без звука и уведомлений"
        }
        s.classList.remove("hidden");
        const o = s.getBoundingClientRect();
        let c = t.clientX,
            d = t.clientY;
        c + o.width + 8 > window.innerWidth && (c = window.innerWidth - o.width - 8), d + o.height + 8 > window.innerHeight && (d = window.innerHeight - o.height - 8), c = Math.max(8, c), d = Math.max(8, d), s.style.left = c + "px", s.style.top = d + "px", s.querySelectorAll(".context-item").forEach(t => {
            t.onclick = () => {
                this.handleCtx(t.dataset.action, e), s.classList.add("hidden")
            }
        })
    }
    async handleCtx(t, e) {
        switch (t) {
            case "info":
                this.send("request_user_info", {
                    uin: e
                });
                break;
            case "rename": {
                const t = this.state.contacts[e] && this.state.contacts[e].display_name || "",
                    s = await this.showPrompt("Новый ник:", t, {
                        title: "Переименовать контакт"
                    });
                s && this.send("rename_contact", {
                    uin: e,
                    new_nick: s
                });
                break
            }
            case "move":
                this.openMoveContact(e);
                break;
            case "remove":
                await this.showConfirm("Удалить контакт?", {
                    title: "Удаление контакта"
                }) && this.send("remove_contact", {
                    uin: e
                });
                break;
            case "request-auth":
                this.send("send_auth_request", {
                    uin: e,
                    message: "Пожалуйста, авторизуйте меня"
                }), this.toast("Запрос авторизации отправлен", "success");
                break;
            case "toggle-mute": {
                this.toggleContactMuted(e);
                const t = this.isContactMuted(e);
                this.toast(t ? "Уведомления для контакта отключены" : "Уведомления для контакта включены", "success"), this.renderContacts(), this.state.currentChat === e && this.updateChatHeader();
                break
            }
        }
    }
    bindAvatarEvents() {
        const t = document.getElementById("avatar-file-input");
        t.addEventListener("change", () => {
            const e = t.files && t.files[0];
            t.value = "", e && (/^image\/(png|jpeg|webp)$/.test(e.type) ? e.size > 6291456 ? this.toast("Файл слишком большой (максимум 6 МБ)", "error") : this.openAvatarCropper(e) : this.toast("Поддерживаются только JPG, PNG и WEBP", "error"))
        });
        const e = document.getElementById("avatar-crop-stage");
        let s = !1,
            n = 0,
            a = 0,
            i = 0,
            o = 0;
        const c = (t, e) => {
                this._crop && (s = !0, n = t, a = e, i = this._crop.offX, o = this._crop.offY)
            },
            d = (t, e) => {
                s && this._crop && (this._crop.offX = i + (t - n), this._crop.offY = o + (e - a), this.clampCropOffset(), this.applyCropTransform())
            },
            r = () => {
                s = !1
            },
            l = (t, e, s) => {
                const n = this._crop;
                if (!n) return;
                s = Math.max(n.minScale, Math.min(4 * n.minScale, s));
                const a = (t - n.offX) / n.scale,
                    i = (e - n.offY) / n.scale;
                n.scale = s, n.offX = t - a * s, n.offY = e - i * s, this.clampCropOffset(), this.applyCropTransform()
            },
            u = (t, e) => Math.hypot(t.clientX - e.clientX, t.clientY - e.clientY);
        e.addEventListener("mousedown", t => {
            c(t.clientX, t.clientY), t.preventDefault()
        }), window.addEventListener("mousemove", t => d(t.clientX, t.clientY)), window.addEventListener("mouseup", r), e.addEventListener("wheel", t => {
            if (!this._crop) return;
            t.preventDefault();
            const s = e.getBoundingClientRect(),
                n = t.deltaY < 0 ? 1.08 : 1 / 1.08;
            l(t.clientX - s.left, t.clientY - s.top, this._crop.scale * n)
        }, {
            passive: !1
        });
        let h = 0,
            m = 1,
            g = 0,
            p = 0,
            y = 0,
            v = 0;
        e.addEventListener("touchstart", t => {
            if (this._crop)
                if (t.touches.length >= 2) {
                    s = !1;
                    const [n, a] = t.touches, i = e.getBoundingClientRect();
                    h = u(n, a), m = this._crop.scale, y = (n.clientX + a.clientX) / 2 - i.left, v = (n.clientY + a.clientY) / 2 - i.top, g = (y - this._crop.offX) / this._crop.scale, p = (v - this._crop.offY) / this._crop.scale
                } else {
                    const e = t.touches[0];
                    c(e.clientX, e.clientY)
                }
        }, {
            passive: !0
        }), e.addEventListener("touchmove", t => {
            if (this._crop)
                if (t.touches.length >= 2 && h > 0) {
                    const e = u(t.touches[0], t.touches[1]),
                        s = this._crop,
                        n = Math.max(s.minScale, Math.min(4 * s.minScale, m * (e / h)));
                    s.scale = n, s.offX = y - g * n, s.offY = v - p * n, this.clampCropOffset(), this.applyCropTransform()
                } else {
                    const e = t.touches[0];
                    d(e.clientX, e.clientY)
                }
        }, {
            passive: !0
        }), e.addEventListener("touchend", t => {
            t.touches.length < 2 && (h = 0), 0 === t.touches.length && r()
        }), document.getElementById("btn-avatar-crop-cancel").addEventListener("click", () => this.closeAvatarCropper()), document.getElementById("btn-avatar-crop-close").addEventListener("click", () => this.closeAvatarCropper()), document.getElementById("btn-avatar-crop-save").addEventListener("click", () => this.saveAvatarCrop())
    }
    startAvatarUpload(t) {
        this.state.avatarToken ? (this._cropTargetUin = t, document.getElementById("avatar-file-input").click()) : this.toast("Нужно быть подключённым к ICQ, чтобы менять аватарку", "error")
    }
    openAvatarCropper(t) {
        const e = document.getElementById("avatar-crop-img"),
            s = URL.createObjectURL(t);
        e.onload = () => {
            const t = 280,
                n = e.naturalWidth,
                a = e.naturalHeight,
                i = Math.max(t / n, t / a);
            this._crop = {
                nw: n,
                nh: a,
                scale: i,
                minScale: i,
                offX: 0,
                offY: 0,
                stageSize: t
            }, this._crop.offX = (t - n * i) / 2, this._crop.offY = (t - a * i) / 2, this.applyCropTransform(), URL.revokeObjectURL(s)
        }, e.src = s, document.getElementById("modal-avatar-crop").classList.remove("hidden")
    }
    applyCropTransform() {
        const t = document.getElementById("avatar-crop-img"),
            e = this._crop;
        e && (t.style.width = e.nw * e.scale + "px", t.style.height = e.nh * e.scale + "px", t.style.transform = `translate(${e.offX}px, ${e.offY}px)`)
    }
    clampCropOffset() {
        const t = this._crop;
        if (!t) return;
        const e = t.nw * t.scale,
            s = t.nh * t.scale,
            n = Math.min(0, t.stageSize - e),
            a = Math.min(0, t.stageSize - s);
        t.offX = Math.max(n, Math.min(0, t.offX)), t.offY = Math.max(a, Math.min(0, t.offY))
    }
    closeAvatarCropper() {
        document.getElementById("modal-avatar-crop").classList.add("hidden"), this._crop = null, this._cropTargetUin = null
    }
    async saveAvatarCrop() {
        const t = this._crop,
            e = this._cropTargetUin;
        if (!t || !e) return void this.closeAvatarCropper();
        const s = 512,
            n = (0 - t.offX) / t.scale,
            a = (0 - t.offY) / t.scale,
            i = t.stageSize / t.scale,
            o = t.stageSize / t.scale,
            c = document.createElement("canvas");
        c.width = s, c.height = s;
        const d = c.getContext("2d"),
            r = document.getElementById("avatar-crop-img");
        d.drawImage(r, n, a, i, o, 0, 0, s, s);
        const l = document.getElementById("btn-avatar-crop-save");
        l.disabled = !0;
        try {
            const t = await new Promise(t => c.toBlob(t, "image/jpeg", .9));
            if (!t) throw new Error("Не удалось подготовить изображение");
            const s = new FormData;
            s.append("token", this.state.avatarToken || ""), s.append("file", t, "avatar.jpg");
            const n = await fetch(`/api/avatar/${encodeURIComponent(e)}`, {
                method: "POST",
                body: s
            });
            if (!n.ok) {
                const t = await n.json().catch(() => ({}));
                throw new Error(t.detail || "Не удалось загрузить аватарку")
            }
            this._avatarLoaded && delete this._avatarLoaded[e], this.closeAvatarCropper(), this.toast("Аватарка обновлена", "success"), this.refreshAvatarsFor(e)
        } catch (t) {
            this.toast(t.message || "Ошибка загрузки аватарки", "error")
        } finally {
            l.disabled = !1
        }
    }
    async removeAvatar(t) {
        if (!this.state.avatarToken) return void this.toast("Нужно быть подключённым к ICQ, чтобы менять аватарку", "error");
        if (await this.showConfirm("Удалить аватарку?", {
                title: "Удаление аватарки"
            })) try {
            if (!(await fetch(`/api/avatar/${encodeURIComponent(t)}?token=${encodeURIComponent(this.state.avatarToken)}`, {
                    method: "DELETE"
                })).ok) throw new Error;
            this._avatarLoaded && delete this._avatarLoaded[t], this.toast("Аватарка удалена", "success"), this.refreshAvatarsFor(t)
        } catch (t) {
            this.toast("Не удалось удалить аватарку", "error")
        }
    }
    refreshAvatarsFor(t) {
        this.state.myInfo && t === this.state.myUin && this.renderProfile(this.state.myInfo), this.renderContacts(), this.state.currentChat && this.renderMessages(this.state.currentChat)
    }
    bindEvents() {
        const t = () => {
            if (this._autoLoginActive) return void this.cancelAutoLogin();
            const t = document.getElementById("login-uin").value.trim(),
                e = document.getElementById("login-password").value;
            t && e ? (this.state.myUin = t, this._lastPassword = e, this.setLoginLoading(!0), this.send("connect", this.connectPayload(t, e))) : document.getElementById("login-error").textContent = "Введите UIN и пароль"
        };
        document.getElementById("btn-login").addEventListener("click", t);
        const e = e => {
            "Enter" === e.key && (e.preventDefault(), t())
        };
        document.getElementById("login-uin").addEventListener("keydown", e), document.getElementById("login-password").addEventListener("keydown", e), document.getElementById("btn-open-register").addEventListener("click", () => {
            this._autoLoginActive && this.cancelAutoLogin(), document.getElementById("reg-password").value = "", document.getElementById("reg-password2").value = "", document.getElementById("reg-captcha-answer").value = "", document.getElementById("reg-result").textContent = "";
            const t = document.getElementById("btn-register-submit");
            t.disabled = !1, t.textContent = "Зарегистрировать", this._justRegistered = !1, document.getElementById("reg-captcha-question").textContent = "Загрузка проверочного вопроса…", this.send("get_captcha"), this.pushModal("modal-register")
        }), document.getElementById("btn-register-submit").addEventListener("click", () => {
            if (this._justRegistered && this._regNewUin && this._regNewPassword) return this.goBack(), document.getElementById("login-uin").value = this._regNewUin, document.getElementById("login-password").value = this._regNewPassword, this.state.myUin = this._regNewUin, this._lastPassword = this._regNewPassword, this.setLoginLoading(!0), void this.send("connect", {
                uin: this._regNewUin,
                password: this._regNewPassword
            });
            const t = document.getElementById("reg-password").value,
                e = document.getElementById("reg-password2").value,
                s = document.getElementById("reg-captcha-answer").value.trim(),
                n = document.getElementById("reg-result");
            if (n.className = "reg-result", !t || t.length < 6) return n.textContent = "Пароль должен быть не короче 6 символов.", void n.classList.add("error");
            if (t !== e) return n.textContent = "Пароли не совпадают.", void n.classList.add("error");
            if (!s) return n.textContent = "Ответьте на проверочный вопрос.", void n.classList.add("error");
            n.textContent = "", this._pendingRegPassword = t;
            const a = document.getElementById("btn-register-submit");
            a.disabled = !0, a.textContent = "Регистрация…", this.send("register", {
                password: t,
                captcha_answer: s
            })
        }), document.getElementById("btn-logout").addEventListener("click", async () => {
            await this.showConfirm("Точно отключиться?", {
                title: "Отключение"
            }) && (this._intentionalDisconnect = !0, this.stopTyping(), this.send("disconnect"), this.clearCreds(), this._lastPassword = null, this.state.connected = !1, setTimeout(() => this.resetToLoginUI(!0, !0), 0))
        });
        const s = () => {
            const t = document.getElementById("message-input"),
                e = t.value.trim();
            if (!e || !this.state.currentChat) return;
            this.send("send_message", {
                uin: this.state.currentChat,
                text: e
            }), this.stopTyping();
            const s = {
                sender_uin: this.state.myUin,
                text: e,
                timestamp: Date.now() / 1e3,
                is_outgoing: !0
            };
            this.state.messages[this.state.currentChat] || (this.state.messages[this.state.currentChat] = []), this.state.messages[this.state.currentChat].push(s), this.saveHistory(), this.renderMessage(s), this.scrollBottom(), t.value = "", delete this.state.drafts[this.state.currentChat], this._resetMsgInputHeight && this._resetMsgInputHeight()
        };
        document.getElementById("btn-send").addEventListener("click", s);
        const n = document.getElementById("message-input"),
            a = () => {
                n.style.height = "auto", n.style.height = Math.min(n.scrollHeight, 120) + "px"
            };
        this._autoGrowMsgInput = a, n.addEventListener("keydown", t => {
            if ("Enter" !== t.key) return;
            "enter" === this.state.settings.sendMode ? t.shiftKey || (t.preventDefault(), s()) : (t.ctrlKey || t.metaKey) && (t.preventDefault(), s())
        }), n.addEventListener("input", () => {
            a(), n.value.trim() ? this.startTyping() : this.stopTyping()
        }), n.addEventListener("blur", () => this.stopTyping()), this._resetMsgInputHeight = () => {
            n.style.height = "auto"
        }, this.buildSmileyPanel(), document.getElementById("btn-smileys").addEventListener("click", t => {
            t.stopPropagation(), document.getElementById("smiley-panel").classList.toggle("hidden")
        }), document.addEventListener("click", t => {
            const e = document.getElementById("smiley-panel"),
                s = document.getElementById("btn-smileys");
            e.classList.contains("hidden") || e.contains(t.target) || t.target === s || e.classList.add("hidden")
        }), document.addEventListener("keydown", t => {
            "Escape" === t.key && document.getElementById("smiley-panel").classList.add("hidden")
        }), document.getElementById("btn-profile").addEventListener("click", () => {
            document.querySelector("#modal-profile h2").textContent = "Моя анкета", document.getElementById("btn-save-profile").style.display = "", document.getElementById("btn-refresh-profile").style.display = "", this.state.myInfo ? this.renderProfile(this.state.myInfo) : this.send("request_my_info"), this.pushModal("modal-profile")
        }), document.getElementById("btn-save-profile").addEventListener("click", () => {
            const t = {
                uin: this.state.myUin
            };
            document.querySelectorAll("#profile-body input, #profile-body select, #profile-body textarea").forEach(e => {
                if ("pf-display-uin" === e.id) return;
                const s = e.id.replace("pf-", "");
                t[s] = "checkbox" === e.type ? e.checked : e.value
            });
            const e = {
                nick: "Ник",
                first_name: "Имя",
                last_name: "Фамилия",
                email: "Email",
                city: "Город",
                home_page: "Сайт",
                birthday: "День рождения",
                about: "О себе"
            };
            for (const s of Object.keys(e))
                if (this.containsNonEnglishLetters(t[s])) return void this.toast(`Поле «${e[s]}» может содержать только английские буквы (цифры и знаки препинания — можно). Проверьте и попробуйте снова.`, "error");
            this.send("save_my_info", {
                info: t
            }), this.send("set_require_auth", {
                require: !!t.auth_required
            }), this.state.myInfo = {
                ...this.state.myInfo || {},
                ...t
            }, this.goBack()
        }), document.getElementById("btn-refresh-profile").addEventListener("click", () => this.send("request_my_info")), document.getElementById("btn-search").addEventListener("click", () => {
            this.state.searchResults = [], this.renderSearch(), this.pushModal("modal-search")
        }), document.getElementById("btn-search-submit").addEventListener("click", () => {
            this.state.searchResults = [], this.send("search_users", {
                uin: document.getElementById("search-uin").value,
                nick: document.getElementById("search-nick").value,
                first_name: document.getElementById("search-first").value,
                last_name: document.getElementById("search-last").value,
                email: document.getElementById("search-email").value,
                city: document.getElementById("search-city").value,
                only_online: document.getElementById("search-online").checked
            })
        });
        const i = () => {
                const t = statusIconIndex(document.getElementById("status-select").value);
                document.getElementById("status-preview-icon").style.backgroundPosition = void 0 !== t ? `-${16*t}px 0` : "0 0"
            },
            o = () => {
                const t = document.getElementById("xstatus-select").value;
                document.getElementById("xstatus-preview-icon").style.backgroundPosition = `-${16*xstatusIconIndex(t)}px 0`
            };
        document.getElementById("status-select").addEventListener("change", i), document.getElementById("xstatus-select").addEventListener("change", o), document.getElementById("btn-status").addEventListener("click", () => {
            document.getElementById("status-select").value = this.state.myStatus || "FREE";
            const t = this.state.myXstatus ? this.state.accountPrefs.lastXstatus : this.state.accountPrefs.xstatusDraft;
            document.getElementById("xstatus-select").value = t && t.name || "", document.getElementById("xstatus-title").value = t && t.title || "", document.getElementById("xstatus-desc").value = t && t.desc || "", i(), o(), this._statusDialogInitial = {
                status: document.getElementById("status-select").value,
                xname: document.getElementById("xstatus-select").value,
                xtitle: document.getElementById("xstatus-title").value,
                xdesc: document.getElementById("xstatus-desc").value
            }, this.pushModal("modal-status")
        });
        const c = document.getElementById("setting-font-size"),
            d = document.getElementById("setting-font-size-value"),
            r = document.querySelectorAll('input[name="setting-send-mode"]'),
            l = document.getElementById("setting-notif-sound"),
            u = document.getElementById("setting-notif-browser"),
            h = document.getElementById("notif-permission-row"),
            m = document.getElementById("btn-notif-permission");
        this.refreshNotifPermissionUI = () => {
            const t = this.notificationPermissionStatus();
            "unsupported" !== t ? (h.classList.remove("hidden"), "granted" === t ? (m.textContent = "Разрешение получено ✓", m.disabled = !0) : "denied" === t ? (m.textContent = "Заблокировано в браузере", m.disabled = !0) : (m.textContent = "Разрешить уведомления", m.disabled = !1)) : h.classList.add("hidden")
        }, m.addEventListener("click", async () => {
            await this.requestNotificationPermission(), this.refreshNotifPermissionUI()
        }), document.getElementById("btn-settings").addEventListener("click", () => {
            c.value = this.state.settings.chatFontSize, d.textContent = this.state.settings.chatFontSize + "px", r.forEach(t => {
                t.checked = t.value === this.state.settings.sendMode
            }), l.checked = !!this.state.settings.notifSoundEnabled, u.checked = !!this.state.settings.notifBrowserEnabled, this.refreshNotifPermissionUI(), document.getElementById("change-pw-current").value = "", document.getElementById("change-pw-new").value = "", document.getElementById("change-pw-new2").value = "", document.getElementById("change-pw-result").textContent = "", document.getElementById("change-pw-result").className = "reg-result";
            const t = document.getElementById("btn-change-password");
            t.disabled = !1, t.textContent = "🔑 Сменить пароль", this.pushModal("modal-settings")
        }), c.addEventListener("input", () => {
            const t = parseInt(c.value, 10);
            d.textContent = t + "px", this.applyFontSize(t)
        }), c.addEventListener("change", () => {
            this.state.settings.chatFontSize = parseInt(c.value, 10), this.saveSettings()
        }), r.forEach(t => {
            t.addEventListener("change", () => {
                t.checked && (this.state.settings.sendMode = t.value, this.saveSettings())
            })
        }), l.addEventListener("change", () => {
            this.state.settings.notifSoundEnabled = l.checked, this.saveSettings()
        }), u.addEventListener("change", async () => {
            this.state.settings.notifBrowserEnabled = u.checked, this.saveSettings(), u.checked && "default" === this.notificationPermissionStatus() && await this.requestNotificationPermission(), this.refreshNotifPermissionUI()
        }), document.getElementById("btn-settings-done").addEventListener("click", () => this.goBack()), document.getElementById("btn-change-password").addEventListener("click", () => {
            const t = document.getElementById("change-pw-current").value,
                e = document.getElementById("change-pw-new").value,
                s = document.getElementById("change-pw-new2").value,
                n = document.getElementById("change-pw-result");
            if (n.className = "reg-result", !this.state.connected) return n.textContent = "Нет соединения с сервером.", void n.classList.add("error");
            if (!e || e.length < 6) return n.textContent = "Новый пароль должен быть не короче 6 символов.", void n.classList.add("error");
            if (e !== s) return n.textContent = "Пароли не совпадают.", void n.classList.add("error");
            n.textContent = "", this._pendingNewPassword = e;
            const a = document.getElementById("btn-change-password");
            a.disabled = !0, a.textContent = "Смена пароля…", this.send("change_password", {
                current_password: t,
                new_password: e
            })
        }), document.getElementById("btn-save-status").addEventListener("click", () => {
            const t = document.getElementById("status-select").value,
                e = document.getElementById("xstatus-select").value,
                s = document.getElementById("xstatus-title").value,
                n = document.getElementById("xstatus-desc").value,
                a = this._statusDialogInitial || {},
                i = t !== a.status,
                o = e !== a.xname || s !== a.xtitle || n !== a.xdesc;
            i && (this.send("set_status", {
                status: t
            }), this.state.myStatus = t, this.state.accountPrefs.lastStatus = t), o && (this.state.myXstatus = e || null, e ? (this.send("set_xstatus", {
                name: e,
                title: s,
                desc: n
            }), this.state.accountPrefs.lastXstatus = {
                name: e,
                title: s,
                desc: n
            }, this.state.accountPrefs.xstatusDraft = {
                name: e,
                title: s,
                desc: n
            }) : this.state.accountPrefs.lastXstatus = null), (i || o) && (this.saveAccountPrefs(), this.updateMyStatusIcon(), this.toast("Статус обновлён", "success")), this.goBack()
        }), document.getElementById("btn-auth-grant").addEventListener("click", () => {
            this.state.pendingAuthUin && this.send("send_auth_reply", {
                uin: this.state.pendingAuthUin,
                granted: !0,
                message: ""
            }), this.goBack()
        }), document.getElementById("btn-auth-deny").addEventListener("click", () => {
            this.state.pendingAuthUin && this.send("send_auth_reply", {
                uin: this.state.pendingAuthUin,
                granted: !1,
                message: ""
            }), this.goBack()
        }), document.getElementById("add-uin").addEventListener("blur", () => {
            const t = document.getElementById("add-uin").value.trim(),
                e = document.getElementById("add-nick");
            t && !e.value.trim() && this.requestNickAutofill(t)
        }), document.getElementById("add-uin").addEventListener("input", () => {
            clearTimeout(this._addUinDebounce);
            const t = document.getElementById("add-uin").value.trim(),
                e = document.getElementById("add-nick");
            /^\d{4,12}$/.test(t) && !e.value.trim() && (this._addUinDebounce = setTimeout(() => {
                document.getElementById("add-uin").value.trim() !== t || e.value.trim() || this.requestNickAutofill(t)
            }, 500))
        }), document.getElementById("btn-add-contact-submit").addEventListener("click", async () => {
            const t = document.getElementById("add-uin").value.trim();
            if (!t) return;
            const e = document.getElementById("add-nick"),
                s = document.getElementById("btn-add-contact-submit");
            if (!e.value.trim()) {
                s.disabled = !0;
                const n = await this.requestNickAutofillAsync(t);
                if (s.disabled = !1, document.getElementById("modal-add-contact").classList.contains("hidden")) return;
                if (document.getElementById("add-uin").value.trim() !== t) return;
                n && !e.value.trim() && (e.value = n)
            }
            this.send("add_contact", {
                uin: t,
                nick: e.value,
                group_id: parseInt(document.getElementById("add-group").value)
            }), this.goBack()
        }), document.getElementById("btn-move-contact-submit").addEventListener("click", () => {
            const t = this.state.moveUin,
                e = parseInt(document.getElementById("move-group").value);
            t && !isNaN(e) && (this.send("move_contact", {
                uin: t,
                new_group_id: e
            }), this.state.contacts[t] && (this.state.contacts[t].group_id = e, this.renderContacts())), this.goBack()
        }), document.getElementById("btn-user-info").addEventListener("click", () => {
            this.state.currentChat && this.send("request_user_info", {
                uin: this.state.currentChat
            })
        }), document.getElementById("btn-request-auth").addEventListener("click", () => {
            this.state.currentChat && (this.send("send_auth_request", {
                uin: this.state.currentChat,
                message: "Пожалуйста, авторизуйте меня"
            }), this.toast("Запрос авторизации отправлен", "success"))
        }), document.getElementById("btn-add-stranger-chat").addEventListener("click", () => {
            this.state.currentChat && this.openAddContact(0, {
                uin: this.state.currentChat
            })
        }), document.getElementById("btn-clear-history").addEventListener("click", async () => {
            const t = this.state.currentChat;
            if (!t) return;
            await this.showConfirm("Очистить историю переписки с этим контактом?", {
                title: "Очистка истории"
            }) && (this.state.messages[t] = [], this.saveHistory(), this.renderMessages(t), this.toast("История очищена", "success"))
        }), document.getElementById("btn-back-mobile").addEventListener("click", () => {
            this.goBack()
        }), document.getElementById("btn-reconnect-now").addEventListener("click", () => {
            this._autoLoginActive || (!this.ws || this.ws.readyState !== WebSocket.CONNECTING && this.ws.readyState !== WebSocket.OPEN) && (clearTimeout(this.reconnectTimer), this._pendingAutoLogin = !0, this.connectWS())
        }), document.getElementById("contact-filter").addEventListener("input", () => this.renderContacts()), document.getElementById("btn-toggle-offline").addEventListener("click", () => {
            this.state.accountPrefs.hideOffline = !this.state.accountPrefs.hideOffline, this.saveAccountPrefs(), this.updateHideOfflineButton(), this.renderContacts()
        }), document.querySelectorAll(".modal-close, .modal-back").forEach(t => {
            t.addEventListener("click", () => {
                this.goBack()
            })
        }), window.addEventListener("popstate", t => {
            const e = t.state || {
                modal: null,
                chatOpen: !1,
                chatUin: null
            };
            this.applyNavState(e)
        }), window.addEventListener("beforeunload", t => {
            this.state.connected && (t.preventDefault(), t.returnValue = "")
        });
        let g = this.isMobile();
        window.addEventListener("resize", () => {
            const t = this.isMobile();
            t !== g && (g = t, this.applyNavState(this._navState || {
                modal: null,
                chatOpen: !1,
                chatUin: null
            }))
        }), document.addEventListener("click", t => {
            const e = document.getElementById("context-menu");
            e.contains(t.target) || e.classList.add("hidden")
        })
    }
}
document.addEventListener("DOMContentLoaded", () => {
    window.app = new ICQApp
});