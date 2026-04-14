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
        cur.execute("CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, shop_id INTEGER, customer_name TEXT, customer_phone TEXT DEFAULT '', customer_address TEXT DEFAULT '', status TEXT DEFAULT 'pending', is_viewed BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        cur.execute("CREATE TABLE IF NOT EXISTS order_items (id SERIAL PRIMARY KEY, order_id INTEGER, item_id INTEGER, item_name TEXT, quantity INTEGER, price INTEGER)")
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'customer', shop_name TEXT, address TEXT DEFAULT '', token TEXT)")
        conn.execute("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, name TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, category_id INTEGER, name TEXT, price INTEGER, stock INTEGER DEFAULT 0)")
        conn.execute("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, shop_id INTEGER, customer_name TEXT, customer_phone TEXT DEFAULT '', customer_address TEXT DEFAULT '', status TEXT DEFAULT 'pending', is_viewed INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, item_id INTEGER, item_name TEXT, quantity INTEGER, price INTEGER)")
        conn.commit(); conn.close()
    print(f"✅ Database initialized ({'PostgreSQL' if USE_POSTGRES else 'SQLite'})")

@app.on_event("startup")
def on_startup(): init_db()

# ==================== AUTH ====================
@app.post("/api/auth/register")
def register( data: RegisterData):
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
def login( data: LoginData):
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

# ==================== PROFILE ====================
@app.get("/api/profile")
def get_profile(user_id: int, role: str):
    if USE_POSTGRES:
        cur, conn = get_db()
        if role == 'shopkeeper':
            cur.execute("SELECT id, name, phone, shop_name, address FROM users WHERE id = %s", (user_id,))
        else:
            cur.execute("SELECT id, name, phone, address FROM users WHERE id = %s", (user_id,))
        profile = cur.fetchone(); cur.close(); conn.close()
        return {"profile": dict(profile)} if profile else None
    else:
        conn, _ = get_db()
        if role == 'shopkeeper':
            profile = conn.execute("SELECT id, name, phone, shop_name, address FROM users WHERE id = ?", (user_id,)).fetchone()
        else:
            profile = conn.execute("SELECT id, name, phone, address FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        return {"profile": dict(profile)} if profile else None

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
async def place_order(shop_id: int, item_id: int, customer_name: str, customer_phone: str, customer_address: str, quantity: int):
    try:
        if USE_POSTGRES:
            cur, conn = get_db()
            cur.execute("SELECT name, stock FROM inventory WHERE id = %s AND shop_id = %s", (item_id, shop_id))
            item = cur.fetchone()
            if not item or item['stock'] < quantity: cur.close(); conn.close(); return {"error": "Insufficient stock"}
            new = item['stock'] - quantity
            cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (new, item_id))
            cur.execute("INSERT INTO orders (shop_id, customer_name, customer_phone, customer_address, status, is_viewed) VALUES (%s,%s,%s,%s,'pending',FALSE) RETURNING id",
                       (shop_id, customer_name, customer_phone, customer_address))
            order_id = cur.fetchone()['id']
            cur.execute("INSERT INTO order_items (order_id, item_id, item_name, quantity, price) VALUES (%s,%s,%s,%s,%s)",
                       (order_id, item_id, item['name'], quantity, item['price']))
            conn.commit(); cur.close(); conn.close()
            return {"status": "order_placed", "order_id": order_id}
        else:
            conn, _ = get_db()
            row = conn.execute("SELECT name, stock FROM inventory WHERE id = ? AND shop_id = ?", (item_id, shop_id)).fetchone()
            if not row or row["stock"] < quantity: conn.close(); return {"error": "Insufficient stock"}
            new = row["stock"] - quantity
            conn.execute("UPDATE inventory SET stock = ? WHERE id = ?", (new, item_id))
            conn.execute("INSERT INTO orders (shop_id, customer_name, customer_phone, customer_address, status, is_viewed) VALUES (?,?,?,?,?,?)",
                        (shop_id, customer_name, customer_phone, customer_address, 'pending', 0))
            order_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            conn.execute("INSERT INTO order_items (order_id, item_id, item_name, quantity, price) VALUES (?,?,?,?,?)",
                        (order_id, item_id, row['name'], quantity, row['price']))
            conn.commit(); conn.close()
            return {"status": "order_placed", "order_id": order_id}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/order/detail")
def get_order_detail(order_id: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        order = cur.execute("SELECT o.*, u.shop_name, u.phone as shop_phone, u.address as shop_address FROM orders o JOIN users u ON o.shop_id = u.id WHERE o.id = %s", (order_id,)).fetchone()
        items = cur.execute("SELECT item_name, quantity, price FROM order_items WHERE order_id=%s", (order_id,)).fetchall()
        cur.close(); conn.close()
        return {"order": dict(order), "items": [dict(i) for i in items]} if order else None
    else:
        conn, _ = get_db()
        order = conn.execute("SELECT o.*, u.shop_name, u.phone as shop_phone, u.address as shop_address FROM orders o JOIN users u ON o.shop_id = u.id WHERE o.id = ?", (order_id,)).fetchone()
        items = conn.execute("SELECT item_name, quantity, price FROM order_items WHERE order_id=?", (order_id,)).fetchall()
        conn.close()
        return {"order": dict(order), "items": [dict(i) for i in items]} if order else None

@app.get("/api/orders")
def get_orders(shop_id: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        orders = cur.execute("SELECT id, customer_name, customer_phone, status, is_viewed, created_at FROM orders WHERE shop_id=%s ORDER BY created_at DESC", (shop_id,)).fetchall()
        result = []
        for order in orders:
            order_dict = dict(order)
            items = cur.execute("SELECT item_name, quantity FROM order_items WHERE order_id=%s", (order_dict['id'],)).fetchall()
            order_dict['items'] = [dict(i) for i in items]
            result.append(order_dict)
        cur.close(); conn.close()
        return result
    else:
        conn, _ = get_db()
        orders = conn.execute("SELECT id, customer_name, customer_phone, status, is_viewed, created_at FROM orders WHERE shop_id=? ORDER BY created_at DESC", (shop_id,)).fetchall()
        result = []
        for order in orders:
            order_dict = dict(order)
            items = conn.execute("SELECT item_name, quantity FROM order_items WHERE order_id=?", (order_dict['id'],)).fetchall()
            order_dict['items'] = [dict(i) for i in items]
            result.append(order_dict)
        conn.close()
        return result

@app.get("/api/customer/orders")
def get_customer_orders(customer_phone: str):
    if USE_POSTGRES:
        cur, conn = get_db()
        orders = cur.execute("SELECT id, shop_id, status, created_at FROM orders WHERE customer_phone = %s ORDER BY created_at DESC", (customer_phone,)).fetchall()
        result = []
        for order in orders:
            order_dict = dict(order)
            shop = cur.execute("SELECT shop_name, address, phone FROM users WHERE id = %s", (order_dict['shop_id'],)).fetchone()
            order_dict['shop_name'] = shop['shop_name'] if shop else 'Unknown'
            order_dict['shop_address'] = shop['address'] if shop else ''
            order_dict['shop_phone'] = shop['phone'] if shop else ''
            items = cur.execute("SELECT item_name, quantity, price FROM order_items WHERE order_id = %s", (order_dict['id'],)).fetchall()
            order_dict['items'] = [dict(i) for i in items]
            result.append(order_dict)
        cur.close(); conn.close()
        return result
    else:
        conn, _ = get_db()
        orders = conn.execute("SELECT id, shop_id, status, created_at FROM orders WHERE customer_phone = ? ORDER BY created_at DESC", (customer_phone,)).fetchall()
        result = []
        for order in orders:
            order_dict = dict(order)
            shop = conn.execute("SELECT shop_name, address, phone FROM users WHERE id = ?", (order_dict['shop_id'],)).fetchone()
            order_dict['shop_name'] = shop['shop_name'] if shop else 'Unknown'
            order_dict['shop_address'] = shop['address'] if shop else ''
            order_dict['shop_phone'] = shop['phone'] if shop else ''
            items = conn.execute("SELECT item_name, quantity, price FROM order_items WHERE order_id = ?", (order_dict['id'],)).fetchall()
            order_dict['items'] = [dict(i) for i in items]
            result.append(order_dict)
        conn.close()
        return result

@app.post("/api/order/update-status")
def update_order_status(order_id: int, status: str):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("UPDATE orders SET status = %s WHERE id = %s", (status, order_id))
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
        conn.commit(); conn.close()
    return {"status": "updated"}

@app.post("/api/order/mark-viewed")
def mark_order_viewed(order_id: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("UPDATE orders SET is_viewed = TRUE WHERE id = %s", (order_id,))
        conn.commit(); cur.close(); conn.close()
    else:
        conn, _ = get_db()
        conn.execute("UPDATE orders SET is_viewed = 1 WHERE id = ?", (order_id,))
        conn.commit(); conn.close()
    return {"status": "marked"}

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