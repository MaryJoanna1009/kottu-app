# backend/main.py
import os
import sqlite3
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta

app = FastAPI(title="KOTTU Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 🔁 Auto-detect: Use PostgreSQL if DATABASE_URL exists, else SQLite
USE_POSTGRES = os.getenv("DATABASE_URL") is not None

def get_db():
    if USE_POSTGRES:
        db_url = os.getenv("DATABASE_URL")
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        cur = conn.cursor(cursor_factory=RealDictCursor)
        return cur, conn
    else:
        conn = sqlite3.connect("kottu.db")
        conn.row_factory = sqlite3.Row
        return conn, None  # SQLite doesn't need cursor/conn split

def init_db():
    if USE_POSTGRES:
        cur, conn = get_db()
        # PostgreSQL table creation
        cur.execute('''CREATE TABLE IF NOT EXISTS inventory (id SERIAL PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0)''')
        cur.execute('''CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, item_id INTEGER NOT NULL, customer_name TEXT NOT NULL, quantity INTEGER NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        cur.execute('''CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, phone TEXT, credit_limit INTEGER DEFAULT 500)''')
        cur.execute('''CREATE TABLE IF NOT EXISTS udhaar (id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL, amount REAL NOT NULL, type TEXT CHECK(type IN ('credit','payment')) NOT NULL, note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        cur.execute('''CREATE TABLE IF NOT EXISTS sales_history (id SERIAL PRIMARY KEY, item_id INTEGER NOT NULL, quantity INTEGER NOT NULL, sale_date DATE DEFAULT CURRENT_DATE)''')
        
        # Seed data
        cur.execute("SELECT COUNT(*) FROM inventory")
        if cur.fetchone()['count'] == 0:
            items = [(1, "Milk (1L)", 60, 50), (2, "Bread", 40, 30), (3, "Eggs (6)", 45, 20), (4, "Atta (5kg)", 220, 15), (5, "Sugar (1kg)", 55, 10), (6, "Tea Powder", 85, 10)]
            for item in items: cur.execute("INSERT INTO inventory (id, name, price, stock) VALUES (%s,%s,%s,%s)", item)
        cur.execute("SELECT COUNT(*) FROM customers")
        if cur.fetchone()['count'] == 0:
            for c in [("Rahul","9876543210",500), ("Payamma","9876543211",1000), ("Suresh","9876543212",300)]:
                cur.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (%s,%s,%s)", c)
        conn.commit()
        cur.close()
        conn.close()
    else:
        # SQLite table creation (your existing working code)
        conn = get_db()[0]
        conn.execute('''CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY, name TEXT, price INTEGER, stock INTEGER)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, customer_name TEXT, quantity INTEGER, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, phone TEXT, credit_limit INTEGER DEFAULT 500)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS udhaar (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, amount REAL, type TEXT CHECK(type IN ('credit','payment')), note TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS sales_history (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, quantity INTEGER, sale_date DATE DEFAULT CURRENT_DATE)''')
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

@app.on_event("startup")
def startup(): init_db(); print("✅ Database initialized")

class ConnectionManager:
    def __init__(self): self.connections = []
    async def connect(self, ws): await ws.accept(); self.connections.append(ws)
    def disconnect(self, ws): 
        if ws in self.connections: self.connections.remove(ws)
    async def broadcast(self, msg):
        for conn in self.connections:
            try: await conn.send_json(msg)
            except: self.disconnect(conn)
manager = ConnectionManager()

# ==================== APIs (Auto-detect DB) ====================
@app.get("/api/inventory")
def get_inventory():
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("SELECT id, name, price, stock FROM inventory ORDER BY name")
        items = [dict(row) for row in cur.fetchall()]
        cur.close(); conn.close()
        return items
    else:
        conn = get_db()[0]
        items = [dict(row) for row in conn.execute("SELECT * FROM inventory").fetchall()]
        conn.close()
        return items

@app.post("/api/inventory/update")
async def update_stock(item_id: int, stock: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (stock, item_id))
        conn.commit(); cur.close(); conn.close()
    else:
        conn = get_db()[0]
        conn.execute("UPDATE inventory SET stock = ? WHERE id = ?", (stock, item_id))
        conn.commit(); conn.close()
    await manager.broadcast({"type": "stock_update", "item_id": item_id, "new_stock": stock})
    return {"status": "updated"}

@app.post("/api/orders")
async def place_order(item_id: int, customer_name: str, quantity: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("SELECT id, name, stock FROM inventory WHERE id = %s", (item_id,))
        item = cur.fetchone()
        if not item or item['stock'] < quantity: cur.close(); conn.close(); return {"error": "Insufficient stock"}
        new_stock = item['stock'] - quantity
        cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (new_stock, item_id))
        cur.execute("INSERT INTO orders (item_id, customer_name, quantity) VALUES (%s, %s, %s)", (item_id, customer_name, quantity))
        cur.execute("INSERT INTO sales_history (item_id, quantity) VALUES (%s, %s)", (item_id, quantity))
        conn.commit(); cur.close(); conn.close()
        await manager.broadcast({"type": "new_order", "item_id": item_id, "new_stock": new_stock})
        return {"status": "order_placed", "item": item['name'], "new_stock": new_stock}
    else:
        conn = get_db()[0]
        row = conn.execute("SELECT stock, name FROM inventory WHERE id = ?", (item_id,)).fetchone()
        if not row or row["stock"] < quantity: conn.close(); return {"error": "Insufficient stock"}
        new_stock = row["stock"] - quantity
        conn.execute("UPDATE inventory SET stock = ? WHERE id = ?", (new_stock, item_id))
        conn.execute("INSERT INTO orders (item_id, customer_name, quantity) VALUES (?, ?, ?)", (item_id, customer_name, quantity))
        conn.execute("INSERT INTO sales_history (item_id, quantity) VALUES (?, ?)", (item_id, quantity))
        conn.commit(); conn.close()
        await manager.broadcast({"type": "new_order", "item_id": item_id, "new_stock": new_stock})
        return {"status": "order_placed", "item": row["name"], "new_stock": new_stock}

@app.get("/api/orders")
def get_orders():
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 50")
        orders = [dict(o) for o in cur.fetchall()]
        cur.close(); conn.close()
        return orders
    else:
        conn = get_db()[0]
        orders = [dict(row) for row in conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 20").fetchall()]
        conn.close()
        return orders

@app.get("/api/customers")
def get_customers():
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("SELECT id, name, phone, credit_limit FROM customers ORDER BY name")
        customers = cur.fetchall()
        result = []
        for c in customers:
            cur.execute("SELECT SUM(CASE WHEN type='credit' THEN amount ELSE -amount END) as balance FROM udhaar WHERE customer_id = %s", (c['id'],))
            row = cur.fetchone()
            c_dict = dict(c); c_dict['balance'] = row['balance'] or 0
            result.append(c_dict)
        cur.close(); conn.close()
        return result
    else:
        conn = get_db()[0]
        customers = [dict(row) for row in conn.execute("SELECT * FROM customers").fetchall()]
        for c in customers:
            ledger = conn.execute("SELECT SUM(CASE WHEN type='credit' THEN amount ELSE -amount END) as balance FROM udhaar WHERE customer_id=?", (c['id'],)).fetchone()
            c['balance'] = ledger['balance'] or 0
        conn.close()
        return customers

@app.post("/api/udhaar")
async def add_udhaar(customer_name: str = Query(...), amount: float = Query(...), type: str = Query(...), note: str = Query("")):
    try:
        if USE_POSTGRES:
            cur, conn = get_db()
            cur.execute("SELECT id FROM customers WHERE LOWER(name) = LOWER(%s)", (customer_name.strip(),))
            cust = cur.fetchone()
            if not cust:
                cur.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (%s, %s, %s)", (customer_name.strip(), "", 500))
                conn.commit()
                cur.execute("SELECT id FROM customers WHERE LOWER(name) = LOWER(%s)", (customer_name.strip(),))
                cust = cur.fetchone()
            if not cust: return {"error": "Could not create customer"}
            if type not in ('credit', 'payment'): return {"error": "Type must be 'credit' or 'payment'"}
            cur.execute("INSERT INTO udhaar (customer_id, amount, type, note) VALUES (%s, %s, %s, %s)", (cust['id'], amount, type, note))
            conn.commit(); cur.close(); conn.close()
        else:
            conn = get_db()[0]
            cust = conn.execute("SELECT id FROM customers WHERE name = ? COLLATE NOCASE", (customer_name.strip(),)).fetchone()
            if not cust:
                conn.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (?, ?, ?)", (customer_name.strip(), "", 500))
                conn.commit()
                cust = conn.execute("SELECT id FROM customers WHERE name = ? COLLATE NOCASE", (customer_name.strip(),)).fetchone()
            if not cust: return {"error": "Could not create customer"}
            if type not in ('credit', 'payment'): return {"error": "Type must be 'credit' or 'payment'"}
            conn.execute("INSERT INTO udhaar (customer_id, amount, type, note) VALUES (?, ?, ?, ?)", (cust['id'], amount, type, note))
            conn.commit(); conn.close()
        await manager.broadcast({"type": "udhaar_update"})
        return {"status": "recorded", "customer": customer_name, "type": type, "amount": amount}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/sales/log")
async def log_sale(item_id: int, quantity: int):
    if USE_POSTGRES:
        cur, conn = get_db()
        cur.execute("INSERT INTO sales_history (item_id, quantity) VALUES (%s, %s)", (item_id, quantity))
        conn.commit(); cur.close(); conn.close()
    else:
        conn = get_db()[0]
        conn.execute("INSERT INTO sales_history (item_id, quantity) VALUES (?, ?)", (item_id, quantity))
        conn.commit(); conn.close()
    return {"status": "logged"}

@app.get("/api/alerts")
def get_demand_alerts():
    if USE_POSTGRES:
        cur, conn = get_db()
        alerts = []; today = datetime.now().date(); last_week = today - timedelta(days=7)
        cur.execute("SELECT id, name, stock FROM inventory")
        items = cur.fetchall()
        for item in items:
            cur.execute("SELECT COALESCE(SUM(quantity), 0) as total FROM sales_history WHERE item_id = %s AND sale_date >= %s", (item['id'], last_week))
            this_week = cur.fetchone()['total']
            two_weeks_ago = last_week - timedelta(days=7)
            cur.execute("SELECT COALESCE(SUM(quantity), 0) as total FROM sales_history WHERE item_id = %s AND sale_date BETWEEN %s AND %s", (item['id'], two_weeks_ago, last_week))
            last_week_sales = cur.fetchone()['total']
            if last_week_sales > 0 and this_week > last_week_sales * 1.3:
                pct = int((this_week / last_week_sales - 1) * 100)
                alerts.append({"type":"demand_spike","item":item['name'],"message":f"📈 {item['name']} sales up {pct}% — restock soon!","priority":"high" if item['stock']<10 else "medium"})
            elif item['stock'] < 5 and this_week > 10:
                alerts.append({"type":"low_stock","item":item['name'],"message":f"⚠️ Only {item['stock']} {item['name']} left — high demand!","priority":"high"})
        cur.close(); conn.close()
        return alerts
    else:
        conn = get_db()[0]; alerts = []; today = datetime.now().date(); last_week = today - timedelta(days=7)
        items = conn.execute("SELECT id, name, stock FROM inventory").fetchall()
        for item in items:
            this_week = conn.execute("SELECT SUM(quantity) as total FROM sales_history WHERE item_id=? AND sale_date >= ?", (item['id'], last_week)).fetchone()['total'] or 0
            two_weeks_ago = last_week - timedelta(days=7)
            last_week_sales = conn.execute("SELECT SUM(quantity) as total FROM sales_history WHERE item_id=? AND sale_date BETWEEN ? AND ?", (item['id'], two_weeks_ago, last_week)).fetchone()['total'] or 0
            if last_week_sales > 0 and this_week > last_week_sales * 1.3:
                pct = int((this_week / last_week_sales - 1) * 100)
                alerts.append({"type":"demand_spike","item":item['name'],"message":f"📈 {item['name']} sales up {pct}% — restock soon!","priority":"high" if item['stock']<10 else "medium"})
            elif item['stock'] < 5 and this_week > 10:
                alerts.append({"type":"low_stock","item":item['name'],"message":f"⚠️ Only {item['stock']} {item['name']} left — high demand!","priority":"high"})
        conn.close()
        return alerts

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect: manager.disconnect(ws)

@app.get("/")
def root():
    return {"status": "✅ KOTTU Backend is running", "mode": "PostgreSQL" if USE_POSTGRES else "SQLite"}