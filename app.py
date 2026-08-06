from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, Response
import asyncio
import hmac
import io
import re
import secrets
import json, os
import logging
import random
from typing import Dict, Optional
from PIL import Image
from icq_core import ICQClient, Status, UserInfo, SearchResult, Message, Contact, Group, AuthError
from reg import ICQRegistration
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("icq_web")

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024  

@app.middleware("http")
async def limit_body_size(request, call_next):
    cl = request.headers.get("content-length")
    if cl is not None:
        try:
            if int(cl) > MAX_REQUEST_BODY_BYTES:
                from fastapi.responses import PlainTextResponse
                return PlainTextResponse("Payload too large", status_code=413)
        except ValueError:
            pass
    return await call_next(request)

ALLOWED_ORIGINS = {
    o.strip().rstrip("/") 
    for o in os.environ.get("ICQ_WEB_ALLOWED_ORIGINS", "").split(",") 
    if o.strip()
}

def _origin_allowed(origin: Optional[str]) -> bool:
    if not origin:
        return False
    return origin.rstrip("/") in ALLOWED_ORIGINS

SERVER_HOST = os.environ.get("SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.environ.get("PORT", os.environ.get("SERVER_PORT", "8000")))
SERVER_SSL_PORT = int(os.environ.get("SERVER_SSL_PORT", "443"))
DOMAIN = os.environ.get("DOMAIN", "localhost")
CERT_DIR = os.environ.get("CERT_DIR", f"/etc/letsencrypt/live/{DOMAIN}")
CERT_FILE = os.environ.get("CERT_FILE", os.path.join(CERT_DIR, "fullchain.pem"))
KEY_FILE = os.environ.get("KEY_FILE", os.path.join(CERT_DIR, "privkey.pem"))

async def _client_run(self: ICQClient):
    self._running = True
    self._stop_requested = False
    self._intentional_stop = False
    while not self._stop_requested:
        try:
            await self._connect()
            recon = await self._login_stage1()
            await self._reconnect_with_cookie(recon)
            await self._initialize()
            if self.on_connected:
                await self._fire(self.on_connected)
            keepalive = asyncio.create_task(self._keepalive())
            await self._message_loop()
            keepalive.cancel()
        except AuthError as e:
            await self._fire(self.on_error, e)
            break
        except Exception as e:
            await self._fire(self.on_error, e)
            if self._stop_requested:
                break
            await self._fire(self.on_reconnecting)
            await asyncio.sleep(5)
    self._running = False
    await self._fire(self.on_disconnected)

if not hasattr(ICQClient, "run"):
    ICQClient.run = _client_run

active_clients: Dict[WebSocket, ICQClient] = {}
AVATAR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "avatars")
os.makedirs(AVATAR_DIR, exist_ok=True)
AVATAR_MAX_BYTES = 6 * 1024 * 1024  
AVATAR_OUTPUT_SIZE = 512
UIN_RE = re.compile(r"^\d{4,12}$")
avatar_sessions: Dict[str, str] = {}

def _avatar_token_ok(token: str, uin: str) -> bool:
    expected = avatar_sessions.get(token)
    return expected is not None and hmac.compare_digest(expected, uin)

def _safe_uin(uin: str) -> str:
    if not UIN_RE.match(uin):
        raise HTTPException(400, "Некорректный UIN")
    return uin

def _avatar_path(uin: str) -> str:
    return os.path.join(AVATAR_DIR, f"{uin}.jpg")

@app.get("/api/avatar/{uin}")
async def get_avatar(uin: str, request: Request):
    uin = _safe_uin(uin)
    path = _avatar_path(uin)
    if not os.path.isfile(path):
        raise HTTPException(404, "Аватарка не загружена")
    st = os.stat(path)
    etag = f'"{int(st.st_mtime_ns)}-{st.st_size}"'
    headers = {"Cache-Control": "no-cache", "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return FileResponse(path, media_type="image/jpeg", headers=headers)

@app.post("/api/avatar/{uin}")
async def upload_avatar(uin: str, token: str = Form(...), file: UploadFile = File(...)):
    uin = _safe_uin(uin)
    if not _avatar_token_ok(token, uin):
        raise HTTPException(403, "Нет доступа к этому UIN")
    data = await file.read(AVATAR_MAX_BYTES + 1)
    if len(data) > AVATAR_MAX_BYTES:
        raise HTTPException(413, "Файл слишком большой")
    try:
        Image.open(io.BytesIO(data)).verify()
        img = Image.open(io.BytesIO(data))
        img.load()
        img = img.convert("RGB")
    except Exception:
        raise HTTPException(400, "Файл повреждён или это не изображение")
    w, h = img.size
    if w < 32 or h < 32:
        raise HTTPException(400, "Изображение слишком маленькое")
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.resize((AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE), Image.LANCZOS)
    out_path = _avatar_path(uin)
    tmp_path = out_path + f".tmp{secrets.token_hex(4)}"
    img.save(tmp_path, "JPEG", quality=88)
    os.replace(tmp_path, out_path)  
    return {"success": True}

@app.delete("/api/avatar/{uin}")
async def delete_avatar(uin: str, token: str):
    uin = _safe_uin(uin)
    if not _avatar_token_ok(token, uin):
        raise HTTPException(403, "Нет доступа к этому UIN")
    path = _avatar_path(uin)
    if os.path.isfile(path):
        os.remove(path)
    return {"success": True}

def contact_to_dict(c: Contact) -> dict:
    return {
        "uin": c.uin,
        "name": c.name,
        "display_name": c.display_name,
        "group_id": c.group_id,
        "item_id": c.item_id,
        "status": c.status.name,
        "status_label": c.status.label,
        "status_msg": c.status_msg,
        "client": c.client,
        "xstatus": c.xstatus,
        "xstatus_msg": c.xstatus_msg,
        "is_online": c.is_online,
        "pending_auth": c.pending_auth,
    }

def message_to_dict(m: Message) -> dict:
    return {
        "sender_uin": m.sender_uin,
        "text": m.text,
        "timestamp": m.timestamp,
        "is_outgoing": m.is_outgoing,
    }

def user_info_to_dict(i: UserInfo) -> dict:
    return {
        "uin": i.uin,
        "nick": i.nick,
        "first_name": i.first_name,
        "last_name": i.last_name,
        "email": i.email,
        "city": i.city,
        "state": i.state,
        "phone": i.phone,
        "fax": i.fax,
        "address": i.address,
        "cell_phone": i.cell_phone,
        "age": i.age,
        "gender": i.gender,
        "home_page": i.home_page,
        "birthday": i.birthday,
        "about": i.about,
        "work_city": i.work_city,
        "work_state": i.work_state,
        "work_phone": i.work_phone,
        "work_fax": i.work_fax,
        "work_addr": i.work_addr,
        "work_name": i.work_name,
        "work_dep": i.work_dep,
        "work_pos": i.work_pos,
        "auth_required": i.auth_required,
        "full_name": i.full_name,
    }

def dict_to_user_info(d: dict) -> UserInfo:
    i = UserInfo()
    for k, v in d.items():
        if hasattr(i, k):
            setattr(i, k, v)
    return i

def search_result_to_dict(s: SearchResult) -> dict:
    return {
        "uin": s.uin,
        "nick": s.nick,
        "first_name": s.first_name,
        "last_name": s.last_name,
        "email": s.email,
        "auth_req": s.auth_req,
        "online": s.online,
        "gender": s.gender,
        "age": s.age,
    }

@app.get("/", response_class=HTMLResponse)
async def index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.get("/sw.js")
async def service_worker():
    return FileResponse("static/sw.js", media_type="application/javascript")

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    origin = ws.headers.get("origin")
    if not _origin_allowed(origin):
        log.warning(f"WS отклонён: недопустимый Origin {origin!r}")
        await ws.close(code=1008)
        return
    await ws.accept()
    client: Optional[ICQClient] = None
    captcha_answer: Optional[int] = None
    avatar_token: Optional[str] = None
    async def emit(event: str, **kwargs):
        try:
            await ws.send_json({"event": event, **kwargs})
        except Exception:
            pass
    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            cmd = msg.get("cmd")
            if cmd == "connect":
                if client:
                    client._stop_requested = True
                    await client._disconnect()
                if avatar_token:
                    avatar_sessions.pop(avatar_token, None)
                client = ICQClient(msg["uin"], msg["password"])
                avatar_token = secrets.token_urlsafe(32)
                requested_status = msg.get("status")
                if requested_status:
                    st = getattr(Status, str(requested_status).upper(), None)
                    if st is not None:
                        await client.set_status(st, msg.get("status_message", ""))
                requested_xstatus = msg.get("xstatus")
                if requested_xstatus:
                    await client.set_xstatus(requested_xstatus, msg.get("xstatus_title", ""), msg.get("xstatus_desc", ""))
                def _on_connected(_uin=str(msg["uin"]), _token=avatar_token):
                    avatar_sessions[_token] = _uin
                    return asyncio.create_task(emit("connected", avatar_token=_token, uin=_uin))
                client.on_connected = _on_connected
                client.on_disconnected = lambda: asyncio.create_task(emit("disconnected"))
                client.on_reconnecting = lambda: asyncio.create_task(emit("reconnecting"))
                client.on_error = lambda e: asyncio.create_task(emit("error", message=str(e)))
                client.on_roster = lambda g, c: asyncio.create_task(
                    emit("roster", groups=[{"group_id": x.group_id, "name": x.name} for x in g],
                         contacts=[contact_to_dict(x) for x in c])
                )
                client.on_contact_online = lambda c: asyncio.create_task(emit("contact_online", contact=contact_to_dict(c)))
                client.on_contact_offline = lambda c: asyncio.create_task(emit("contact_offline", contact=contact_to_dict(c)))
                client.on_contact_status = lambda c: asyncio.create_task(emit("contact_status", contact=contact_to_dict(c)))
                client.on_message = lambda m: asyncio.create_task(emit("message", message=message_to_dict(m)))
                client.on_typing = lambda u, t: asyncio.create_task(emit("typing", uin=u, is_typing=t))
                client.on_xstatus_updated = lambda c: asyncio.create_task(emit("xstatus_updated", contact=contact_to_dict(c)))
                client.on_user_info = lambda i: asyncio.create_task(emit("user_info", info=user_info_to_dict(i)))
                client.on_my_info = lambda i: asyncio.create_task(emit("my_info", info=user_info_to_dict(i)))
                client.on_search_result = lambda r: asyncio.create_task(emit("search_result", result=search_result_to_dict(r)))
                client.on_search_done = lambda r: asyncio.create_task(emit("search_done", results=[search_result_to_dict(x) for x in r]))
                client.on_offline_message = lambda m: asyncio.create_task(emit("offline_message", message=message_to_dict(m)))
                client.on_auth_request = lambda u, m: asyncio.create_task(emit("auth_request", uin=u, message=m))
                client.on_auth_reply = lambda u, g, m: asyncio.create_task(emit("auth_reply", uin=u, granted=g, message=m))
                client.on_you_were_added = lambda u: asyncio.create_task(emit("you_were_added", uin=u))
                active_clients[ws] = client
                asyncio.create_task(client.run())
            elif cmd == "disconnect":
                if client:
                    client._stop_requested = True
                    await client._disconnect()
                    client = None
                if avatar_token:
                    avatar_sessions.pop(avatar_token, None)
                    avatar_token = None
            elif cmd == "get_captcha":
                a, b = random.randint(1, 20), random.randint(1, 20)
                op = random.choice(["+", "-"])
                if op == "-" and a < b:
                    a, b = b, a  
                captcha_answer = (a + b) if op == "+" else (a - b)
                await emit("captcha", question=f"Сколько будет {a} {op} {b}?")
            elif cmd == "register":
                given = str(msg.get("captcha_answer", "")).strip()
                if captcha_answer is None or given != str(captcha_answer):
                    await emit("register_result", success=False,
                               message="Неверный ответ на проверочный вопрос. Попробуйте ещё раз.")
                else:
                    captcha_answer = None  
                    try:
                        reg = ICQRegistration()
                        new_uin = await reg.register(msg["password"])
                        await emit("register_result", success=True, uin=str(new_uin))
                    except Exception as e:
                        await emit("register_result", success=False, message=str(e))
            elif cmd == "send_message" and client:
                await client.send_message(msg["uin"], msg["text"])
            elif cmd == "send_typing" and client:
                await client.send_typing(msg["uin"], msg.get("is_typing", True))
            elif cmd == "set_status" and client:
                st = getattr(Status, msg.get("status", "FREE").upper(), Status.FREE)
                await client.set_status(st, msg.get("message", ""))
            elif cmd == "set_xstatus" and client:
                await client.set_xstatus(msg.get("name", ""), msg.get("title", ""), msg.get("desc", ""))
            elif cmd == "request_user_info" and client:
                await client.request_user_info(msg["uin"])
            elif cmd == "request_my_info" and client:
                await client.request_my_info()
            elif cmd == "save_my_info" and client:
                ok = await client.save_my_info(dict_to_user_info(msg.get("info", {})))
                await emit("save_my_info_result", success=ok)
            elif cmd == "search_users" and client:
                await client.search_users(
                    uin=msg.get("uin", ""),
                    nick=msg.get("nick", ""),
                    first_name=msg.get("first_name", ""),
                    last_name=msg.get("last_name", ""),
                    email=msg.get("email", ""),
                    city=msg.get("city", ""),
                    keyword=msg.get("keyword", ""),
                    only_online=msg.get("only_online", False),
                )
            elif cmd == "add_contact" and client:
                uin = msg["uin"]
                nick = msg.get("nick", "")
                group_id = msg.get("group_id", 0)
                try:
                    prev_on_search_result = client.on_search_result
                    prev_on_search_done = client.on_search_done
                    client.on_search_result = None
                    client.on_search_done = None
                    try:
                        search_results = await client.search_users(uin=uin, timeout=6.0)
                    finally:
                        client.on_search_result = prev_on_search_result
                        client.on_search_done = prev_on_search_done
                except Exception:
                    search_results = None
                if search_results is not None and not any(str(r.uin) == str(uin) for r in search_results):
                    log.info(f"add_contact: UIN {uin} не найден поиском, отказываем")
                    await emit("add_contact_result", success=False, auth_requested=False,
                               contact=None, error="UIN не найден на сервере ICQ")
                    continue
                auth_required = False
                info_fut = asyncio.get_event_loop().create_future()
                prev_on_user_info = client.on_user_info
                def _capture_info(info, _uin=uin, _fut=info_fut):
                    if info.uin == _uin and not _fut.done():
                        _fut.set_result(info)
                client.on_user_info = _capture_info
                try:
                    await client.request_user_info(uin)
                    info = await asyncio.wait_for(info_fut, timeout=6.0)
                    auth_required = bool(info.auth_required)
                except asyncio.TimeoutError:
                    log.warning(f"add_contact: анкета {uin} не пришла за 6с, считаем auth_required=False")
                finally:
                    client.on_user_info = prev_on_user_info
                result = await client.add_contact(uin, nick, group_id, auth_required)
                auth_requested = (result == "auth_required")
                success = bool(result)
                contact_data = contact_to_dict(client.contacts[uin]) if success and uin in client.contacts else None
                await emit("add_contact_result", success=success, auth_requested=auth_requested, contact=contact_data)
            elif cmd == "remove_contact" and client:
                uin = msg["uin"]
                ok = await client.remove_contact(uin)
                await emit("remove_contact_result", success=ok, uin=uin)
            elif cmd == "rename_contact" and client:
                uin = msg["uin"]
                ok = await client.rename_contact(uin, msg["new_nick"])
                contact_data = contact_to_dict(client.contacts[uin]) if ok and uin in client.contacts else None
                await emit("rename_contact_result", success=ok, uin=uin, contact=contact_data)
            elif cmd == "move_contact" and client:
                uin = msg["uin"]
                ok = await client.move_contact(uin, msg["new_group_id"])
                contact_data = contact_to_dict(client.contacts[uin]) if ok and uin in client.contacts else None
                await emit("move_contact_result", success=ok, uin=uin, contact=contact_data)
            elif cmd == "create_group" and client:
                ok, grp = await client.create_group(msg["name"])
                await emit("create_group_result", success=ok,
                           group={"group_id": grp.group_id, "name": grp.name} if grp else None)
            elif cmd == "delete_group" and client:
                gid = msg["group_id"]
                grp = client.groups.get(gid)
                is_general = (gid == 0) or (grp and grp.name.strip().lower() == "general")
                if is_general:
                    log.warning(f"delete_group: попытка удалить группу General (group_id={gid}) отклонена")
                    await emit("delete_group_result", success=False)
                else:
                    ok = await client.delete_group(gid)
                    await emit("delete_group_result", success=ok)
            elif cmd == "send_auth_request" and client:
                await client.send_auth_request(msg["uin"], msg.get("message", ""))
            elif cmd == "send_auth_reply" and client:
                await client.send_auth_reply(msg["uin"], msg["granted"], msg.get("message", ""))
            elif cmd == "request_xstatus" and client:
                await client.request_xstatus(msg["uin"])
            elif cmd == "change_password" and client:
                ok = await client.change_password(
                    msg["new_password"],
                    msg.get("current_password") or None,
                )
                await emit("change_password_result", success=ok)
            elif cmd == "set_require_auth" and client:
                ok = await client.set_require_auth(msg["require"])
                await emit("set_require_auth_result", success=ok)
            elif cmd == "request_offline_messages" and client:
                await client.request_offline_messages()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.error(f"WS error: {e}")
    finally:
        if client:
            client._stop_requested = True
            try:
                await client._disconnect()
            except Exception:
                pass
        if avatar_token:
            avatar_sessions.pop(avatar_token, None)
        active_clients.pop(ws, None)

if __name__ == "__main__":
    import uvicorn
    if os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE):
        log.info(f"Запуск с HTTPS на порту {SERVER_SSL_PORT}")
        log.info(f"Сертификат: {CERT_FILE}")
        log.info(f"Ключ: {KEY_FILE}")
        try:
            import subprocess
            result = subprocess.run(
                ["openssl", "x509", "-in", CERT_FILE, "-text", "-noout"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                log.info("Сертификат валиден")
            else:
                log.warning("Сертификат может быть невалидным")
        except Exception as e:
            log.warning(f"Не удалось проверить сертификат: {e}")
        uvicorn.run(
            app,
            host=SERVER_HOST,
            port=SERVER_SSL_PORT,
            ssl_keyfile=KEY_FILE,
            ssl_certfile=CERT_FILE
        )
    else:
        log.warning(f"Сертификаты не найдены:")
        log.warning(f"  {CERT_FILE}")
        log.warning(f"  {KEY_FILE}")
        log.warning(f"Запуск без HTTPS на порту {SERVER_PORT}")
        if DOMAIN != "localhost":
            log.info(f"Для получения сертификатов выполните:")
            log.info(f"  sudo certbot certonly --standalone -d {DOMAIN}")
        uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT)