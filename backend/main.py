# backend/main.py
import os
import psycopg
from psycopg.rows import dict_row
import secrets
import hashlib
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="KOTTU Cloud Backend")

# ✅ CORS: Allow all origins for development (lock down later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔗 Cloud DB Connection Helper
def get_db():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable not set")
    conn = psycopg.connect(db_url, row_factory=dict_row)
    conn.autocommit = False
    cur = conn.cursor()
    return cur, conn

# 🗄️ Initialize Database Tables + Seed Data
def init_db():
    cur, conn = get_db()
    
    # 1. Users Table (NEW for Auth)
    cur.execute('''CREATE TABLE IF NOT EXISTS users 
                    (id SERIAL PRIMARY KEY, name TEXT, phone TEXT UNIQUE, password TEXT, 
                     role TEXT DEFAULT 'customer', shop_name TEXT, token TEXT)''')

    # 2. Inventory Table
    cur.execute('''CREATE TABLE IF NOT EXISTS inventory
                    (id SERIAL PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0)''')
    
    # 3. Orders Table
    cur.execute('''CREATE TABLE IF NOT EXISTS orders
                    (id SERIAL PRIMARY KEY, item_id INTEGER NOT NULL, customer_name TEXT NOT NULL, 
                     quantity INTEGER NOT NULL, status TEXT DEFAULT 'pending', 
                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                     FOREIGN KEY (item_id) REFERENCES inventory(id))''')
    
    # 4. Customers Table
    cur.execute('''CREATE TABLE IF NOT EXISTS customers
                    (id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, phone TEXT, credit_limit INTEGER DEFAULT 500)''')
    
    # 5. Udhaar Ledger Table
    cur.execute('''CREATE TABLE IF NOT EXISTS udhaar
                    (id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL, amount REAL NOT NULL, 
                     type TEXT CHECK(type IN ('credit','payment')) NOT NULL, note TEXT, 
                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                     FOREIGN KEY (customer_id) REFERENCES customers(id))''')
    
    # 6. Sales History Table
    cur.execute('''CREATE TABLE IF NOT EXISTS sales_history
                    (id SERIAL PRIMARY KEY, item_id INTEGER NOT NULL, quantity INTEGER NOT NULL, 
                     sale_date DATE DEFAULT CURRENT_DATE,
                     FOREIGN KEY (item_id) REFERENCES inventory(id))''')
    
    # --- Seed Inventory if Empty ---
    cur.execute("SELECT COUNT(*) FROM inventory")
    if cur.fetchone()['count'] == 0:
        items = [
            (1, "Milk (1L)", 60, 50),
            (2, "Bread", 40, 30),
            (3, "Eggs (6)", 45, 20),
            (4, "Atta (5kg)", 220, 15),
            (5, "Sugar (1kg)", 55, 10),
            (6, "Tea Powder (250g)", 85, 10)
        ]
        for item in items:
            cur.execute("INSERT INTO inventory (id, name, price, stock) VALUES (%s, %s, %s, %s)", item)
        conn.commit()
    
    # --- Seed Sample Customers if Empty ---
    cur.execute("SELECT COUNT(*) FROM customers")
    if cur.fetchone()['count'] == 0:
        customers = [
            ("Rahul", "9876543210", 500),
            ("Payamma", "9876543211", 1000),
            ("Suresh", "9876543212", 300)
        ]
        for c in customers:
            cur.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (%s, %s, %s)", c)
        conn.commit()
    
    cur.close()
    conn.close()
    print("✅ Database initialized successfully")

# 🚀 Run init_db on startup
@app.on_event("startup")
def on_startup():
    try:
        init_db()
        print("🟢 KOTTU Backend Started Successfully")
    except Exception as e:
        print(f"❌ DB Init Error: {e}")

# 🔌 WebSocket Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def broadcast(self, message: dict):
        disconnected = []
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except:
                disconnected.append(conn)
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()

# ==================== 🔐 AUTHENTICATION APIs ====================
@app.post("/api/auth/register")
def register(name: str = Query(...), phone: str = Query(...), password: str = Query(...), role: str = Query("customer"), shop_name: str = Query("")):
    # Simple hashing for MVP
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    token = secrets.token_urlsafe(32)
    try:
        cur, conn = get_db()
        cur.execute("INSERT INTO users (name, phone, password, role, shop_name, token) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id", 
                    (name, phone, pwd_hash, role, shop_name, token))
        user_id = cur.fetchone()['id']
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "user_id": user_id, "role": role, "token": token}
    except Exception as e:
        return {"error": "Phone already registered or invalid data"}

@app.post("/api/auth/login")
def login(phone: str = Query(...), password: str = Query(...)):
    pwd_hash = hashlib.sha256(password.encode()).hexdigest()
    cur, conn = get_db()
    cur.execute("SELECT id, name, role, shop_name, token FROM users WHERE phone = %s AND password = %s", (phone, pwd_hash))
    user = cur.fetchone()
    cur.close()
    conn.close()
    if user:
        return {"status": "success", **dict(user)}
    return {"error": "Invalid phone or password"}

# ==================== 📦 INVENTORY APIs ====================
@app.get("/api/inventory")
def get_inventory():
    cur, conn = get_db()
    cur.execute("SELECT id, name, price, stock FROM inventory ORDER BY name")
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
    return {"status": "updated", "item_id": item_id, "new_stock": stock}

# ==================== 🧾 ORDER APIs ====================
@app.post("/api/orders")
async def place_order(item_id: int, customer_name: str, quantity: int):
    cur, conn = get_db()
    
    # Check stock
    cur.execute("SELECT id, name, stock FROM inventory WHERE id = %s", (item_id,))
    item = cur.fetchone()
    if not item or item['stock'] < quantity:
        cur.close(); conn.close()
        return {"error": "Insufficient stock"}
    
    # Update inventory
    new_stock = item['stock'] - quantity
    cur.execute("UPDATE inventory SET stock = %s WHERE id = %s", (new_stock, item_id))
    
    # Create order
    cur.execute("INSERT INTO orders (item_id, customer_name, quantity) VALUES (%s, %s, %s)", (item_id, customer_name, quantity))
    # Log sale
    cur.execute("INSERT INTO sales_history (item_id, quantity) VALUES (%s, %s)", (item_id, quantity))
    
    conn.commit(); cur.close(); conn.close()
    await manager.broadcast({"type": "new_order", "item_id": item_id, "new_stock": new_stock})
    return {"status": "order_placed", "item": item['name'], "new_stock": new_stock}

@app.get("/api/orders")
def get_orders():
    cur, conn = get_db()
    cur.execute("SELECT * FROM orders ORDER BY created_at DESC LIMIT 50")
    orders = cur.fetchall()
    cur.close(); conn.close()
    return orders

# ==================== 👥 CUSTOMER & UDHAAR APIs ====================
@app.get("/api/customers")
def get_customers():
    cur, conn = get_db()
    cur.execute("SELECT id, name, phone, credit_limit FROM customers ORDER BY name")
    customers = cur.fetchall()
    
    # Calculate balance for each customer
    result = []
    for c in customers:
        cur.execute("SELECT SUM(CASE WHEN type='credit' THEN amount ELSE -amount END) as balance FROM udhaar WHERE customer_id = %s", (c['id'],))
        row = cur.fetchone()
        c_dict = dict(c)
        c_dict['balance'] = row['balance'] or 0
        result.append(c_dict)
    
    cur.close(); conn.close()
    return result

@app.post("/api/udhaar")
async def add_udhaar(customer_name: str = Query(...), amount: float = Query(...), type: str = Query(...), note: str = Query("")):
    try:
        cur, conn = get_db()
        cur.execute("SELECT id FROM customers WHERE name = %s", (customer_name.strip(),))
        cust = cur.fetchone()
        if not cust:
            cur.execute("INSERT INTO customers (name, phone, credit_limit) VALUES (%s, %s, %s)", (customer_name.strip(), "", 500))
            conn.commit()
            cur.execute("SELECT id FROM customers WHERE name = %s", (customer_name.strip(),))
            cust = cur.fetchone()
        if not cust: return {"error": "Customer creation failed"}
        if type not in ('credit', 'payment'): return {"error": "Type must be 'credit' or 'payment'"}
        
        cur.execute("INSERT INTO udhaar (customer_id, amount, type, note) VALUES (%s, %s, %s, %s)", (cust['id'], amount, type, note))
        conn.commit(); cur.close(); conn.close()
        await manager.broadcast({"type": "udhaar_update"})
        return {"status": "recorded", "customer": customer_name, "type": type, "amount": amount}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/udhaar/{customer_id}")
def get_udhaar_history(customer_id: int):
    cur, conn = get_db()
    cur.execute("SELECT * FROM udhaar WHERE customer_id = %s ORDER BY created_at DESC LIMIT 20", (customer_id,))
    history = cur.fetchall()
    cur.close(); conn.close()
    return history

# ==================== 🤖 AI DEMAND ALERT APIs ====================
@app.post("/api/sales/log")
async def log_sale(item_id: int, quantity: int):
    cur, conn = get_db()
    cur.execute("INSERT INTO sales_history (item_id, quantity) VALUES (%s, %s)", (item_id, quantity))
    conn.commit(); cur.close(); conn.close()
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

# ==================== 🔌 WEBSOCKET ENDPOINT ====================
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ==================== 🏠 HEALTH CHECK ====================
@app.get("/")
def root():
    return {
        "status": "✅ KOTTU Cloud Backend is running",
        "docs": "/docs",
        "endpoints": [
            "GET /api/inventory",
            "POST /api/inventory/update?item_id=&stock=",
            "POST /api/auth/register?name=&phone=&password=&role=...",
            "POST /api/auth/login?phone=&password="
        ]
    }