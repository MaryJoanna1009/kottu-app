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

app = FastAPI(title="KOTTU Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Pydantic Models for JSON Auth
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
        conn = sqlite3.connect("kottu.db")
        conn.row_factory = sqlite3.Row
        return conn, None  # SQLite doesn't need cursor

def init_db():
    if USE_POSTGRES:
        # PostgreSQL initialization
        cur, conn = get_db()
        cur.execute("CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT, phone TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'customer', shop_name TEXT, token TEXT)")
        cur.execute("CREATE TABLE IF NOT EXISTS inventory (id SERIAL PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0)")
        cur.execute("CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, item_id INTEGER, customer_name TEXT, quantity INTEGER, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        cur.execute("CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, name TEXT UNIQUE, phone TEXT, credit_limit INTEGER DEFAULT 500)")
        cur.execute("CREATE TABLE IF NOT EXISTS udhaar (id SERIAL PRIMARY KEY, customer_id INTEGER, amount REAL, type TEXT CHECK(type IN ('credit','payment')), note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        cur.execute("CREATE TABLE IF NOT EXISTS sales_history (id SERIAL PRIMARY KEY, item_id INTEGER, quantity INTEGER, sale_date DATE DEFAULT CURRENT_DATE)")
        
        cur.execute("SELECT COUNT(*) as count FROM inventory")
        if cur.fetchone()['count'] == 0:
            for i in [(1, "Milk (1L)", 60, 50), (2, "Bread", 40, 30), (3, "Eggs (6)", 45, 20), (4, "Atta (5kg)", 220, 15), (5, "Sugar (1kg)", 55, 10), (6, "Tea Powder", 85, 10)]:
                cur.execute("INSERT INTO inventory (id, name, price, stock) VALUES (%s,%s,%s,%s)", i)
        cur.execute("SELECT COUNT(*) as count FROM customers")
        if cur.fetchone()['count'] == 0:
            for c in [("Rahul", "9876543210", 500), ("Payamma", "9876543211", 1000), ("Suresh", "9876543212", 300)]:
                cur.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (%s,%s,%s)", c)
        conn.commit()
        cur.close()
        conn.close()
    else:
        # SQLite initialization (for local development)
        conn, _ = get_db()
        conn.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'customer', shop_name TEXT, token TEXT)")
        conn.execute("CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY, name TEXT, price INTEGER, stock INTEGER)")
        conn.execute("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, customer_name TEXT, quantity INTEGER, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, phone TEXT, credit_limit INTEGER DEFAULT 500)")
        conn.execute("CREATE TABLE IF NOT EXISTS udhaar (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, amount REAL, type TEXT CHECK(type IN ('credit','payment')), note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("CREATE TABLE IF NOT EXISTS sales_history (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, quantity INTEGER, sale_date DATE DEFAULT CURRENT_DATE)")
        
        cursor = conn.execute("SELECT COUNT(*) FROM inventory")
        if cursor.fetchone()[0] == 0:
            items = [(1, "Milk (1L)", 60, 50), (2, "Bread", 40, 30), (3, "Eggs (6)", 45, 20), (4, "Atta (5kg)", 220, 15), (5, "Sugar (1kg)", 55, 10), (6, "Tea Powder", 85, 10)]
            conn.executemany("INSERT INTO inventory VALUES (?,?,?,?)", items)
        cursor = conn.execute("SELECT COUNT(*) FROM customers")
        if cursor.fetchone()[0] == 0:
            customers = [("Rahul", "9876543210", 500), ("Payamma", "9876543211", 1000), ("Suresh", "9876543212", 300)]
            conn.executemany("INSERT INTO customers (name, phone, credit_limit) VALUES (?,?,?)", customers)
        conn.commit()
        conn.close()
    print("✅ Database initialized")

@app.on_event("startup")
def on_startup():
    init_db()

class ConnectionManager:
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
manager = ConnectionManager()

# ==================== AUTH (JSON) ====================
@app.post("/api/auth/register")
def register(data: RegisterData):
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
def login(data: LoginData):
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

# ==================== CORE APIS ====================
@app.get("/api/inventory")
def get_inventory():
    if USE_POSTGRES:
        cur, conn = get_db()
        res = [dict(r) for r in cur.execute("SELECT * FROM inventory ORDER BY name").fetchall()]
        cur.close(); conn.close()
        return res
    else:
        conn, _ = get_db()
        res = [dict(r) for r in conn.execute("SELECT * FROM inventory ORDER BY name").fetchall()]
        conn.close()
        return res

@app.post("/api/inventory/update")
async def update_stock(item_id: int, stock: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (stock, item_id))
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("UPDATE inventory SET stock = ? WHERE id = ?", (stock, item_id))
        conn.commit(); conn.close()
    await manager.broadcast({"type": "stock_update", "item_id": item_id, "new_stock": stock})
    return {"status": "updated"}

@app.post("/api/orders")
async def place_order(item_id: int, customer_name: str, quantity: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("SELECT name, stock FROM inventory WHERE id = %s", (item_id,))
        item = cur.fetchone()
        if not item or item['stock'] < quantity: cur.close(); conn.close(); return {"error": "Insufficient stock"}
        new = item['stock'] - quantity
        cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (new, item_id))
        cur.execute("INSERT INTO orders (item_id, customer_name, quantity) VALUES (%s,%s,%s)", (item_id, customer_name, quantity))
        cur.execute("INSERT INTO sales_history (item_id, quantity) VALUES (%s,%s)", (item_id, quantity))
        conn.commit(); cur.close(); conn.close()
        await manager.broadcast({"type": "new_order", "item_id": item_id, "new_stock": new})
        return {"status": "order_placed", "item": item['name']}
    else:
        conn, _ = get_db()
        row = conn.execute("SELECT name, stock FROM inventory WHERE id = ?", (item_id,)).fetchone()
        if not row or row["stock"] < quantity: conn.close(); return {"error": "Insufficient stock"}
        new = row["stock"] - quantity
        conn.execute("UPDATE inventory SET stock = ? WHERE id = ?", (new, item_id))
        conn.execute("INSERT INTO orders (item_id, customer_name, quantity) VALUES (?, ?, ?)", (item_id, customer_name, quantity))
        conn.execute("INSERT INTO sales_history (item_id, quantity) VALUES (?, ?)", (item_id, quantity))
        conn.commit(); conn.close()
        await manager.broadcast({"type": "new_order", "item_id": item_id, "new_stock": new})
        return {"status": "order_placed", "item": row["name"]}

@app.get("/api/orders")
def get_orders():
    if USE_POSTGRES:
        cur, conn = get_db()
        res = [dict(r) for r in cur.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 50").fetchall()]
        cur.close(); conn.close()
        return res
    else:
        conn, _ = get_db()
        res = [dict(r) for r in conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 50").fetchall()]
        conn.close()
        return res

@app.get("/api/customers")
def get_customers():
    if USE_POSTGRES:
        cur, conn = get_db()
        custs = [dict(r) for r in cur.execute("SELECT * FROM customers ORDER BY name").fetchall()]
        for c in custs:
            cur.execute("SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END), 0) as bal FROM udhaar WHERE customer_id=%s", (c['id'],))
            c['balance'] = cur.fetchone()['bal']
        cur.close(); conn.close()
        return custs
    else:
        conn, _ = get_db()
        custs = [dict(r) for r in conn.execute("SELECT * FROM customers ORDER BY name").fetchall()]
        for c in custs:
            ledger = conn.execute("SELECT SUM(CASE WHEN type='credit' THEN amount ELSE -amount END) as bal FROM udhaar WHERE customer_id=?", (c['id'],)).fetchone()
            c['balance'] = ledger['bal'] if ledger else 0
        conn.close()
        return custs

@app.post("/api/udhaar")
async def add_udhaar(customer_name: str, amount: float, type: str, note: str = ""):
    try:
        if USE_POSTGRES:
            cur, conn = get_db()
            cur.execute("SELECT id FROM customers WHERE name = %s", (customer_name.strip(),))
            cust = cur.fetchone()
            if not cust:
                cur.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (%s,%s,%s)", (customer_name.strip(), "", 500))
                conn.commit()
                cur.execute("SELECT id FROM customers WHERE name = %s", (customer_name.strip(),))
                cust = cur.fetchone()
            if type not in ('credit','payment'): return {"error": "Invalid type"}
            cur.execute("INSERT INTO udhaar (customer_id, amount, type, note) VALUES (%s,%s,%s,%s)", (cust['id'], amount, type, note))
            conn.commit(); cur.close(); conn.close()
        else:
            conn, _ = get_db()
            cust = conn.execute("SELECT id FROM customers WHERE name = ?", (customer_name.strip(),)).fetchone()
            if not cust:
                conn.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (?, ?, ?)", (customer_name.strip(), "", 500))
                conn.commit()
                cust = conn.execute("SELECT id FROM customers WHERE name = ?", (customer_name.strip(),)).fetchone()
            if type not in ('credit','payment'): return {"error": "Invalid type"}
            conn.execute("INSERT INTO udhaar (customer_id, amount, type, note) VALUES (?, ?, ?, ?)", (cust['id'], amount, type, note))
            conn.commit(); conn.close()
        await manager.broadcast({"type": "udhaar_update"})
        return {"status": "recorded"}
    except Exception as e: return {"error": str(e)}

@app.get("/api/alerts")
def get_alerts():
    if USE_POSTGRES:
        cur, conn = get_db()
        alerts = []; today = datetime.now().date(); last_w = today - timedelta(days=7); two_w = last_w - timedelta(days=7)
        cur.execute("SELECT id, name, stock FROM inventory")
        items = cur.fetchall()
        for i in items:
            cur.execute("SELECT COALESCE(SUM(quantity),0) as t FROM sales_history WHERE item_id=%s AND sale_date>=%s", (i['id'], last_w))
            this = cur.fetchone()['t']
            cur.execute("SELECT COALESCE(SUM(quantity),0) as t FROM sales_history WHERE item_id=%s AND sale_date BETWEEN %s AND %s", (i['id'], two_w, last_w))
            prev = cur.fetchone()['t']
            if prev > 0 and this > prev * 1.3: alerts.append({"type":"spike","item":i['name'],"message":f"📈 {i['name']} sales up {int((this/prev-1)*100)}% — restock!","priority":"high" if i['stock']<10 else "medium"})
            elif i['stock'] < 5 and this > 10: alerts.append({"type":"low","item":i['name'],"message":f"⚠️ Only {i['stock']} {i['name']} left!","priority":"high"})
        cur.close(); conn.close()
        return alerts
    else:
        conn, _ = get_db()
        alerts = []; today = datetime.now().date(); last_w = today - timedelta(days=7); two_w = last_w - timedelta(days=7)
        items = conn.execute("SELECT id, name, stock FROM inventory").fetchall()
        for i in items:
            this = conn.execute("SELECT SUM(quantity) as t FROM sales_history WHERE item_id=? AND sale_date>=?", (i['id'], last_w)).fetchone()
            this = this['t'] if this else 0
            prev = conn.execute("SELECT SUM(quantity) as t FROM sales_history WHERE item_id=? AND sale_date BETWEEN ? AND ?", (i['id'], two_w, last_w)).fetchone()
            prev = prev['t'] if prev else 0
            if prev > 0 and this > prev * 1.3: alerts.append({"type":"spike","item":i['name'],"message":f"📈 {i['name']} sales up {int((this/prev-1)*100)}% — restock!","priority":"high" if i['stock']<10 else "medium"})
            elif i['stock'] < 5 and this > 10: alerts.append({"type":"low","item":i['name'],"message":f"⚠️ Only {i['stock']} {i['name']} left!","priority":"high"})
        conn.close()
        return alerts

@app.websocket("/ws")
async def ws_ep(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)

@app.get("/")
def root(): return {"status": "✅ KOTTU Backend is running", "mode": "PostgreSQL" if USE_POSTGRES else "SQLite"}