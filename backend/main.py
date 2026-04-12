# backend/main.py
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta

app = FastAPI(title="KOTTU Cloud Backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 🔗 Cloud DB Connection
def get_db():
    db_url = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)
    return cur, conn

def init_db():
    cur, conn = get_db()
    cur.execute('''CREATE TABLE IF NOT EXISTS inventory
                    (id SERIAL PRIMARY KEY, name TEXT, price INTEGER, stock INTEGER)''')
    cur.execute('''CREATE TABLE IF NOT EXISTS orders
                    (id SERIAL PRIMARY KEY, item_id INTEGER, customer_name TEXT, 
                     quantity INTEGER, status TEXT DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    cur.execute('''CREATE TABLE IF NOT EXISTS customers
                    (id SERIAL PRIMARY KEY, name TEXT UNIQUE, phone TEXT, credit_limit INTEGER DEFAULT 500)''')
    cur.execute('''CREATE TABLE IF NOT EXISTS udhaar
                    (id SERIAL PRIMARY KEY, customer_id INTEGER, amount REAL, 
                     type TEXT CHECK(type IN ('credit','payment')), note TEXT, 
                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                     FOREIGN KEY (customer_id) REFERENCES customers(id))''')
    cur.execute('''CREATE TABLE IF NOT EXISTS sales_history
                    (id SERIAL PRIMARY KEY, item_id INTEGER, quantity INTEGER, 
                     sale_date DATE DEFAULT CURRENT_DATE,
                     FOREIGN KEY (item_id) REFERENCES inventory(id))''')

    # Seed inventory if empty
    cur.execute("SELECT COUNT(*) FROM inventory")
    if cur.fetchone()['count'] == 0:
        items = [
            (1, "Milk (1L)", 60, 50), (2, "Bread", 40, 30), (3, "Eggs (6)", 45, 20),
            (4, "Atta (5kg)", 220, 15), (5, "Sugar (1kg)", 55, 10), (6, "Tea Powder", 85, 10)
        ]
        for item in items:
            cur.execute("INSERT INTO inventory (id, name, price, stock) VALUES (%s,%s,%s,%s)", item)
        conn.commit()

    # Seed customers if empty
    cur.execute("SELECT COUNT(*) FROM customers")
    if cur.fetchone()['count'] == 0:
        customers = [
            ("Rahul", "9876543210", 500),
            ("Payamma", "9876543211", 1000),
            ("Suresh", "9876543212", 300)
        ]
        for c in customers:
            cur.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (%s,%s,%s)", c)
        conn.commit()
    
    cur.close()
    conn.close()

@app.on_event("startup")
def startup():
    init_db()
    print("✅ Cloud DB Initialized")

# 🔌 WebSocket Manager
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

# ==================== APIs ====================
@app.get("/api/inventory")
def get_inventory():
    cur, conn = get_db()
    cur.execute("SELECT * FROM inventory")
    items = cur.fetchall()
    cur.close(); conn.close()
    return items

@app.post("/api/inventory/update")
async def update_stock(item_id: int, stock: int):
    cur, conn = get_db()
    cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (stock, item_id))
    conn.commit()
    cur.close(); conn.close()
    await manager.broadcast({"type": "stock_update", "item_id": item_id, "new_stock": stock})
    return {"status": "updated"}

@app.post("/api/orders")
async def place_order(item_id: int, customer_name: str, quantity: int):
    cur, conn = get_db()
    cur.execute("SELECT stock, name FROM inventory WHERE id = %s", (item_id,))
    row = cur.fetchone()
    if not row or row['stock'] < quantity:
        cur.close(); conn.close()
        return {"error": "Insufficient stock"}
    
    new_stock = row['stock'] - quantity
    cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (new_stock, item_id))
    cur.execute("INSERT INTO orders (item_id, customer_name, quantity) VALUES (%s, %s, %s)", (item_id, customer_name, quantity))
    cur.execute("INSERT INTO sales_history (item_id, quantity) VALUES (%s, %s)", (item_id, quantity))
    conn.commit()
    cur.close(); conn.close()
    await manager.broadcast({"type": "new_order", "item_id": item_id, "new_stock": new_stock})
    return {"status": "order_placed", "item": row['name']}

@app.get("/api/orders")
def get_orders():
    cur, conn = get_db()
    cur.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 20")
    orders = cur.fetchall()
    cur.close(); conn.close()
    return orders

@app.get("/api/customers")
def get_customers():
    cur, conn = get_db()
    cur.execute("SELECT * FROM customers")
    customers = cur.fetchall()
    for c in customers:
        cur.execute("SELECT SUM(CASE WHEN type='credit' THEN amount ELSE -amount END) as balance FROM udhaar WHERE customer_id=%s", (c['id'],))
        row = cur.fetchone()
        c['balance'] = row['balance'] or 0
    cur.close(); conn.close()
    return customers

@app.post("/api/udhaar")
async def add_udhaar(customer_name: str = Query(...), amount: float = Query(...), type: str = Query(...), note: str = Query("")):
    try:
        cur, conn = get_db()
        cur.execute("SELECT id FROM customers WHERE name = %s COLLATE \"C\"", (customer_name.strip(),))
        cust = cur.fetchone()
        if not cust:
            cur.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (%s, %s, %s)", (customer_name.strip(), "", 500))
            conn.commit()
            cur.execute("SELECT id FROM customers WHERE name = %s", (customer_name.strip(),))
            cust = cur.fetchone()
        if not cust: return {"error": "Customer creation failed"}
        if type not in ('credit','payment'): return {"error": "Invalid type"}
        
        cur.execute("INSERT INTO udhaar (customer_id, amount, type, note) VALUES (%s, %s, %s, %s)", (cust['id'], amount, type, note))
        conn.commit()
        cur.close(); conn.close()
        await manager.broadcast({"type": "udhaar_update"})
        return {"status": "recorded", "customer": customer_name, "type": type, "amount": amount}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/sales/log")
async def log_sale(item_id: int, quantity: int):
    cur, conn = get_db()
    cur.execute("INSERT INTO sales_history (item_id, quantity) VALUES (%s, %s)", (item_id, quantity))
    conn.commit()
    cur.close(); conn.close()
    return {"status": "logged"}

@app.get("/api/alerts")
def get_demand_alerts():
    cur, conn = get_db()
    alerts = []
    today = datetime.now().date()
    last_week = today - timedelta(days=7)
    
    cur.execute("SELECT id, name, stock FROM inventory")
    items = cur.fetchall()
    for item in items:
        cur.execute("SELECT SUM(quantity) as total FROM sales_history WHERE item_id=%s AND sale_date >= %s", (item['id'], last_week))
        this_week = (cur.fetchone() or {})['total'] or 0
        
        two_weeks_ago = last_week - timedelta(days=7)
        cur.execute("SELECT SUM(quantity) as total FROM sales_history WHERE item_id=%s AND sale_date BETWEEN %s AND %s", (item['id'], two_weeks_ago, last_week))
        last_week_sales = (cur.fetchone() or {})['total'] or 0
        
        if last_week_sales > 0 and this_week > last_week_sales * 1.3:
            alerts.append({"type":"demand_spike","item":item['name'],"message":f"📈 {item['name']} sales up {int((this_week/last_week_sales-1)*100)}% — restock soon!","priority":"high" if item['stock']<10 else "medium"})
        elif item['stock'] < 5 and this_week > 10:
            alerts.append({"type":"low_stock","item":item['name'],"message":f"⚠️ Only {item['stock']} {item['name']} left — high demand!","priority":"high"})
    
    cur.close(); conn.close()
    return alerts

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect: manager.disconnect(ws)