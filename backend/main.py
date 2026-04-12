# backend/main.py
import os
import sqlite3
import psycopg
from psycopg.rows import dict_row
import secrets
import hashlib
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="KOTTU Multi-Shop Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class RegisterData(BaseModel):
    name: str = ""
    phone: str
    password: str
    role: str = "customer"
    shop_name: str = ""

class LoginData(BaseModel):
    phone: str
    password: str

# 🔁 Auto-detect: PostgreSQL if DATABASE_URL exists, else SQLite
USE_POSTGRES = os.getenv("DATABASE_URL") is not None

def get_db():
    if USE_POSTGRES:
        db_url = os.getenv("DATABASE_URL")
        conn = psycopg.connect(db_url, row_factory=dict_row)
        conn.autocommit = False
        return conn.cursor(), conn
    else:
        # Local SQLite mode
        conn = sqlite3.connect("kottu.db")
        conn.row_factory = sqlite3.Row
        return conn, None  # SQLite doesn't need separate cursor

def init_db():
    if USE_POSTGRES:
        # PostgreSQL initialization
        cur, conn = get_db()
        cur.execute("CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT, phone TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'customer', shop_name TEXT, token TEXT)")
        cur.execute("CREATE TABLE IF NOT EXISTS inventory (id SERIAL PRIMARY KEY, shop_id INTEGER, name TEXT, price INTEGER, stock INTEGER DEFAULT 0)")
        cur.execute("CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, shop_id INTEGER, item_id INTEGER, customer_name TEXT, quantity INTEGER, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        cur.execute("CREATE TABLE IF NOT EXISTS udhaar (id SERIAL PRIMARY KEY, shop_id INTEGER, customer_name TEXT, amount REAL, type TEXT CHECK(type IN ('credit','payment')), note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        cur.execute("CREATE TABLE IF NOT EXISTS sales_history (id SERIAL PRIMARY KEY, shop_id INTEGER, item_id INTEGER, quantity INTEGER, sale_date DATE DEFAULT CURRENT_DATE)")
        conn.commit()
        cur.close()
        conn.close()
    else:
        # SQLite initialization (for local development)
        conn, _ = get_db()
        conn.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'customer', shop_name TEXT, token TEXT)")
        conn.execute("CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, name TEXT, price INTEGER, stock INTEGER DEFAULT 0)")
        conn.execute("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, item_id INTEGER, customer_name TEXT, quantity INTEGER, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("CREATE TABLE IF NOT EXISTS udhaar (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, customer_name TEXT, amount REAL, type TEXT CHECK(type IN ('credit','payment')), note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("CREATE TABLE IF NOT EXISTS sales_history (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, item_id INTEGER, quantity INTEGER, sale_date DATE DEFAULT CURRENT_DATE)")
        conn.commit()
        conn.close()
    print(f"✅ Database initialized ({'PostgreSQL' if USE_POSTGRES else 'SQLite'})")

@app.on_event("startup")
def on_startup():
    init_db()

class ConnManager:
    def __init__(self): self.active = []
    async def connect(self, ws): await ws.accept(); self.active.append(ws)
    def disconnect(self, ws):
        if ws in self.active: self.active.remove(ws)
    async def broadcast(self, msg):
        rem = []
        for c in self.active:
            try: await c.send_json(msg)
            except: rem.append(c)
        for c in rem: self.disconnect(c)
manager = ConnManager()

# ==================== AUTH ====================
@app.post("/api/auth/register")
def register( RegisterData):
    pwd = hashlib.sha256(data.password.encode()).hexdigest()
    token = secrets.token_urlsafe(32)
    try:
        if USE_POSTGRES:
            cur, conn = get_db()
            cur.execute("INSERT INTO users (name, phone, password, role, shop_name, token) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
                        (data.name, data.phone, pwd, data.role, data.shop_name, token))
            uid = cur.fetchone()['id']
            conn.commit(); cur.close(); conn.close()
        else:
            conn, _ = get_db()
            conn.execute("INSERT INTO users (name, phone, password, role, shop_name, token) VALUES (?,?,?,?,?,?)",
                        (data.name, data.phone, pwd, data.role, data.shop_name, token))
            uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.commit(); conn.close()
        return {"status": "success", "user_id": uid, "role": data.role, "token": token}
    except Exception as e: return {"error": str(e)}

@app.post("/api/auth/login")
def login( LoginData):
    pwd = hashlib.sha256(data.password.encode()).hexdigest()
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("SELECT id, name, role, shop_name, token FROM users WHERE phone = %s AND password = %s", (data.phone, pwd))
        user = cur.fetchone()
        cur.close(); conn.close()
    else:
        conn, _ = get_db()
        user = conn.execute("SELECT id, name, role, shop_name, token FROM users WHERE phone = ? AND password = ?", (data.phone, pwd)).fetchone()
        conn.close()
    if user:
        if USE_POSTGRES:
            return {"status": "success", **dict(user)}
        else:
            return {"status": "success", "id": user["id"], "name": user["name"], "role": user["role"], "shop_name": user["shop_name"], "token": user["token"]}
    return {"error": "Invalid credentials"}

# ==================== SHOP LIST ====================
@app.get("/api/shops")
def get_shops():
    if USE_POSTGRES:
        cur, conn = get_db()
        shops = [dict(r) for r in cur.execute("SELECT id, name, shop_name FROM users WHERE role='shopkeeper'").fetchall()]
        cur.close(); conn.close()
        return shops
    else:
        conn, _ = get_db()
        shops = [dict(r) for r in conn.execute("SELECT id, name, shop_name FROM users WHERE role='shopkeeper'").fetchall()]
        conn.close()
        return shops

# ==================== INVENTORY ====================
@app.get("/api/inventory")
def get_inventory(shop_id: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        res = [dict(r) for r in cur.execute("SELECT id, name, price, stock FROM inventory WHERE shop_id=%s ORDER BY name", (shop_id,)).fetchall()]
        cur.close(); conn.close()
        return res
    else:
        conn, _ = get_db()
        res = [dict(r) for r in conn.execute("SELECT id, name, price, stock FROM inventory WHERE shop_id=? ORDER BY name", (shop_id,)).fetchall()]
        conn.close()
        return res

@app.post("/api/inventory/add")
def add_item(shop_id: int, name: str, price: int, stock: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("INSERT INTO inventory (shop_id, name, price, stock) VALUES (%s,%s,%s,%s)", (shop_id, name, price, stock))
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("INSERT INTO inventory (shop_id, name, price, stock) VALUES (?,?,?,?)", (shop_id, name, price, stock))
        conn.commit(); conn.close()
    return {"status": "added"}

@app.post("/api/inventory/update")
async def update_stock(shop_id: int, item_id: int, stock: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("UPDATE inventory SET stock = %s WHERE id = %s AND shop_id = %s", (stock, item_id, shop_id))
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("UPDATE inventory SET stock = ? WHERE id = ? AND shop_id = ?", (stock, item_id, shop_id))
        conn.commit(); conn.close()
    return {"status": "updated"}

# ==================== ORDERS ====================
@app.post("/api/orders")
async def place_order(shop_id: int, item_id: int, customer_name: str, quantity: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("SELECT name, stock FROM inventory WHERE id = %s AND shop_id = %s", (item_id, shop_id))
        item = cur.fetchone()
        if not item or item['stock'] < quantity: cur.close(); conn.close(); return {"error": "Insufficient stock"}
        new = item['stock'] - quantity
        cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (new, item_id))
        cur.execute("INSERT INTO orders (shop_id, item_id, customer_name, quantity) VALUES (%s,%s,%s,%s)", (shop_id, item_id, customer_name, quantity))
        cur.execute("INSERT INTO sales_history (shop_id, item_id, quantity) VALUES (%s,%s,%s)", (shop_id, item_id, quantity))
        conn.commit(); cur.close(); conn.close()
        return {"status": "order_placed", "item": item['name']}
    else:
        conn, _ = get_db()
        row = conn.execute("SELECT name, stock FROM inventory WHERE id = ? AND shop_id = ?", (item_id, shop_id)).fetchone()
        if not row or row["stock"] < quantity: conn.close(); return {"error": "Insufficient stock"}
        new = row["stock"] - quantity
        conn.execute("UPDATE inventory SET stock = ? WHERE id = ?", (new, item_id))
        conn.execute("INSERT INTO orders (shop_id, item_id, customer_name, quantity) VALUES (?, ?, ?, ?)", (shop_id, item_id, customer_name, quantity))
        conn.execute("INSERT INTO sales_history (shop_id, item_id, quantity) VALUES (?, ?, ?)", (shop_id, item_id, quantity))
        conn.commit(); conn.close()
        return {"status": "order_placed", "item": row["name"]}

@app.get("/api/orders")
def get_orders(shop_id: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        res = [dict(r) for r in cur.execute("SELECT * FROM orders WHERE shop_id=%s ORDER BY created_at DESC LIMIT 50", (shop_id,)).fetchall()]
        cur.close(); conn.close()
        return res
    else:
        conn, _ = get_db()
        res = [dict(r) for r in conn.execute("SELECT * FROM orders WHERE shop_id=? ORDER BY created_at DESC LIMIT 50", (shop_id,)).fetchall()]
        conn.close()
        return res

# ==================== UDHAAR & ALERTS ====================
@app.post("/api/udhaar")
async def add_udhaar(shop_id: int, customer_name: str, amount: float, type: str, note: str = ""):
    try:
        if USE_POSTGRES:
            cur, conn = get_db()
            cur.execute("INSERT INTO udhaar (shop_id, customer_name, amount, type, note) VALUES (%s,%s,%s,%s,%s)", (shop_id, customer_name.strip(), amount, type, note))
            conn.commit(); cur.close(); conn.close()
        else:
            conn, _ = get_db()
            conn.execute("INSERT INTO udhaar (shop_id, customer_name, amount, type, note) VALUES (?,?,?,?,?)", (shop_id, customer_name.strip(), amount, type, note))
            conn.commit(); conn.close()
        return {"status": "recorded"}
    except Exception as e: return {"error": str(e)}

@app.get("/api/customers")
def get_udhaar_ledger(shop_id: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        res = [dict(r) for r in cur.execute("SELECT customer_name, SUM(CASE WHEN type='credit' THEN amount ELSE -amount END) as balance FROM udhaar WHERE shop_id=%s GROUP BY customer_name ORDER BY customer_name", (shop_id,)).fetchall()]
        cur.close(); conn.close()
        return res
    else:
        conn, _ = get_db()
        res = [dict(r) for r in conn.execute("SELECT customer_name, SUM(CASE WHEN type='credit' THEN amount ELSE -amount END) as balance FROM udhaar WHERE shop_id=? GROUP BY customer_name ORDER BY customer_name", (shop_id,)).fetchall()]
        conn.close()
        return res

@app.get("/api/alerts")
def get_alerts(shop_id: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        alerts = []; today = datetime.now().date(); last_w = today - timedelta(days=7); two_w = last_w - timedelta(days=7)
        items = cur.execute("SELECT id, name, stock FROM inventory WHERE shop_id=%s", (shop_id,)).fetchall()
        for i in items:
            cur.execute("SELECT COALESCE(SUM(quantity),0) as t FROM sales_history WHERE shop_id=%s AND item_id=%s AND sale_date>=%s", (shop_id, i['id'], last_w))
            this = cur.fetchone()['t']
            cur.execute("SELECT COALESCE(SUM(quantity),0) as t FROM sales_history WHERE shop_id=%s AND item_id=%s AND sale_date BETWEEN %s AND %s", (shop_id, i['id'], two_w, last_w))
            prev = cur.fetchone()['t']
            if prev > 0 and this > prev * 1.3: alerts.append({"type":"spike","item":i['name'],"message":f"📈 {i['name']} sales up {int((this/prev-1)*100)}%","priority":"high" if i['stock']<10 else "medium"})
            elif i['stock'] < 5 and this > 10: alerts.append({"type":"low","item":i['name'],"message":f"⚠️ Only {i['stock']} {i['name']} left!","priority":"high"})
        cur.close(); conn.close()
        return alerts
    else:
        conn, _ = get_db()
        alerts = []; today = datetime.now().date(); last_w = today - timedelta(days=7); two_w = last_w - timedelta(days=7)
        items = conn.execute("SELECT id, name, stock FROM inventory WHERE shop_id=?", (shop_id,)).fetchall()
        for i in items:
            this = conn.execute("SELECT SUM(quantity) as t FROM sales_history WHERE shop_id=? AND item_id=? AND sale_date>=?", (shop_id, i['id'], last_w)).fetchone()
            this = this['t'] if this else 0
            prev = conn.execute("SELECT SUM(quantity) as t FROM sales_history WHERE shop_id=? AND item_id=? AND sale_date BETWEEN ? AND ?", (shop_id, i['id'], two_w, last_w)).fetchone()
            prev = prev['t'] if prev else 0
            if prev > 0 and this > prev * 1.3: alerts.append({"type":"spike","item":i['name'],"message":f"📈 {i['name']} sales up {int((this/prev-1)*100)}%","priority":"high" if i['stock']<10 else "medium"})
            elif i['stock'] < 5 and this > 10: alerts.append({"type":"low","item":i['name'],"message":f"⚠️ Only {i['stock']} {i['name']} left!","priority":"high"})
        conn.close()
        return alerts

@app.websocket("/ws")
async def ws_ep(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect: manager.disconnect(ws)

@app.get("/")
def root(): return {"status": "✅ KOTTU Backend is running", "mode": "PostgreSQL" if USE_POSTGRES else "SQLite"}