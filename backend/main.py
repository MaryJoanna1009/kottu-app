# backend/main.py
import os
import sqlite3
import psycopg
from psycopg.rows import dict_row
import secrets
import hashlib
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
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
    address: str = ""

class LoginData(BaseModel):
    phone: str
    password: str

USE_POSTGRES = os.getenv("DATABASE_URL") is not None

def get_db():
    if USE_POSTGRES:
        db_url = os.getenv("DATABASE_URL")
        if not db_url: raise RuntimeError("DATABASE_URL not set")
        conn = psycopg.connect(db_url, row_factory=dict_row)
        conn.autocommit = False
        return conn.cursor(), conn
    else:
        conn = sqlite3.connect("kottu.db")
        conn.row_factory = sqlite3.Row
        return conn, None

def init_db():
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT, phone TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'customer', shop_name TEXT, address TEXT DEFAULT '', token TEXT)")
        cur.execute("CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, shop_id INTEGER, name TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        cur.execute("CREATE TABLE IF NOT EXISTS inventory (id SERIAL PRIMARY KEY, shop_id INTEGER, category_id INTEGER, name TEXT, price INTEGER, stock INTEGER DEFAULT 0)")
        cur.execute("CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, shop_id INTEGER, item_id INTEGER, customer_name TEXT, customer_phone TEXT DEFAULT '', quantity INTEGER, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'customer', shop_name TEXT, address TEXT DEFAULT '', token TEXT)")
        conn.execute("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, name TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, category_id INTEGER, name TEXT, price INTEGER, stock INTEGER DEFAULT 0)")
        conn.execute("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, item_id INTEGER, customer_name TEXT, customer_phone TEXT DEFAULT '', quantity INTEGER, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.commit(); conn.close()
    print(f"✅ Database initialized ({'PostgreSQL' if USE_POSTGRES else 'SQLite'})")

@app.on_event("startup")
def on_startup(): init_db()

# ==================== AUTH ====================
@app.post("/api/auth/register")
def register(data: RegisterData):
    pwd = hashlib.sha256(data.password.encode()).hexdigest()
    token = secrets.token_urlsafe(32)
    try:
        if USE_POSTGRES:
            cur, conn = get_db()
            cur.execute("INSERT INTO users (name, phone, password, role, shop_name, address, token) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                        (data.name, data.phone, pwd, data.role, data.shop_name, data.address, token))
            uid = cur.fetchone()['id']; conn.commit(); cur.close(); conn.close()
        else:
            conn, _ = get_db()
            conn.execute("INSERT INTO users (name, phone, password, role, shop_name, address, token) VALUES (?,?,?,?,?,?,?)",
                        (data.name, data.phone, pwd, data.role, data.shop_name, data.address, token))
            uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]; conn.commit(); conn.close()
        return {"status": "success", "user_id": uid, "role": data.role, "token": token}
    except Exception as e: return {"error": str(e)}

@app.post("/api/auth/login")
def login(data: LoginData):
    pwd = hashlib.sha256(data.password.encode()).hexdigest()
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("SELECT id, name, role, shop_name, address, token FROM users WHERE phone = %s AND password = %s", (data.phone, pwd))
        user = cur.fetchone(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        user = conn.execute("SELECT id, name, role, shop_name, address, token FROM users WHERE phone = ? AND password = ?", (data.phone, pwd)).fetchone()
        conn.close()
    if user:
        if USE_POSTGRES: return {"status": "success", **dict(user)}
        return {"status": "success", "id": user["id"], "name": user["name"], "role": user["role"], "shop_name": user["shop_name"], "address": user["address"], "token": user["token"]}
    return {"error": "Invalid credentials"}

# ==================== PROFILE & STATS ====================
@app.get("/api/profile")
def get_profile(user_id: int, role: str):
    if USE_POSTGRES:
        cur, conn = get_db()
        if role == 'shopkeeper':
            cur.execute("SELECT id, name, phone, shop_name as name_detail, address FROM users WHERE id = %s", (user_id,))
            profile = cur.fetchone()
            cur.execute("SELECT COUNT(*) as total FROM orders WHERE shop_id = %s", (user_id,))
            stats = cur.fetchone()
            cur.execute("SELECT * FROM orders WHERE shop_id = %s ORDER BY created_at DESC LIMIT 10", (user_id,))
            recent = cur.fetchall(); cur.close(); conn.close()
            return {"profile": dict(profile), "total_orders": stats['total'], "recent_orders": [dict(r) for r in recent]}
        else:
            cur.execute("SELECT id, name, phone, address FROM users WHERE id = %s", (user_id,))
            profile = cur.fetchone(); cur.close(); conn.close()
            return {"profile": dict(profile)}
    else:
        conn, _ = get_db()
        if role == 'shopkeeper':
            profile = conn.execute("SELECT id, name, phone, shop_name as name_detail, address FROM users WHERE id = ?", (user_id,)).fetchone()
            stats = conn.execute("SELECT COUNT(*) as total FROM orders WHERE shop_id = ?", (user_id,)).fetchone()
            recent = conn.execute("SELECT * FROM orders WHERE shop_id = ? ORDER BY created_at DESC LIMIT 10", (user_id,)).fetchall(); conn.close()
            return {"profile": dict(profile), "total_orders": stats['total'], "recent_orders": [dict(r) for r in recent]}
        profile = conn.execute("SELECT id, name, phone, address FROM users WHERE id = ?", (user_id,)).fetchone(); conn.close()
        return {"profile": dict(profile)}

@app.post("/api/profile/update")
def update_profile(user_id: int, name: str, phone: str, address: str):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("UPDATE users SET name = %s, phone = %s, address = %s WHERE id = %s", (name, phone, address, user_id))
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?", (name, phone, address, user_id))
        conn.commit(); conn.close()
    return {"status": "updated"}

# ==================== SHOPS & CATEGORIES ====================
@app.get("/api/shops")
def get_shops():
    if USE_POSTGRES:
        cur, conn = get_db()
        shops = [dict(r) for r in cur.execute("SELECT id, name, shop_name, address FROM users WHERE role='shopkeeper'").fetchall()]
        cur.close(); conn.close(); return shops
    conn, _ = get_db()
    shops = [dict(r) for r in conn.execute("SELECT id, name, shop_name, address FROM users WHERE role='shopkeeper'").fetchall()]
    conn.close(); return shops

@app.get("/api/categories")
def get_categories(shop_id: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cats = [dict(r) for r in cur.execute("SELECT id, name FROM categories WHERE shop_id=%s ORDER BY name", (shop_id,)).fetchall()]
        cur.close(); conn.close(); return cats
    conn, _ = get_db()
    cats = [dict(r) for r in conn.execute("SELECT id, name FROM categories WHERE shop_id=? ORDER BY name", (shop_id,)).fetchall()]
    conn.close(); return cats

@app.post("/api/categories")
def add_category(shop_id: int, name: str):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("INSERT INTO categories (shop_id, name) VALUES (%s,%s)", (shop_id, name))
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("INSERT INTO categories (shop_id, name) VALUES (?,?)", (shop_id, name))
        conn.commit(); conn.close()
    return {"status": "added"}

# ==================== INVENTORY ====================
@app.get("/api/inventory")
def get_inventory(shop_id: int, category_id: int = None):
    if USE_POSTGRES:
        cur, conn = get_db()
        if category_id:
            res = [dict(r) for r in cur.execute("SELECT id, name, price, stock, category_id FROM inventory WHERE shop_id=%s AND category_id=%s ORDER BY name", (shop_id, category_id)).fetchall()]
        else:
            res = [dict(r) for r in cur.execute("SELECT id, name, price, stock, category_id FROM inventory WHERE shop_id=%s ORDER BY category_id, name", (shop_id,)).fetchall()]
        cur.close(); conn.close(); return res
    conn, _ = get_db()
    if category_id:
        res = [dict(r) for r in conn.execute("SELECT id, name, price, stock, category_id FROM inventory WHERE shop_id=? AND category_id=? ORDER BY name", (shop_id, category_id)).fetchall()]
    else:
        res = [dict(r) for r in conn.execute("SELECT id, name, price, stock, category_id FROM inventory WHERE shop_id=? ORDER BY category_id, name", (shop_id,)).fetchall()]
    conn.close(); return res

@app.post("/api/inventory/add")
def add_item(shop_id: int, name: str, price: int, stock: int, category_id: int = None):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("INSERT INTO inventory (shop_id, name, price, stock, category_id) VALUES (%s,%s,%s,%s,%s)", (shop_id, name, price, stock, category_id))
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("INSERT INTO inventory (shop_id, name, price, stock, category_id) VALUES (?,?,?,?,?)", (shop_id, name, price, stock, category_id))
        conn.commit(); conn.close()
    return {"status": "added"}

# ==================== ORDERS ====================
@app.post("/api/orders")
async def place_order(shop_id: int, item_id: int, customer_name: str, customer_phone: str, quantity: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("SELECT name, stock FROM inventory WHERE id = %s AND shop_id = %s", (item_id, shop_id))
        item = cur.fetchone()
        if not item or item['stock'] < quantity: cur.close(); conn.close(); return {"error": "Insufficient stock"}
        new = item['stock'] - quantity
        cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (new, item_id))
        cur.execute("INSERT INTO orders (shop_id, item_id, customer_name, customer_phone, quantity) VALUES (%s,%s,%s,%s,%s)", (shop_id, item_id, customer_name, customer_phone, quantity))
        conn.commit(); cur.close(); conn.close()
        return {"status": "order_placed", "item": item['name']}
    conn, _ = get_db()
    row = conn.execute("SELECT name, stock FROM inventory WHERE id = ? AND shop_id = ?", (item_id, shop_id)).fetchone()
    if not row or row["stock"] < quantity: conn.close(); return {"error": "Insufficient stock"}
    new = row["stock"] - quantity
    conn.execute("UPDATE inventory SET stock = ? WHERE id = ?", (new, item_id))
    conn.execute("INSERT INTO orders (shop_id, item_id, customer_name, customer_phone, quantity) VALUES (?,?,?,?,?)", (shop_id, item_id, customer_name, customer_phone, quantity))
    conn.commit(); conn.close()
    return {"status": "order_placed", "item": row["name"]}

@app.get("/api/orders")
def get_orders(shop_id: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        res = [dict(r) for r in cur.execute("SELECT * FROM orders WHERE shop_id=%s ORDER BY created_at DESC LIMIT 50", (shop_id,)).fetchall()]
        cur.close(); conn.close(); return res
    conn, _ = get_db()
    res = [dict(r) for r in conn.execute("SELECT * FROM orders WHERE shop_id=? ORDER BY created_at DESC LIMIT 50", (shop_id,)).fetchall()]
    conn.close(); return res

@app.get("/api/customer/orders")
def get_customer_orders(customer_phone: str):
    if USE_POSTGRES:
        cur, conn = get_db()
        res = [dict(r) for r in cur.execute("SELECT o.*, i.name as item_name FROM orders o JOIN inventory i ON o.item_id = i.id WHERE o.customer_phone = %s ORDER BY o.created_at DESC", (customer_phone,)).fetchall()]
        cur.close(); conn.close(); return res
    conn, _ = get_db()
    res = [dict(r) for r in conn.execute("SELECT o.*, i.name as item_name FROM orders o JOIN inventory i ON o.item_id = i.id WHERE o.customer_phone = ? ORDER BY o.created_at DESC", (customer_phone,)).fetchall()]
    conn.close(); return res

@app.websocket("/ws")
async def ws_ep(ws: WebSocket):
    class ConnManager:
        def __init__(self): self.active = []
        async def connect(self, w): await w.accept(); self.active.append(w)
        def disconnect(self, w):
            if w in self.active: self.active.remove(w)
        async def broadcast(self, msg):
            rem = []
            for c in self.active:
                try: await c.send_json(msg)
                except: rem.append(c)
            for c in rem: self.disconnect(c)
    manager = ConnManager()
    await manager.connect(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect: manager.disconnect(ws)

@app.get("/")
def root(): return {"status": "✅ KOTTU Multi-Shop Live"}